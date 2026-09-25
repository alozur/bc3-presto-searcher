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

## Work unit 3: missing breakdown component index (performance)

User report: a re-import ran for over 25 minutes and appeared stuck at 0 %.

Root cause found by measuring the running process and the real database rather
than theorising: the process was at 87 % CPU with the WAL growing ~96 KB/s, so it
was working, not deadlocked. `breakdown_lines` declares
`FOREIGN KEY(parent_source_key, component_code_key) REFERENCES items(source_key, code_key)`
with no child-side index. SQLite full-scans the child table for every deleted
parent row, so `DELETE FROM items WHERE source_key = ?` over 68,054 parents and
195,975 child rows is about 13.3 billion row visits.

Confirmed against the real database: the only indexes present were the PRIMARY
KEY autoindexes plus `token_lookup`.

Measured: 27M row visits took 3,014 ms without the index and 243 ms with it. The
real re-import delete extrapolates to ~24.8 minutes, matching the observed run.
A fresh import into an empty database is only ~32 s of real work.

This was pre-existing, not caused by the progress work: the re-import path was
always quadratic and the previous UI simply had no percentage to reveal it.

Fix: one idempotent `CREATE INDEX IF NOT EXISTS breakdown_component_lookup` in
`migrate()`. The progress denominator was deliberately left alone, per the user's
explicit choice.

Verified end to end on a pre-existing populated database: the index appears on
open, existing rows survive, and the equivalent delete drops to 68 ms.

## Work unit 4: import panel shown before the file was chosen (UX)

User report: the loading information appears as soon as the button is clicked,
while the native file dialog still covers the window.

The panel once again renders only when a real progress event exists, gated on
`importActivity.progress !== null`. The button stays disabled for the whole
pending window so a second dialog cannot open, and search stays usable.

Known residual: after the file is chosen there is roughly 0.6 s with no feedback
while the 26.6 MB payload is decoded and split before the first event. Removing
that gap would need a new main-to-renderer signal when the dialog closes.

## Work unit 5: skip a re-import of unchanged content

Measured on the real workload: a re-import costs 125 s on a warm copy and 233 s
right after the migrations, because it deletes and re-inserts 2.8 million
identical rows. That work is pure waste when the selected file has not changed.

The SHA-256 of the selected bytes is stored in a new `sources.content_hash`
column inside the same transaction as the import, so a failed import can never
leave a stored hash behind and a false "unchanged" is impossible. Before
parsing anything the worker opens the repository so the migration runs, hashes
the bytes, and asks `findUnchangedImport`. On a hit it posts `completed` with
`unchanged: true` and the stored summary, with no parse, no delete, no insert,
and no progress events. A NULL stored hash never matches, so sources imported by
an older build are re-imported once and then carry a hash.

The migration is guarded with `PRAGMA table_info(sources)` because SQLite has no
`ADD COLUMN IF NOT EXISTS`, and the `sources` upsert was rewritten with explicit
column names now that the table has five columns.

The UI reports "el archivo no ha cambiado desde la última importación" with the
original date, and suppresses the counts, the skipped-records line, and the
diagnostics panel rather than presenting stored data as if it were re-measured.

Verified end to end on a copy of the real 690 MB database in its pre-migration
four-column shape: the column is added, all 83,330 items and 3,340,703 tokens
survive, the lookup returns null before the first hashed import and 98 ms with
the stored summary afterwards, and a different hash never matches.

## Correction to an earlier diagnosis

The import that appeared to hang had in fact committed successfully. Its stored
`imported_at` of `2026-09-25T08:51:42.095Z` is UTC, which is 10:51:42 local,
about 2 min 44 s after the app started at 10:48:58. The claim that nothing had
committed came from inspecting the database with a read-only connection that was
reading the main file without the WAL, so it saw a stale row. A `wal_checkpoint`
run later made the committed value visible. There was never a hang.

## Review workload

Work unit 5: 8 modified files plus one new test file, about 190 changed lines.
Branch total vs `main` is 18 files, roughly +770/-45.

## Allowed edit surfaces

- `src/electron/progressThrottle.ts` (new)
- `src/electron/progressThrottle.test.ts` (new)
- `src/electron/importWorker.ts`
- `src/renderer/App.tsx`
- `src/renderer/App.test.tsx`
- `src/renderer/style.css`

## Evidence

- Work unit 1 commit: `19a29ee`
