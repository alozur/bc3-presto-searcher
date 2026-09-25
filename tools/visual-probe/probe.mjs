#!/usr/bin/env node
/**
 * Visual probe: drives the *built* renderer in headless Chromium and screenshots every
 * reachable visual state of the catalog screen.
 *
 * Why this exists: the renderer's 22 tests assert behaviour and DOM structure, and the
 * two CSS rules they read by regex are asserted as text. Nothing in the suite can see a
 * screen. A progress bar that renders as an empty track, a table cell that wraps into two
 * unrelated numbers, or a button slab that drowns out its own label all pass 116 tests.
 * This tool is the missing sense organ.
 *
 * It is deliberately not part of `pnpm test` or CI: it needs a Chromium binary and a
 * built `dist/`. Run it by hand after touching anything visual.
 *
 *   pnpm build && pnpm probe
 *
 * The injected `window.presto` stub is installed over CDP *before* the bundle evaluates,
 * so the real application code, the real React tree, the real CSS and the real event
 * handling are exercised. Nothing about the app is mocked inside the app.
 */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// --------------------------------------------------------------------------------------
// Sample catalog
//
// Realistic Guadalajara-2016 shaped data, not real source extracts: the repository must
// never carry approved BC3 content. Edit these to probe a different visual case (a long
// description, a missing unit, a wrapped component name).
// --------------------------------------------------------------------------------------

const SOURCE_EU = 'guadalajara-2016-eu';
const SOURCE_RM = 'guadalajara-2016-rm';
const SOURCE_EU_NAME = 'Guadalajara2016_e+u.bc3';
const SOURCE_RM_NAME = 'Guadalajara2016_r+m.bc3';

// Two distinct source keys so the probe always covers the same-code, different-source case
// that the renderer has to disambiguate with unique disclosure ids.
const CATALOG = [
  {
    ref: { source: SOURCE_EU, codeKey: 'e11xm020' },
    kind: 'partida',
    code: 'E11XM020',
    description: 'Muro de fábrica de ladrillo perforado de ½ pie, de 11,5 cm de espesor, recibido con mortero de cemento industrial, con armado a base de cercos y jambas, incluso replanteo, nivelación y limpieza.',
    unit: 'm2',
    price: '34,72',
    keywords: [],
    expandedText: '',
    sourceDisplayName: SOURCE_EU_NAME,
  },
  {
    ref: { source: SOURCE_RM, codeKey: 'e04cm030' },
    kind: 'resource',
    code: 'E04CM030',
    description: 'Hormigón en masa HM-20/B/40/I, con tamaño máximo del árido de 40 mm, según RC-03, puesto en obra por medios manuales.',
    unit: 'm3',
    price: '58,90',
    keywords: [],
    expandedText: '',
    sourceDisplayName: SOURCE_RM_NAME,
  },
  {
    ref: { source: SOURCE_EU, codeKey: 'o01oa070' },
    kind: 'resource',
    code: 'O01OA070',
    description: 'Oficial 1ª construcción.',
    unit: 'h',
    price: '18,42',
    keywords: [],
    expandedText: '',
    sourceDisplayName: SOURCE_EU_NAME,
  },
  {
    ref: { source: SOURCE_EU, codeKey: 'a01.01' },
    kind: 'partida',
    code: 'A01.01',
    description: 'Excavación en zanjas para instalaciones en terreno compacto, con medios mecánicos, incluso refino de fondos y perfilado de taludes.',
    unit: 'm3',
    price: '12,05',
    keywords: [],
    expandedText: '',
    sourceDisplayName: SOURCE_EU_NAME,
  },
];

function component(code) {
  const item = CATALOG.find((candidate) => candidate.code === code);
  return { code: item.code, kind: item.kind, description: item.description, unit: item.unit, unitPrice: item.price };
}

// Three breakdown lines chosen to cover every branch of `presentBreakdownQuantity`
// (`src/renderer/productivity.ts`): a non-hour component ("No aplica"), an hour component
// (a computed daily yield) and a large quantity.
const PARTIDA_DETAIL = {
  kind: 'partida',
  item: CATALOG[0],
  breakdown: [
    { ordinal: 0, sourceLine: 41207, component: component('A01.01'), factor: '1.000', yield: '0.020' },
    { ordinal: 1, sourceLine: 41209, component: component('O01OA070'), factor: '1.000', yield: '0.300' },
    { ordinal: 2, sourceLine: 41211, component: component('E04CM030'), factor: '1.000', yield: '66.000' },
  ],
};

// Three diagnostics to cover the panel's contract: a short message, a message with extra
// fields, and a deliberately long filename plus long message that must wrap without
// introducing horizontal scrolling.
const IMPORT_OUTCOME = {
  source: SOURCE_EU,
  sourceDisplayName: SOURCE_EU_NAME,
  importedPartidas: 12345,
  importedResources: 41230,
  skippedRecords: 7,
  diagnostics: [
    { code: 'unsupported-record', sourceDisplayName: SOURCE_EU_NAME, line: 41207, recordTag: 'X', messageEs: 'Registro ~X no soportado y omitido durante la importación.' },
    { code: 'unresolved-child', sourceDisplayName: SOURCE_EU_NAME, line: 88412, recordTag: 'D', parentCode: 'E11XM020', childCode: 'P01LH999', messageEs: 'Línea de descomposición omitida: el componente hijo no existe en el catálogo. Hijo: P01LH999.' },
    { code: 'empty-price', sourceDisplayName: 'a-very-long-filename-that-must-remain-readable-without-horizontal-scrolling.bc3', line: 120033, recordTag: 'P', messageEs: 'Precio vacío importado como 0 para conservar la partida: este mensaje de diagnóstico es deliberadamente largo para comprobar que se ajusta sin scroll horizontal.' },
  ],
  completedAt: '2025-01-01T00:00:00.000Z',
};

/**
 * Source of the `window.presto` stub, installed before the app bundle evaluates.
 *
 * `?scene=` selects the import behaviour, because the import flow has states that only
 * exist while a promise is pending: a resolved stub can never show progress.
 */
const STUB_SOURCE = `
const scene = new URLSearchParams(location.search).get('scene') || 'initial';
window.__importProgressSink = null;
window.presto = {
  onImportProgress(callback) {
    window.__importProgressSink = callback;
    return () => { window.__importProgressSink = null; };
  },
  importApprovedSource() {
    if (scene === 'progress') {
      const TOTAL = 193127;
      setTimeout(() => window.__importProgressSink?.({ stage: 'processing-records', completed: 41230, total: TOTAL }), 200);
      setTimeout(() => window.__importProgressSink?.({ stage: 'processing-records', completed: 96563, total: TOTAL }), 500);
      return new Promise(() => {});
    }
    if (scene === 'relations') {
      setTimeout(() => window.__importProgressSink?.({ stage: 'validating-relations' }), 200);
      return new Promise(() => {});
    }
    return Promise.resolve(${JSON.stringify(IMPORT_OUTCOME)});
  },
  async search() {
    return { status: 'ok', items: ${JSON.stringify(CATALOG)} };
  },
  async getDetail(ref) {
    if (ref.codeKey === ${JSON.stringify(CATALOG[0].ref.codeKey)}) return ${JSON.stringify(PARTIDA_DETAIL)};
    return { kind: 'resource', item: ${JSON.stringify(CATALOG)}.find((item) => item.ref.codeKey === ref.codeKey) };
  },
};
`;

// --------------------------------------------------------------------------------------
// Scenes
//
// Each scene is one navigation plus optional driving, then one or more screenshots.
// `expect` turns a screenshot into a check: a missing selector fails the run.
// --------------------------------------------------------------------------------------

const SCENES = [
  {
    name: 'inicial',
    stub: 'initial',
    description: 'Page at rest: masthead, import panel, empty search panel.',
    shots: [
      { name: '01-inicial', width: 1280, height: 900 },
      { name: '02-inicial-angosto', width: 760, height: 900 },
    ],
  },
  {
    name: 'importacion-en-curso',
    stub: 'progress',
    description: 'Determinate progress, elapsed time, 10% milestones, stage checklist.',
    expect: ['progress[aria-label="Progreso de procesamiento de registros"]', 'ul[aria-label="Hitos de importación"]', 'ol[aria-label="Etapas de importación"]'],
    drive: async ({ click }) => {
      await click('button[aria-label="Importar catálogo"]');
      await delay(900);
    },
    shots: [{ name: '03-importacion-en-curso', width: 1280, height: 900 }],
  },
  {
    name: 'importacion-validando',
    stub: 'relations',
    description: 'Indeterminate progress. Sampled over time, because a bar that renders as an empty track still looks plausible in a single frame.',
    expect: ['progress[aria-label="Progreso de validación de relaciones"]'],
    drive: async ({ click }) => {
      await click('button[aria-label="Importar catálogo"]');
      await delay(700);
    },
    samples: { name: '04b-barra-indeterminada', selector: 'progress', count: 6, gapMs: 220 },
    shots: [{ name: '04-importacion-validando', width: 1280, height: 900 }],
  },
  {
    name: 'importacion-resultado',
    stub: 'initial',
    description: 'Import outcome card with the diagnostics panel and its long wrapped names.',
    expect: ['div[role="status"]', 'section.import-diagnostics-panel'],
    drive: async ({ click }) => {
      await click('button[aria-label="Importar catálogo"]');
      await delay(500);
    },
    shots: [{ name: '05-importacion-resultado', width: 1280, height: 900 }],
  },
  {
    name: 'resultados-y-detalle',
    stub: 'initial',
    description: 'Result rows with hover, then the expanded partida detail, at two widths.',
    expect: ['ul[aria-label="Resultados de búsqueda"]'],
    drive: async ({ type, click, hover }) => {
      await type('muro ladrillo');
      await click('button[aria-label="Buscar"]');
      await delay(400);
      await hover('ul[aria-label="Resultados de búsqueda"] li', 1);
    },
    shots: [{ name: '06-resultados-hover', width: 1280, height: 900 }],
    then: async ({ click }) => {
      await click('button[aria-label="Ver detalle E11XM020"]');
      await delay(400);
    },
    thenExpect: ['section.result-detail', 'section.result-detail table'],
    thenShots: [
      { name: '07-detalle-partida', width: 1280, height: 900 },
      { name: '08-detalle-angosto', width: 760, height: 900 },
    ],
  },
  {
    name: 'alerta',
    stub: 'initial',
    description: 'Rejected search, to check the danger alert treatment.',
    expect: ['p[role="alert"]'],
    drive: async ({ type, click, evaluate }) => {
      await evaluate('window.presto.search = async () => { throw new Error("probe"); }');
      await type('algo');
      await click('button[aria-label="Buscar"]');
      await delay(300);
    },
    shots: [{ name: '09-alerta-error', width: 1280, height: 900 }],
  },
];

// --------------------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------------------

const HELP = `Visual probe for the PrestoSearch renderer.

Usage:
  pnpm build && pnpm probe [options]

Options:
  --list                List the available scenes and exit.
  --scene <name>        Run only this scene (repeatable).
  --out <dir>           Screenshot directory. Default: .visual-probe/ in the repo root.
  --dist <dir>          Built renderer to serve. Default: dist/ in the repo root.
  --keep-profile        Keep the Chromium profile directory for debugging.
  --port <n>            Static server port. Default: 8731.
  --cdp-port <n>        Chromium DevTools port. Default: 9223.
  -h, --help            Show this help.

Requires a Chromium binary: set CHROME_PATH, or have one of
chromium / chromium-browser / google-chrome / google-chrome-stable / microsoft-edge
on PATH.`;

function parseArgs(argv) {
  const options = { scenes: [], out: path.join(REPO_ROOT, '.visual-probe'), dist: path.join(REPO_ROOT, 'dist'), port: 8731, cdpPort: 9223, keepProfile: false, list: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`${argument} needs a value`);
      return next;
    };
    switch (argument) {
      case '--list': options.list = true; break;
      case '--keep-profile': options.keepProfile = true; break;
      case '--scene': options.scenes.push(value()); break;
      case '--out': options.out = path.resolve(value()); break;
      case '--dist': options.dist = path.resolve(value()); break;
      case '--port': options.port = Number(value()); break;
      case '--cdp-port': options.cdpPort = Number(value()); break;
      case '-h': case '--help': options.help = true; break;
      default: throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

// --------------------------------------------------------------------------------------
// Preflight
// --------------------------------------------------------------------------------------

function findChromium() {
  const candidates = process.platform === 'win32'
    ? ['chrome.exe', 'chromium.exe', 'msedge.exe']
    : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge'];
  const configured = process.env.CHROME_PATH?.trim();
  for (const candidate of [configured, ...candidates].filter(Boolean)) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

async function newestMtime(directory) {
  let newest = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, await newestMtime(full));
    else newest = Math.max(newest, (await stat(full)).mtimeMs);
  }
  return newest;
}

/**
 * A stale `dist/` silently screenshots the *previous* UI, which is the most expensive
 * mistake this tool can make: the images look fine and describe code that no longer
 * exists. Warn loudly rather than failing, so an intentional before/after comparison
 * stays possible.
 */
async function warnIfStale(distDirectory) {
  const built = (await stat(path.join(distDirectory, 'index.html'))).mtimeMs;
  const newestSource = Math.max(
    await newestMtime(path.join(REPO_ROOT, 'src', 'renderer')),
    (await stat(path.join(REPO_ROOT, 'index.html'))).mtimeMs,
  );
  if (newestSource > built) {
    console.warn(`\n  ADVERTENCIA: dist/ es mas viejo que el codigo fuente.`);
    console.warn(`  Corré "pnpm build" o vas a capturar la UI anterior.\n`);
  }
}

// --------------------------------------------------------------------------------------
// Static server for the built renderer
// --------------------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function serveDirectory(root, port) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const relative = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(root, path.normalize(relative).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// --------------------------------------------------------------------------------------
// Chrome DevTools Protocol client
// --------------------------------------------------------------------------------------

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.lastId = 0;
    this.pending = new Map();
    this.waiters = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error)})`));
        else resolve(message.result);
        return;
      }
      if (message.method) {
        this.waiters = this.waiters.filter((waiter) => {
          if (waiter.method !== message.method) return true;
          waiter.resolve(message.params);
          return false;
        });
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.lastId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
      this.waiters.push({ method, resolve: (params) => { clearTimeout(timer); resolve(params); } });
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`);
    return result.result.value;
  }

  async click(selector) {
    const clicked = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    })()`);
    if (!clicked) throw new Error(`click: no element for ${selector}`);
    await delay(250);
  }

  /** Types into the search field the way a user does: native setter plus an input event. */
  async type(text) {
    const typed = await this.evaluate(`(() => {
      const input = document.querySelector('#search-query');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!typed) throw new Error('type: no #search-query input');
    await delay(120);
  }

  async hover(selector, index = 0) {
    const box = await this.evaluate(`(() => {
      const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (!box) throw new Error(`hover: no element ${index} for ${selector}`);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await delay(150);
  }

  async box(selector) {
    return this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    })()`);
  }
}

async function openChromium(binary, cdpPort, profileDirectory) {  const process_ = spawn(binary, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  process_.stderr.on('data', (chunk) => { stderr += chunk; });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const page = (await response.json()).find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return { process: process_, webSocketUrl: page.webSocketDebuggerUrl, stderr: () => stderr };
    } catch {
      /* chromium is still starting */
    }
    await delay(250);
  }
  process_.kill('SIGKILL');
  throw new Error(`Chromium never exposed a DevTools page target.\n${stderr.trim().split('\n').slice(-5).join('\n')}`);
}

/**
 * `kill()` only *requests* termination, so deleting the profile immediately afterwards
 * races a dying process that recreates `Default/` on its way out. Wait for the exit event
 * (with a ceiling, in case a process never reaps) before removing anything.
 */
function terminated(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

// --------------------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------------------

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return new CdpClient(socket);
}

async function navigate(client, url) {
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
  const mounted = await client.evaluate(`new Promise((resolve) => {
    const timer = setInterval(() => {
      if (document.querySelector('main')) { clearInterval(timer); resolve(true); }
    }, 50);
    setTimeout(() => { clearInterval(timer); resolve(false); }, 8000);
  })`);
  if (!mounted) throw new Error(`the app never rendered <main> at ${url}`);
  await delay(300);
}

async function screenshot(client, outputDirectory, shot) {
  // `clip.scale` is mandatory in this CDP schema and is multiplied by the device scale
  // factor set above, so it must be an explicit 1: omitting it is a protocol error and
  // passing 2 as well would quietly produce 4x images.
  await client.send('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: 2, mobile: false });
  await delay(350);
  const metrics = await client.send('Page.getLayoutMetrics');
  const content = metrics.cssContentSize ?? metrics.contentSize;
  const full = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(content.width), height: Math.ceil(content.height), scale: 1 },
  });
  const viewport = await client.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(outputDirectory, `${shot.name}.png`), Buffer.from(full.data, 'base64'));
  await writeFile(path.join(outputDirectory, `${shot.name}--viewport.png`), Buffer.from(viewport.data, 'base64'));
  console.log(`    ${shot.name.padEnd(30)} ${Math.ceil(content.width)}x${Math.ceil(content.height)} css px`);
}

async function sampleOverTime(client, outputDirectory, sample) {
  const box = await client.box(sample.selector);
  if (!box) throw new Error(`sample: no element for ${sample.selector}`);
  for (let index = 0; index < sample.count; index += 1) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    await writeFile(path.join(outputDirectory, `${sample.name}-t${index}.png`), Buffer.from(shot.data, 'base64'));
    await delay(sample.gapMs);
  }
  console.log(`    ${sample.name.padEnd(30)} ${sample.count} samples every ${sample.gapMs} ms`);
}

async function runScene(client, scene, options, baseUrl, failures) {
  console.log(`\n  ${scene.name}\n    ${scene.description}`);
  await navigate(client, `${baseUrl}/?scene=${scene.stub}`);

  const installed = await client.evaluate('Boolean(window.presto && window.presto.search)');
  if (!installed) {
    failures.push(`${scene.name}: the window.presto stub was not installed before the bundle evaluated`);
    return;
  }

  const helpers = {
    click: (selector) => client.click(selector),
    type: (text) => client.type(text),
    hover: (selector, index) => client.hover(selector, index),
    evaluate: (expression) => client.evaluate(expression),
  };

  if (scene.drive) await scene.drive(helpers);
  for (const selector of scene.expect ?? []) {
    const present = await client.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (!present) failures.push(`${scene.name}: expected ${selector} to be present`);
    console.log(`    ${present ? 'ok  ' : 'FALLA'} ${selector}`);
  }
  for (const shot of scene.shots ?? []) await screenshot(client, options.out, shot);
  if (scene.samples) await sampleOverTime(client, options.out, scene.samples);

  if (scene.then) {
    await scene.then(helpers);
    for (const selector of scene.thenExpect ?? []) {
      const present = await client.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (!present) failures.push(`${scene.name} (then): expected ${selector} to be present`);
      console.log(`    ${present ? 'ok  ' : 'FALLA'} ${selector}`);
    }
    for (const shot of scene.thenShots ?? []) await screenshot(client, options.out, shot);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (options.list) {
    for (const scene of SCENES) console.log(`${scene.name.padEnd(24)} ${scene.description}`);
    return 0;
  }

  const selected = options.scenes.length > 0 ? SCENES.filter((scene) => options.scenes.includes(scene.name)) : SCENES;
  if (selected.length === 0) {
    console.error(`No scene matched. Run "pnpm probe -- --list".`);
    return 1;
  }

  try {
    await stat(path.join(options.dist, 'index.html'));
  } catch {
    console.error(`No built renderer at ${options.dist}/index.html.\nRun "pnpm build" first, or pass --dist <dir>.`);
    return 1;
  }

  const chromium = findChromium();
  if (!chromium) {
    console.error('No Chromium binary found. Set CHROME_PATH, or install chromium / google-chrome.');
    return 1;
  }

  await warnIfStale(options.dist);
  await mkdir(options.out, { recursive: true });
  const profileDirectory = path.join(options.out, 'chrome-profile');
  await rm(profileDirectory, { recursive: true, force: true });

  console.log(`\n  chromium   ${chromium}`);
  console.log(`  serving    ${options.dist}`);
  console.log(`  writing    ${options.out}`);

  const server = await serveDirectory(options.dist, options.port);
  const browser = await openChromium(chromium, options.cdpPort, profileDirectory);
  const failures = [];
  let client;
  try {
    client = await connect(browser.webSocketUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB_SOURCE });

    for (const scene of selected) {
      await runScene(client, scene, options, `http://127.0.0.1:${options.port}`, failures);
    }
  } finally {
    client?.socket.close();
    server.close();
    browser.process.kill('SIGKILL');
    await terminated(browser.process);
    if (!options.keepProfile) {
      // A dying Chromium still writes into its profile while the tree walk runs, which
      // surfaces as ENOTEMPTY. Retry the race away, but never fail a run over a throwaway
      // cache: the screenshots are the product, the profile is not.
      try {
        await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (error) {
        console.warn(`  aviso: no se pudo limpiar ${profileDirectory} (${error.code ?? error.message}). Se ignora.`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`\n  ${failures.length} expectation(s) failed:`);
    for (const failure of failures) console.error(`    - ${failure}`);
    return 1;
  }
  console.log(`\n  listo: ${selected.length} scene(s), sin expectativas fallidas.\n`);
  return 0;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`\nprobe failed: ${error.message}`);
  process.exitCode = 1;
});
