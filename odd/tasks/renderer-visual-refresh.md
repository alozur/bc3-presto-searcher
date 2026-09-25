# Feature: renderer-visual-refresh (elegant, presentable UI)

Branch: `feat/renderer-visual-refresh`

## Goal

Turn the functional PrestoSearch renderer into a visually refined, presentable desktop
app: paper-warm light theme, single petrol accent, hierarchy by type and weight instead
of boxes, comfortable density for long BC3 codes.

## Authorized scope (user decisions, 2026-09-25)

- Direction: **Claro refinado** — off-white/paper background, subtle borders, minimal
  shadow, one accent colour, hierarchy by size/weight, comfortable density.
- Scope: **CSS + minimal markup touches** on `src/renderer/style.css`, `src/renderer/App.tsx`
  and `index.html` only. Forbidden: changing ARIA roles, visible Spanish copy, or any
  state/logic behaviour.

## Hard constraints (contracted by tests)

`src/renderer/App.test.tsx` (22 tests) binds the following; a change here is a defect:

1. `section[aria-labelledby="import-title"] > p[role="status"]` must stay a **direct child**
   of the import section (lines 246, 301, 322).
2. The import success/unchanged block must stay a `div[role="status"]` (line 148).
3. Inside that `div[role="status"]`, `children` filtered to `P` must be exactly 2 summaries,
   and `section.import-diagnostics-panel` must contain exactly one child: its `ul`
   (lines 99–112).
4. `.import-diagnostics-panel` rule must keep `max-height: 12rem`, `overflow-y: auto`,
   `overflow-x: hidden`, `overflow-wrap: anywhere`.
5. `.import-milestones` rule must keep a **4-value `padding` shorthand** whose 4th value
   is ≥ `1.5rem` (lines 124–135).
6. Result triggers must remain `<button>` inside a `<ul>`, with `aria-expanded`,
   `aria-controls`, unique ids, and `section.result-detail` inside the same `<li>`
   (lines 419–518).
7. `.result-detail` must stay a `section` and resources must not render a `table`.

## Frozen design system (apply literally)

### Tokens

```css
:root {
  color-scheme: light;
  --paper: #f6f5f2;
  --surface: #ffffff;
  --surface-sunk: #f2f1ed;
  --surface-tint: #eef4f5;
  --ink-strong: #14181d;
  --ink: #38414e;
  --ink-muted: #646d7a;
  --ink-faint: #98a1ac;
  --line: #e5e3de;
  --line-strong: #d2cfc8;
  --accent: #14505f;
  --accent-strong: #0d3b47;
  --accent-tint: #e7f0f2;
  --accent-line: #b9d2d7;
  --danger: #9b2c2c;
  --danger-tint: #fdf2f2;
  --danger-line: #eccfd0;
  --shadow-sm: 0 1px 2px rgba(20, 24, 29, .05);
  --shadow-md: 0 1px 2px rgba(20, 24, 29, .05), 0 8px 24px -12px rgba(20, 24, 29, .14);
  --radius-sm: 8px;
  --radius: 10px;
  --radius-lg: 14px;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
}
```

`--ink-muted` on `--paper`/`--surface` must stay ≥ 4.5:1 (it does: #646d7a).

### Type

- body: `--font-sans`, `0.9375rem`/1.6, `--ink`, `-webkit-font-smoothing: antialiased`.
- `.app-masthead h1`: `1.375rem`, weight 600, `letter-spacing: -.015em`, `--ink-strong`.
- `.app-masthead p`: `0.875rem`, `--ink-muted`.
- `h2` (section labels): `0.8125rem`, weight 600, `letter-spacing: .06em`,
  `text-transform: uppercase`, `--ink-muted` — the "eyebrow" that replaces boxes.
- `h3` (detail title): `0.9375rem`, weight 600, `--ink-strong`.
- meta/`small`: `0.8125rem`, `--ink-muted`.
- BC3 codes, counters, prices, table numerics: `--font-mono`,
  `font-variant-numeric: tabular-nums`.

### Layout

- `main`: `max-width: 68rem; margin-inline: auto; padding: 2.5rem 1.75rem 4rem`.
- `.app-masthead`: **no card** — no background, no border, no padding; only a
  `1.75rem` bottom margin. The masthead must read as the page, not as another box.
- `section.panel`: `--surface`, `1px solid --line`, `--radius-lg`, `padding: 1.5rem`,
  `box-shadow: --shadow-sm`, `margin-bottom: 1.25rem`, `display: flex; flex-direction: column`.
- Signature detail: a `3px` fixed top rail, `linear-gradient(90deg, var(--accent), #2a7f95)`.

### Controls

- `button`: `font: inherit`, weight 500, `0.875rem`, `padding: .55rem 1rem`,
  `border-radius: --radius-sm`, `transition: background-color .15s ease, border-color .15s ease,
  box-shadow .15s ease, transform .1s ease`.
- primary: `--accent` background/border, white text, `--shadow-sm`; hover `--accent-strong`;
  `:active { transform: translateY(1px) }`; `:disabled { opacity: .55; cursor: not-allowed }`.
- `:focus-visible`: `outline: 2px solid var(--accent); outline-offset: 2px` on every
  interactive element (buttons, inputs, labels, panels with `tabIndex`).
- `::selection`: `--accent-line` background.

### Results list (refinement, not boxes)

The search panel is one card; result items are **hairline-separated rows**, not nested
cards — this honours the chosen direction's "jerarquía por tamaño y peso, no por cajas"
and keeps long BC3 code lists scannable.

- `.results`: `list-style: none; padding: 0; margin: .5rem 0 0`.
- `.results li`: `padding: 1.125rem 1rem; margin: 0 -1rem` (tint bleeds into the gutter);
  `li + li { border-top: 1px solid var(--line) }`; hover and
  `li:has(button[aria-expanded="true"])` → `background: var(--surface-sunk)`.
- The trigger is **not** a filled button: `background: none; border: 0; box-shadow: none;
  color: --ink-strong; text-align: left; width: 100%; padding: .25rem 0;
  display: flex; align-items: center; gap: .65rem`. No blue slab per row.
- `.result-kind` (the `Partida`/`Recurso` label): `0.6875rem`, weight 600,
  `letter-spacing: .08em`, uppercase, `--accent` on `--accent-tint` with
  `1px solid --accent-line`, `border-radius: 999px`, `padding: .1rem .5rem`,
  `white-space: nowrap`.
- `.result-code`: `--font-mono`, `0.875rem`, `--ink-strong`.
- Chevron: `::after` drawn with borders (no text content, so nothing is announced):
  `width/height: .45rem`, `border-right/bottom: 2px solid var(--ink-faint)`,
  `transform: rotate(45deg)`, `margin-left: auto`; `rotate(225deg)` when
  `aria-expanded="true"`. Transition `transform .18s ease`.
- Row description: `margin: .5rem 0 0`, `--ink`, `0.9375rem`.
- Row meta (`small`): `display: block`, `margin-top: .5rem`, `--ink-muted`, `0.8125rem`.

### Detail panel

- `.result-detail`: `margin-top: 1rem`, `padding: 1.125rem 1.25rem`,
  `background: var(--surface)`, `border: 1px solid var(--line)`,
  `border-radius: --radius-sm`, `box-shadow: --shadow-sm`. It must sit as a distinct
  white card on the tinted expanded row.
- `.result-detail > p:last-of-type` (the `Fuente: …` line): `0.8125rem`, `--ink-muted`.
- Tables: `font-size: .8125rem`, `border-collapse: collapse`, `width: 100%`;
  `th`: `0.6875rem`, uppercase, `letter-spacing: .06em`, `--ink-muted`,
  `border-bottom: 1px solid var(--line-strong)`, `text-align: left`, `padding: .5rem`;
  `td`: `padding: .5rem`, `border-bottom: 1px solid var(--line)`;
  last row has no bottom border; numeric cells `--font-mono`, tabular.

### Import panel

- `.import-actions`: `display: flex; flex-wrap: wrap; align-items: center;
  gap: .75rem 1rem; margin-bottom: .75rem`.
- `.import-completion-sound`: keep `display: flex; align-items: center; gap: .5rem`,
  keep its `input` override (`min-width: 0; width: 1rem; height: 1rem; margin: 0;
  accent-color: var(--accent)`). **Keep the explanatory comment, updated so it is
  truthful for the narrowed selector.**
- `progress`: `appearance: none`, `width: 100%`, `height: .5rem`, `border: 0`,
  `border-radius: 999px`, `overflow: hidden`, `background: --surface-sunk`;
  `::-webkit-progress-bar` → `--surface-sunk`; `::-webkit-progress-value` →
  `linear-gradient(90deg, var(--accent), #2a7f95)` with `border-radius: 999px`;
  `progress:indeterminate` → animated sweep keyframe (`progress-sweep`, ~1.4s linear
  infinite) so the validating-relations stage never renders as an empty track.
- Stage list `ol[aria-label="Etapas de importación"]`: `list-style: none; padding-left: 0;
  display: grid; gap: .3rem; font-size: .8125rem; color: --ink-muted`.
- `.import-counter`, `.import-elapsed`: `--font-mono` (counter) / `--ink-muted` (elapsed),
  `0.8125rem`, `tabular-nums`.
- `div[role="status"]` (import outcome): `--accent-tint` background,
  `1px solid --accent-line`, `--radius`, `padding: 1rem 1.25rem`, paragraphs
  `margin: .25rem 0`. Do **not** style `p[role="status"]` the same way — the pending
  line stays plain, `--ink-muted`, `0.8125rem`.
- `p[role="alert"]`: `--danger-tint` background, `1px solid --danger-line`,
  `--danger` text, `--radius`, `padding: .75rem 1rem`.
- `.import-diagnostics-panel`: add `--surface-sunk` background, `1px solid --line`,
  `--radius-sm`, `padding: .5rem .75rem`, while preserving the four contracted
  properties. Items `0.8125rem`, `--ink-muted`, `::marker` `--accent`.
- `.import-milestones`: preserve the exact 4-value padding
  (`padding: .5rem .75rem .5rem 1.75rem`) plus its `--surface-sunk` background,
  `1px solid --line`, `--radius-sm`; items `0.8125rem`, `--font-mono`, tabular,
  `::marker` `--accent`.
- Thin scrollbars on both scrollable panels
  (`scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent` plus
  `::-webkit-scrollbar` rules).

### Motion & resilience

- `@media (prefers-reduced-motion: reduce)`: disable transitions/animations.
- `@media (max-width: 40rem)`: single column, `main` padding `1.5rem 1rem 3rem`,
  `#search-query { min-width: 0; flex: 1 1 100% }`.
- Do not remove the existing `input { min-width: 18rem }` / `.import-completion-sound input`
  pair; the tests and comments depend on their current relationship.

## Markup touches allowed in `src/renderer/App.tsx`

Exactly these, nothing else:

1. `<header className="app-masthead">`.
2. `className="panel"` on both `<section>` elements.
3. Wrap the import trigger button + completion-sound label in
   `<div className="import-actions">` (keeps both as descendants of the section).
4. Wrap the search input + submit button in `<div className="search-row">`
   (the `label[htmlFor]`, the `p[role="status"]` outputs and `p[role="alert"]`
   must not move).
5. Give the trigger's kind label `className="result-kind"` and wrap `{item.code}`
   in `<span className="result-code">`.
6. `index.html`: add a real skeleton — `<!doctype html>`, `<html lang="es">`,
   `<meta charset="utf-8">`, viewport meta, `<title>PrestoSearch</title>`, and keep
   `#root` + the existing module script path.

No aria attribute, no visible text, and no state logic may change.

## Tasks

### 1. Freeze the design system and the test contracts
- Status: done
- Evidence: direction and scope chosen by the user; the 22 renderer tests were read and
  their structural assertions transcribed into `## Hard constraints`; baseline recorded as
  116/116 passing on `main` @ `0388c06` (via `TMPDIR` under `/home` — see Notes).
- Notes: `/tmp` is tmpfs with a user quota at 80% usage; `pnpm test` fails there with
  `Unknown system error -122`. Use `TMPDIR=/home/alozur/.cache/tmp-presto pnpm test`.

### 2. Apply the design system to `style.css` and the minimal markup touches
- Status: done
- Evidence: `src/renderer/style.css` rewritten around the frozen tokens (538 -> ~600 lines);
  `src/renderer/App.tsx` carries exactly the six enumerated markup touches (+26/-13 lines);
  `index.html` gained the real skeleton (+13/-1). Applied by one bounded writer; the parent
  reviewed the whole diff and then fixed three defects found by the visual probe (see
  `## Review round`).
- Notes: delegated to a single bounded writer, then corrected inline on one file.

### 3. Verify
- Status: done
- Evidence:
  - `TMPDIR=/home/alozur/.cache/tmp-presto pnpm test` -> `Test Files 20 passed (20)`,
    `Tests 116 passed (116)`, no failures and no skips.
  - `pnpm exec tsc -p tsconfig.json --noEmit` -> exit 0, no diagnostics.
  - `pnpm build` -> exit 0, renderer build + preload build both succeed.
  - `git diff --name-only` -> only `index.html`, `src/renderer/App.tsx`,
    `src/renderer/style.css`; no test file modified or deleted.
  - Independent read-only verification (`gentle-ai-verify`) returned **10/10 claims
    confirmed, no exceptions**: test counts, no test-file change, clean `tsc`, green build,
    both contracted CSS rules intact, `.import-diagnostics-panel` still a four-property
    block, `.import-milestones` padding still four values with 1.75rem last, the
    `section[aria-labelledby="import-title"] > p[role="status"]` direct-child contract
    intact, the outcome still a `div[role="status"]` with exactly two `<p>` summaries, and
    result triggers still `<button>` inside the `<ul>` with `section.result-detail` in the
    same `<li>`. The verifier listed all six App.tsx changes and confirmed each is
    className/structural-only.
  - Visual verification: headless-Chromium probe captured 9 reachable states at 1280px and
    760px (initial, import in progress, indeterminate stage, import outcome with
    diagnostics, results with hover, expanded partida detail, narrow detail, error alert).
- Notes: the probe injects a `window.presto` stub over CDP before the bundle evaluates,
  served the built renderer over HTTP, and drove the real app with real events. It later
  moved into the repository as task 4.

### 4. Ship the visual probe as a repository tool
- Status: done
- Evidence: `tools/visual-probe/probe.mjs` (self-contained, zero dependencies: Node 22's
  global `WebSocket`), `tools/visual-probe/README.md`, a `probe` script in `package.json`,
  and `.visual-probe/` in `.gitignore`. `pnpm build && pnpm probe` runs 6 scenes, captures
  9 states at two widths plus a 6-sample time series of the indeterminate bar, and asserts
  one contract selector per state. Verified: exit 0 with no failed expectation, 24 PNGs,
  the Chromium profile cleaned up, and the suite still 116/116 with a clean `tsc`.
- Notes: `clip.scale` is mandatory in this Chromium's CDP schema and multiplies with the
  device scale factor, so it must be an explicit `1` (omitting it is a protocol error,
  passing `2` silently yields 4x images). Killing Chromium only *requests* termination, so
  the profile is deleted after the exit event and the delete retries the ENOTEMPTY race; a
  leftover cache must never turn a successful capture run into a failure.

## Review round (parent, after the writer returned)

The visual probe found three defects that no test could catch. All three are fixed in
`src/renderer/style.css` and re-verified against fresh screenshots.

1. **Indeterminate progress bar rendered empty.** Three stacked causes:
   (a) Chromium paints `::-webkit-progress-bar` over the progress element's own background,
   so element-level layers are invisible; (b) the first background layer is painted on top,
   so listing the always-visible base first hid the sweeping segment completely;
   (c) after inverting the layers the `@keyframes progress-sweep` still animated the base
   layer, and a 100%-wide layer cannot move under percentage positioning, so the segment
   stayed pinned at position 0. Fix: the element carries both layers with the segment
   listed first, `::-webkit-progress-bar` is transparent, and the keyframes animate the
   segment. Proven by histogram, not by eye: the accent-pixel count of six samples 220 ms
   apart now varies (10045 -> 13560 -> 14481 -> 373) where before it was a constant 14481.
2. **The results count read as stray body copy.** Added `section.panel > p:not([role])`
   (direct-child paragraphs that are not live regions), which also covers the cancellation
   notice. Verified: `4 resultados.` is now muted meta, and the rule does not match
   `p[role="status"]` or anything inside `div[role="status"]`.
3. **Table cells wrapped and centred.** `td:not(:nth-child(2))` gained `white-space: nowrap`
   and `td` gained `vertical-align: top`, so `26,67 m2/día` is one line and the order
   digits align with the first line of a wrapped component cell.

## Deviations from the frozen spec (implemented, deliberate)

- **Result rows, not per-result cards.** The spec's own "jerarquía por tamaño y peso, no por
  cajas" wins over its "subtle card" line: result items are hairline-separated rows inside
  the single search panel card, with a tinted expanded/hover state. Nested cards inside a
  card read heavy and make long BC3 code lists harder to scan.
- **The 3px rail is per panel, not fixed to the viewport.** The spec said "a `3px` fixed top
  rail" ambiguously; the shipped form pins a `::before` rail to each panel's top edge.
  Reviewed visually and kept. Making it a single viewport-top rail is a ~3-line change.

## Not in this change

- The visual probe harness shipped as its own follow-up work unit under
  `tools/visual-probe/`, not in this diff.
- `/tmp` in this environment is a tmpfs with an exhausted per-user quota: `pnpm test` and
  pi's extension loader both fail there with `Unknown system error -122` / `EDQUOT` unless
  `TMPDIR` points under `/home`. Worth documenting in the repository so the next agent does
  not have to rediscover it.
