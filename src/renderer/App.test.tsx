// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemDetail, SearchCandidate, SearchResponse } from '../domain/catalog';
import type { ImportProgress, PrestoApi } from '../shared/ipc';
import { App } from './App';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function click(element: Element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function enterText(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render(api: PrestoApi) {
  Object.defineProperty(window, 'presto', { configurable: true, value: api });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe('Presto catalog screen', () => {
  it('guides blank searches, reports imports, shows mixed results, and opens E11XM020 detail', async () => {
    const search: SearchResponse = {
      status: 'ok',
      items: [
        { ref: { source: 'guadalajara-2016-eu', codeKey: 'e11xm020' }, kind: 'partida', code: 'E11XM020', description: 'Barnizado al agua', unit: 'm²', price: '12.50', keywords: ['barnizado'], expandedText: 'Barnizado al agua', sourceDisplayName: 'Guadalajara2016_e+u.bc3', fieldCounts: { code: 1, description: 1, keywords: 1, expandedText: 1 }, exactCode: true },
        { ref: { source: 'guadalajara-2016-eu', codeKey: 'p25mv040' }, kind: 'resource', code: 'P25MV040', description: 'Barniz al agua', unit: 'l', price: '28.99', keywords: ['barniz'], expandedText: 'Barniz al agua', sourceDisplayName: 'Guadalajara2016_e+u.bc3', fieldCounts: { code: 0, description: 1, keywords: 1, expandedText: 1 }, exactCode: false },
      ],
    };
    const detail: ItemDetail = { kind: 'partida', item: search.items[0], breakdown: [{ ordinal: 0, sourceLine: 3, component: { code: 'P25MV040', kind: 'resource', description: 'Barniz al agua', unit: 'l', unitPrice: '28.99' }, factor: '1', yield: '0.3' }] };
    const api: PrestoApi = {
      importApprovedSource: vi.fn(async () => ({ source: 'guadalajara-2016-eu' as const, sourceDisplayName: 'Guadalajara2016_e+u.bc3', importedPartidas: 1, importedResources: 3, skippedRecords: 1, diagnostics: [{ code: 'ignored-record', sourceDisplayName: 'Guadalajara2016_e+u.bc3', line: 9, messageEs: 'Registro omitido.' }], completedAt: '2025-01-01T00:00:00.000Z' })),
      onImportProgress: vi.fn(() => () => undefined),
      search: vi.fn(async () => search),
      getDetail: vi.fn(async () => detail),
    };
    await render(api);

    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
    expect(container.textContent).toContain('Introduzca uno o más términos de búsqueda.');
    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]')!));
    expect(container.textContent).toContain('1 partidas y 3 recursos importados');
    expect(container.textContent).toContain('Registro omitido.');

    const input = container.querySelector('input')!;
    await act(async () => enterText(input, 'barniz'));
    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
    expect(container.textContent).toContain('Partida');
    expect(container.textContent).toContain('Recurso');
    await act(async () => click(container.querySelector('button[aria-label="Ver detalle E11XM020"]')!));
    expect(container.textContent).toContain('Desglose de E11XM020');
  });

  it('keeps import summaries visible while diagnostics scroll independently', async () => {
    const diagnostics = [
      { code: 'ignored-record', sourceDisplayName: 'short.bc3', line: 4, messageEs: 'Registro omitido.' },
      { code: 'ignored-record', sourceDisplayName: 'a-very-long-filename-that-must-remain-readable-without-horizontal-scrolling.bc3', line: 8, messageEs: 'Este mensaje de diagnóstico también es deliberadamente largo y debe conservarse completo.' },
      ...Array.from({ length: 8 }, (_, index) => ({ code: 'ignored-record', sourceDisplayName: `file-${index}.bc3`, line: index + 10, messageEs: `Diagnóstico ${index}.` })),
    ];
    const api: PrestoApi = {
      importApprovedSource: vi.fn(async () => ({ source: 'guadalajara-2016-eu' as const, sourceDisplayName: 'catalog.bc3', importedPartidas: 12, importedResources: 34, skippedRecords: diagnostics.length, diagnostics, completedAt: '2025-01-01T00:00:00.000Z' })),
      onImportProgress: vi.fn(() => () => undefined),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    await render(api);

    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]')!));

    const status = container.querySelector('div[role="status"]')!;
    const panel = status.querySelector('section.import-diagnostics-panel[aria-label="Panel de diagnósticos de importación"]')!;
    const list = panel.querySelector('ul[aria-label="Diagnósticos de importación"]')!;
    const summaries = Array.from(status.children).filter((child): child is HTMLParagraphElement => child.tagName === 'P');
    expect(summaries).toHaveLength(2);
    expect(summaries[0].textContent).toContain('catalog.bc3');
    expect(summaries[0].textContent).toContain('12 partidas y 34 recursos importados');
    expect(summaries[1].textContent).toContain(`Registros omitidos: ${diagnostics.length}`);
    expect(summaries[1].textContent).toContain(new Date('2025-01-01T00:00:00.000Z').toLocaleString('es-ES'));
    expect(summaries.every((summary) => !panel.contains(summary))).toBe(true);
    expect(Array.from(panel.children)).toEqual([list]);
    expect((panel as HTMLElement).tabIndex).toBe(0);
    expect(Array.from(list.children).map((item) => item.textContent)).toEqual(diagnostics.map((diagnostic) => `${diagnostic.sourceDisplayName}, línea ${diagnostic.line}: ${diagnostic.messageEs}`));
    expect(list.textContent).toContain('a-very-long-filename-that-must-remain-readable-without-horizontal-scrolling.bc3');
    expect(list.textContent).toContain('Este mensaje de diagnóstico también es deliberadamente largo y debe conservarse completo.');

    const rendererCss = readFileSync('src/renderer/style.css', 'utf8');
    const panelRule = rendererCss.match(/\.import-diagnostics-panel\s*\{([^}]*)\}/)?.[1];
    expect(panelRule).toBeDefined();
    expect(panelRule).toMatch(/max-height:\s*12rem;/);
    expect(panelRule).toMatch(/overflow-y:\s*auto;/);
    expect(panelRule).toMatch(/overflow-x:\s*hidden;/);
    expect(panelRule).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it('shows complete import activity while search remains available and clears it after success', async () => {
    let reportProgress: ((progress: ImportProgress) => void) | undefined;
    let completeImport: ((response: Awaited<ReturnType<PrestoApi['importApprovedSource']>>) => void) | undefined;
    const api: PrestoApi = {
      importApprovedSource: vi.fn(() => new Promise<Awaited<ReturnType<PrestoApi['importApprovedSource']>>>((resolve) => { completeImport = resolve; })),
      onImportProgress: vi.fn((listener) => { reportProgress = listener; return () => undefined; }),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    await render(api);
    const loadingStatus = () => container.querySelector('section[aria-labelledby="import-title"] > p[role="status"]');
    const importButton = container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement;

    await act(async () => click(importButton));
    expect(loadingStatus()?.textContent).toBe('Importación en curso. Esperando la selección del archivo BC3.');
    expect(importButton.disabled).toBe(true);
    const input = container.querySelector('input')!;
    const searchButton = container.querySelector('button[aria-label="Buscar"]') as HTMLButtonElement;
    expect(input.disabled).toBe(false);
    expect(searchButton.disabled).toBe(false);
    await act(async () => enterText(input, 'barniz'));
    await act(async () => click(searchButton));
    expect(api.search).toHaveBeenCalledWith({ query: 'barniz' });

    await act(async () => reportProgress?.({ stage: 'processing-records', completed: 4, total: 4 }));
    expect(loadingStatus()?.textContent).toContain('Procesando registros BC3: 100 %');
    await act(async () => reportProgress?.({ stage: 'validating-relations' }));
    expect(loadingStatus()?.textContent).toContain('Validando relaciones del catálogo…');
    expect(container.querySelector('[aria-label="Etapas de importación"]')?.textContent).toContain('Procesando registros BC3: 100 %: Completado.');
    expect(importButton.disabled).toBe(true);
    await act(async () => reportProgress?.({ stage: 'storing', completed: 3, total: 6 }));
    expect(loadingStatus()?.textContent).toContain('Operaciones de guardado: 50 %');
    expect(container.querySelector('[aria-label="Etapas de importación"]')?.textContent).toContain('Validando relaciones del catálogo…: Completado.');
    expect(importButton.disabled).toBe(true);

    await act(async () => completeImport?.({ source: 'guadalajara-2016-eu', sourceDisplayName: 'Guadalajara2016_e+u.bc3', importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' }));
    expect(loadingStatus()).toBeNull();
    expect(importButton.disabled).toBe(false);
    expect(container.textContent).toContain('1 partidas y 3 recursos importados');
    await act(async () => reportProgress?.({ stage: 'processing-records', completed: 1, total: 1 }));
    expect(loadingStatus()).toBeNull();
    expect(importButton.disabled).toBe(false);
  });

  it('clears import activity while preserving cancellation feedback', async () => {
    let reportProgress: ((progress: ImportProgress) => void) | undefined;
    let completeImport: ((response: Awaited<ReturnType<PrestoApi['importApprovedSource']>>) => void) | undefined;
    const api: PrestoApi = {
      importApprovedSource: vi.fn(() => new Promise<Awaited<ReturnType<PrestoApi['importApprovedSource']>>>((resolve) => { completeImport = resolve; })),
      onImportProgress: vi.fn((listener) => { reportProgress = listener; return () => undefined; }),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    await render(api);
    const importButton = container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement;

    await act(async () => click(importButton));
    await act(async () => reportProgress?.({ stage: 'processing-records', completed: 1, total: 1 }));
    await act(async () => completeImport?.({ status: 'cancelled' }));

    expect(container.querySelector('section[aria-labelledby="import-title"] > p[role="status"]')).toBeNull();
    expect(importButton.disabled).toBe(false);
    expect(container.textContent).toContain('La importación fue cancelada.');
  });

  it('clears import activity while preserving rejection feedback', async () => {
    let reportProgress: ((progress: ImportProgress) => void) | undefined;
    let rejectImport: ((reason?: unknown) => void) | undefined;
    const api: PrestoApi = {
      importApprovedSource: vi.fn(() => new Promise<Awaited<ReturnType<PrestoApi['importApprovedSource']>>>((_resolve, reject) => { rejectImport = reject; })),
      onImportProgress: vi.fn((listener) => { reportProgress = listener; return () => undefined; }),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    await render(api);
    const importButton = container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement;

    await act(async () => click(importButton));
    await act(async () => reportProgress?.({ stage: 'storing', completed: 1, total: 1 }));
    await act(async () => rejectImport?.(new Error('failed import')));

    expect(container.querySelector('section[aria-labelledby="import-title"] > p[role="status"]')).toBeNull();
    expect(importButton.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo importar el catálogo seleccionado.');
  });

  function pendingImportApi() {
    const controllers: {
      report?: (progress: ImportProgress) => void;
      complete?: (response: Awaited<ReturnType<PrestoApi['importApprovedSource']>>) => void;
    } = {};
    const api: PrestoApi = {
      importApprovedSource: vi.fn(() => new Promise<Awaited<ReturnType<PrestoApi['importApprovedSource']>>>((resolve) => { controllers.complete = resolve; })),
      onImportProgress: vi.fn((listener) => { controllers.report = listener; return () => undefined; }),
      search: vi.fn(async () => ({ status: 'empty-query' as const })),
      getDetail: vi.fn(async () => null),
    };
    return { api, controllers };
  }

  it('shows a determinate stage-scoped progress bar with a Spanish counter while a stage is measured', async () => {
    const { api, controllers } = pendingImportApi();
    await render(api);
    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement));
    await act(async () => controllers.report?.({ stage: 'processing-records', completed: 50, total: 100 }));
    const bar = container.querySelector('progress[aria-label="Progreso de procesamiento de registros"]') as HTMLProgressElement;
    expect(bar).toBeTruthy();
    expect(bar.max).toBe(100);
    expect(bar.value).toBe(50);
    expect(container.textContent).toContain('50 de 100 registros procesados');
    await act(async () => controllers.report?.({ stage: 'storing', completed: 1400753, total: 2801506 }));
    const storingBar = container.querySelector('progress[aria-label="Progreso de operaciones de guardado"]') as HTMLProgressElement;
    expect(storingBar.value).toBe(50);
    expect(container.textContent).toContain('1.400.753 de 2.801.506 operaciones de guardado');
  });

  it('renders an indeterminate progress bar while validating relations', async () => {
    const { api, controllers } = pendingImportApi();
    await render(api);
    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement));
    await act(async () => controllers.report?.({ stage: 'validating-relations' }));
    const bar = container.querySelector('progress[aria-label="Progreso de validación de relaciones"]');
    expect(bar).toBeTruthy();
    expect(bar!.hasAttribute('value')).toBe(false);
  });

  it('appends each 10 % milestone exactly once per stage and ignores repeated percents', async () => {
    const { api, controllers } = pendingImportApi();
    await render(api);
    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement));
    const milestones = () => [...container.querySelectorAll('ul[aria-label="Hitos de importación"] li')].map((li) => li.textContent);
    await act(async () => controllers.report?.({ stage: 'processing-records', completed: 10, total: 100 }));
    expect(milestones()).toEqual(['Registros procesados: 10 % (10 de 100)']);
    await act(async () => controllers.report?.({ stage: 'processing-records', completed: 10, total: 100 }));
    expect(milestones()).toEqual(['Registros procesados: 10 % (10 de 100)']);
    await act(async () => controllers.report?.({ stage: 'storing', completed: 2801506, total: 2801506 }));
    expect(milestones()).toEqual(['Registros procesados: 10 % (10 de 100)', 'Operaciones de guardado: 100 % (2.801.506 de 2.801.506)']);
  });

  it('shows the measured elapsed line while pending and removes it once the import settles', async () => {
    const { api, controllers } = pendingImportApi();
    await render(api);
    await act(async () => click(container.querySelector('button[aria-label="Importar catálogo"]') as HTMLButtonElement));
    expect(container.textContent).toMatch(/Tiempo transcurrido: \d+ s/);
    await act(async () => controllers.complete?.({ status: 'cancelled' }));
    expect(container.textContent).not.toContain('Tiempo transcurrido:');
  });

  function item(source: 'guadalajara-2016-rm' | 'guadalajara-2016-eu', codeKey: string, code: string, kind: 'partida' | 'resource' = 'partida') {
    return { ref: { source, codeKey }, kind, code, description: `${code} description`, unit: kind === 'partida' ? 'm²' : 'l', price: '12.50', keywords: [], expandedText: code, sourceDisplayName: source, fieldCounts: { code: 1, description: 1, keywords: 0, expandedText: 1 }, exactCode: false } as SearchCandidate;
  }

  function partidaDetail(value: ReturnType<typeof item>, breakdown = [{ ordinal: 1, sourceLine: 9, component: { code: 'C2', kind: 'resource' as const, description: 'Second', unit: 'u', unitPrice: '2' }, factor: 'F2', yield: '0.3' }, { ordinal: 0, sourceLine: 2, component: { code: 'C1', kind: 'partida' as const, description: 'First', unit: 'u', unitPrice: '1' }, factor: 'F1', yield: '0' }]) {
    return { kind: 'partida' as const, item: value, breakdown };
  }

  function apiFor(search: SearchResponse, getDetail: PrestoApi['getDetail']): PrestoApi {
    return { importApprovedSource: vi.fn(async () => ({ status: 'cancelled' as const })), onImportProgress: vi.fn(() => () => undefined), search: vi.fn(async () => search), getDetail };
  }

  async function showResults(api: PrestoApi) {
    await render(api);
    const input = container.querySelector('input')!;
    await act(async () => enterText(input, 'x'));
    await act(async () => click(container.querySelector('button[aria-label="Buscar"]')!));
  }

  it('renders unit-aware breakdown quantities in source order and keeps resources table-free', async () => {
    const partida = { ...item('guadalajara-2016-eu', 'p1', 'P1'), unit: 'm2' };
    const resource = item('guadalajara-2016-eu', 'r1', 'R1', 'resource');
    const breakdown = [
      { ordinal: 1, sourceLine: 9, component: { code: 'C2', kind: 'resource' as const, description: 'Labor', unit: 'h', unitPrice: '2' }, factor: 'ignored', yield: '0.3' },
      { ordinal: 0, sourceLine: 2, component: { code: 'C1', kind: 'partida' as const, description: 'Material', unit: 'm2', unitPrice: '1' }, factor: 'ignored', yield: '1.05' },
    ];
    const details = new Map<string, ItemDetail>([[partida.ref.codeKey, partidaDetail(partida, breakdown)], [resource.ref.codeKey, { kind: 'resource', item: resource }]]);
    const api = apiFor({ status: 'ok', items: [partida, resource] }, vi.fn(async (ref) => details.get(ref.codeKey) ?? null));
    await showResults(api);
    const partidaButton = container.querySelector('button[aria-label="Ver detalle P1"]')!;
    await act(async () => click(partidaButton));
    const row = partidaButton.closest('li')!;
    const region = row.querySelector('section.result-detail')!;
    expect(region).toBeTruthy();
    expect(container.querySelectorAll('section.result-detail')).toHaveLength(1);
    expect(container.querySelector('ul[aria-label="Resultados de búsqueda"]')?.contains(region)).toBe(true);
    expect(row.lastElementChild).toBe(region);
    const headers = [...region.querySelectorAll('th')];
    expect(headers.map((cell) => cell.textContent)).toEqual(['Orden', 'Componente', 'Hora/Unidad', 'Unidad/Día']);
    expect(headers[2].getAttribute('title')).toBe('Horas o cantidad del componente requeridas por unidad de la partida.');
    expect(headers[3].getAttribute('title')).toBe('Unidades de la partida por día, calculadas al mostrar como 8 dividido por Hora/Unidad para una jornada fija de 8 horas.');
    expect(region.querySelector('[role="tooltip"]')).toBeNull();
    expect([...region.querySelectorAll('tbody tr')].map((line) => [...line.children].map((cell) => cell.textContent))).toEqual([['2', 'C2 — Labor', '0,3 h', '26,67 m2/día'], ['1', 'C1 — Material', '1,05 m2', 'No aplica']]);
    await act(async () => click(container.querySelector('button[aria-label="Ver detalle R1"]')!));
    const resourceRegion = container.querySelector('button[aria-label="Ver detalle R1"]')!.closest('li')!.querySelector('section.result-detail')!;
    expect(resourceRegion.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('section.result-detail')).toHaveLength(1);
  });

  it('replaces and collapses selected details', async () => {
    const a = item('guadalajara-2016-eu', 'a', 'A');
    const b = item('guadalajara-2016-eu', 'b', 'B');
    const getDetail = vi.fn(async (ref) => partidaDetail(ref.codeKey === 'a' ? a : b));
    await showResults(apiFor({ status: 'ok', items: [a, b] }, getDetail));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    expect(buttons.map((button) => button.getAttribute('aria-expanded'))).toEqual(['false', 'false']);
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0].closest('li')?.querySelector('section.result-detail')).toBeNull();
    expect(container.querySelectorAll('section.result-detail')).toHaveLength(1);
    await act(async () => click(buttons[1]));
    expect(buttons.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(container.querySelector('section.result-detail')).toBeNull();
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it('gives same-code source results unique accessible disclosure ids', async () => {
    const eu = item('guadalajara-2016-eu', 'same', 'SAME');
    const rm = item('guadalajara-2016-rm', 'same', 'SAME');
    await showResults(apiFor({ status: 'ok', items: [eu, rm] }, vi.fn(async (ref) => partidaDetail(ref.source === eu.ref.source ? eu : rm))));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    expect(new Set(buttons.map((button) => button.id)).size).toBe(2);
    expect(new Set(buttons.map((button) => button.getAttribute('aria-controls'))).size).toBe(2);
    expect(buttons.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    await act(async () => click(buttons[0]));
    const region = container.querySelector('section.result-detail')!;
    expect(buttons[0].getAttribute('aria-controls')).toBe(region.id);
    expect(region.getAttribute('aria-labelledby')).toBe(buttons[0].id);
    expect(document.getElementById(region.id)).toBe(region);
    expect(document.getElementById(buttons[0].id)).toBe(buttons[0]);
  });

  it('ignores stale replacement, collapse, and ABA responses', async () => {
    const a = item('guadalajara-2016-eu', 'a', 'A');
    const b = item('guadalajara-2016-eu', 'b', 'B');
    const pending = new Map<string, (value: ItemDetail | null) => void>();
    const getDetail = vi.fn((ref) => new Promise<ItemDetail | null>((resolve) => pending.set(`${ref.codeKey}-${getDetail.mock.calls.length}`, resolve)));
    await showResults(apiFor({ status: 'ok', items: [a, b] }, getDetail));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => pending.get('b-2')?.(partidaDetail(b)));
    expect(container.textContent).toContain('Desglose de B');
    await act(async () => pending.get('a-1')?.(partidaDetail(a)));
    expect(container.textContent).not.toContain('Desglose de A');
    await act(async () => click(buttons[1]));
    await act(async () => click(buttons[0]));
    expect(pending.has('a-3')).toBe(true);
    await act(async () => click(buttons[0]));
    await act(async () => pending.get('a-3')!(partidaDetail(a)));
    expect(container.querySelector('section.result-detail')).toBeNull();

    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => click(buttons[0]));
    expect(pending.has('a-4')).toBe(true);
    expect(pending.has('b-5')).toBe(true);
    expect(pending.has('a-6')).toBe(true);
    await act(async () => pending.get('a-4')!(partidaDetail(a)));
    await act(async () => pending.get('b-5')!(partidaDetail(b)));
    expect(container.querySelector('section.result-detail')).toBeNull();
    await act(async () => pending.get('a-6')!(partidaDetail(a)));
    expect(container.textContent).toContain('Desglose de A');
  });

  it('ignores stale null and rejection completions', async () => {
    const a = item('guadalajara-2016-eu', 'a', 'A');
    const b = item('guadalajara-2016-eu', 'b', 'B');
    const pending = new Map<string, { resolve: (value: ItemDetail | null) => void; reject: (error: Error) => void }>();
    const getDetail = vi.fn((ref) => new Promise<ItemDetail | null>((resolve, reject) => pending.set(`${ref.codeKey}-${getDetail.mock.calls.length}`, { resolve, reject })));
    await showResults(apiFor({ status: 'ok', items: [a, b] }, getDetail));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('ul button')];
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => pending.get('a-1')?.resolve(null));
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => click(buttons[1]));
    await act(async () => click(buttons[0]));
    await act(async () => click(buttons[1]));
    await act(async () => pending.get('a-3')?.reject(new Error('late')));
    await act(async () => pending.get('b-4')?.resolve(partidaDetail(b)));
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
