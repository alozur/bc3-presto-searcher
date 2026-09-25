# Feature: bc3-import-progress (throttled, truthful staged loading)

Branch: `feat/bc3-import-progress`

## Context

Two work units on one branch.

- **Work unit 1** (`19a29ee`): inherited, already-verified staged progress candidate
  (11 files, +169/-37). Parser emits per-record progress, repository emits per
  write-operation progress, worker/importer forward structured events, renderer
  shows a Spanish stage checklist.
- **Work unit 2** (this document): make that progress actually usable.

## Problem

The work unit 1 plumbing emits one event per unit of work with no throttle
anywhere between the parser and the renderer:

`parseBc3` -> `replaceSource` -> worker `postMessage` -> `backgroundImporter`
-> `webContents.send` -> React `setState`.

Measured against the real local BC3 catalogs:

| Catalog | Size | Records | Parse events | Store events | Total IPC messages |
| --- | --- | --- | --- | --- | --- |
| `Guadalajara2016_e+u.bc3` | 26.6 MB | 193,127 | 193,128 | 2,801,506 | ~3,000,000 |
| `Guadalajara2016_r+m.bc3` | 8.2 MB | 50,603 | 50,604 | 872,709 | ~923,000 |

The store stage emits per unique search token, which is why 68,054 items become
2.8M events. Measured worker `postMessage` cost is ~5.9 us/message, so the store
stage alone spends ~16.5 s in pure messaging, before the heavier main->renderer
hop and one React render per message.

Work itself is cheap: parsing those 26.6 MB takes 3.9 s and persistence is one
atomic transaction. The renderer is starved by event volume, not by work.

Silent phases measured on `Guadalajara2016_e+u.bc3`: 574 ms before the first
event (decode + split) and 1,330 ms with no event during relation validation.

## Constraints (from prior product decisions)

- Progress stays **stage-scoped and measured**. A global percentage would be
  fabricated because parser and persistence have independent denominators. This
  is pinned by `src/shared/ipc.test.ts` ("without a global percentage").
- No fabricated ETA. Only measured facts are shown.
- Parser and repository keep emitting per unit: both contracts are pinned by
  exact-equality tests. Throttling happens only in the worker.
- Spanish user-facing copy; English technical artifacts.
- Atomic SQLite replacement is preserved.
- Strict TDD via `pnpm test`.

## Tasks

- [x] Branch `feat/bc3-import-progress`; verify inherited candidate
      (`pnpm test` 17 files / 71 tests, `pnpm build`, `git diff --check`).
- [x] Commit work unit 1 as `19a29ee`.
- [x] RED/GREEN: pure percent+interval throttle helper in the worker. RED observed by the
      parent (module unresolved before it existed); the helper satisfies the frozen
      `progressThrottle.test.ts` unchanged.
- [x] Wire the throttle into `importWorker.ts` for both stages.
- [x] RED/GREEN: measured per-stage progress bar, record counter, live elapsed.
- [x] RED/GREEN: 10 % milestones for the current stage. The milestone history is
      deliberately NOT a live region: the `role="status"` line is the single
      fast-changing live region, so screen readers announce progress once.
- [x] Full `pnpm exec vitest run` (18 files / 80 tests), `npx tsc --noEmit`,
      `git diff --check`.
- [ ] Commit work unit 2.
- [ ] Manual validation with `pnpm electron:start` (requires `pnpm electron:rebuild`
      first, because `pnpm test` rebuilds the native module for Node).

## Outcome

Work unit 2 changed 4 tracked files (+174/-5) plus one new module and its test.

Independently measured event reduction (parent and independent verifier, real
local catalogs, 80 ms floor):

| Catalog | Raw events | Forwarded | Reduction |
| --- | --- | --- | --- |
| `e+u` (26.6 MB) | 2,994,634 | ~83-120 | ~25,000x |
| `r+m` (8.2 MB) | 923,313 | ~69-106 | ~8,700x |

The store stage is capped at 101 events by the per-percent ceiling regardless of
catalog size. The ~16.5 s of store-stage messaging overhead is eliminated.

## Verification

Native review ASSESS returned `risk: unassessable` because untracked files need an
explicit declaration, which by rule is verified exactly like high risk: writer
self-verification plus a separate independent verifier. The independent verifier
reported no blocking or major defects and reproduced the reduction table above.

Non-blocking findings left as follow-ups:

- On a second import, the pending render can show the previous import's elapsed
  value for one frame (post-paint effect). Cosmetic.
- `measuredPercent` non-finite and clamp branches are untested, and the default
  `minIntervalMs` is never exercised; every test passes explicit options.
- StrictMode is not present in the App test render, so the purity argument for the
  milestone updater is demonstrated outside the suite.
- The throttle trusts upstream monotonicity; it does not enforce it itself.
- `src/shared/ipc.test.ts` pins "no global percentage" only nominally, via
  `toHaveLength(3)`, rather than behaviorally.

## Allowed edit surfaces

- `src/electron/progressThrottle.ts` (new)
- `src/electron/progressThrottle.test.ts` (new)
- `src/electron/importWorker.ts`
- `src/renderer/App.tsx`
- `src/renderer/App.test.tsx`
- `src/renderer/style.css`

## Evidence

- Work unit 1 commit: `19a29ee`
