# Visual probe

Drives the **built** renderer in headless Chromium and screenshots every reachable visual
state of the catalog screen.

## Why it exists

The renderer's 22 tests assert behaviour and DOM structure, and the two CSS rules they read
by regex are asserted as text. Nothing in the suite can see a screen.

A progress bar that renders as an empty track. A table cell that wraps `26,67 m2/día` into
two unrelated numbers. A filled button slab that drowns out its own label. A base
background layer painted over the segment it was supposed to sit behind. All of those pass
116 passing tests. This tool is the missing sense organ.

## Run it

```sh
pnpm build && pnpm probe
```

Screenshots land in `.visual-probe/` (gitignored), two per state: a full-page capture and a
viewport-only capture.

```sh
pnpm probe -- --list              # list the scenes
pnpm probe -- --scene alerta      # run one scene
pnpm probe -- --keep-profile      # keep the Chromium profile for debugging
pnpm probe -- --help
```

Exit code is non-zero when any scene's expectations are missing, so it can be wired into a
pre-release check later. It is deliberately **not** part of `pnpm test` or CI: it needs a
Chromium binary and a built `dist/`.

Requirements: Node 22+ (uses the global `WebSocket`, so there are no dependencies) and a
Chromium binary. Set `CHROME_PATH`, or have `chromium`, `chromium-browser`, `google-chrome`,
`google-chrome-stable` or `microsoft-edge` on `PATH`.

## How it works

The app is never modified for the probe. A `window.presto` stub is installed over the
DevTools Protocol with `Page.addScriptToEvaluateOnNewDocument`, so it exists **before** the
bundle evaluates; after that the real application code, the real React tree, the real CSS
and the real event handling run. Clicks are dispatched as real bubbling `MouseEvent`s,
typing goes through the native value setter plus an `input` event, and hover states come
from real `Input.dispatchMouseEvent` moves.

`?scene=` selects the import behaviour, because the import flow has states that only exist
while a promise is pending: a stub that always resolves can never show progress or an
indeterminate stage.

## Traps this tool already paid for

**A stale `dist/` silently screenshots the previous UI.** The images look fine and describe
code that no longer exists. The probe compares `dist/index.html` against the newest file
under `src/renderer/` and warns when `dist/` is older. Keep an intentional before/after
comparison by pointing `--dist` at a copy, not by ignoring the warning.

**One frame is not enough for anything animated.** The indeterminate bar looked plausible in
a single screenshot while rendering as a dead grey track. Scenes can declare `samples` to
capture the same element over time; compare the samples, or histogram them, instead of
trusting one frame. That is how three stacked CSS bugs in the indeterminate bar were found
(a first background layer painted over the segment it should sit behind, an animated
100%-wide layer that cannot move under percentage positioning, and Chromium painting
`::-webkit-progress-bar` over the element's own background).

**Chromium does not animate `::-webkit-progress-bar`.** If you restyle the progress bar,
verify motion with `samples`, not by reading the CSS.

## Adding a scene

Add an entry to `SCENES` in `probe.mjs`:

```js
{
  name: 'mi-estado',
  stub: 'initial',            // which ?scene= the import stub should answer with
  description: 'What this state is for.',
  expect: ['selector-that-must-exist'],
  drive: async ({ type, click, hover }) => { /* set the state up */ },
  shots: [{ name: '10-mi-estado', width: 1280, height: 900 }],
  // optional second phase, e.g. expanding a detail panel:
  then: async ({ click }) => { await click('button[aria-label="Ver detalle E11XM020"]'); },
  thenExpect: ['section.result-detail'],
  thenShots: [{ name: '11-mi-detalle', width: 760, height: 900 }],
  // optional time series of one element:
  samples: { name: '12-mi-barra', selector: 'progress', count: 6, gapMs: 220 },
}
```

Useful `expect` selectors, all of which encode a contract some test also asserts:
`section[aria-labelledby="import-title"] > p[role="status"]`, `div[role="status"]`,
`section.import-diagnostics-panel`, `ul[aria-label="Resultados de búsqueda"]`,
`section.result-detail`, `p[role="alert"]`, `ol[aria-label="Etapas de importación"]`.

## Sample data

The catalog in `probe.mjs` is realistic Guadalajara-2016 shaped data, **not** a real source
extract: approved BC3 content must never enter this repository. It is deliberately chosen to
cover the branches that break layout: a long partida description, a long filename and long
diagnostic message that must wrap without horizontal scrolling, and three breakdown lines
covering every branch of `presentBreakdownQuantity` (a non-hour component, an hour component
with a computed daily yield, and a large quantity).
