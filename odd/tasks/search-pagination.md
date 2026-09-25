# Feature: search-pagination (10 per page over the full match set)

Branch: `feat/search-pagination`
Base: `main` @ `0388c06`

## Request

User request (verbatim intent): "quiero que en los resultados que te muestra hagas
un paginado de 10 en 10 … y llevarlo hasta main".

Decisions confirmed by the user before any write:

1. **Branch from `main`.** The local-only `feat/renderer-visual-refresh` commit
   `5f8ddba` stays out of `main`, so this work is built against `main`'s
   pre-refresh renderer (`style.css` is 59 lines there).
2. **Pagination covers the whole match set**, not only the first 100 rows the
   renderer used to receive.
3. **Delivery runs to `origin/main`**: one work-unit commit per task, then merge
   and push.

## Current behaviour (read from the code before the change)

- `SearchCatalog.execute(query, limit = 100)` ranked every matching candidate in
  memory and sliced the first `limit`.
- `SearchRequest` carried `query` and an optional `limit`;
  `validateSearchRequest` clamped `limit` into `[1, 100]`.
- The renderer rendered `searchResult.items` with no paging and printed
  `items.length` as "N resultados.".

Two consequences: matches past position 100 were unreachable, and the count line
reported the size of the served window, not the size of the match set.

## Design

Server-side paging on the existing boundary; the renderer owns the page size.

- `SearchResponse` gains `total`, `offset`, and `limit`: the truth about the whole
  match set plus the window actually served.
- `SearchRequest` gains an optional `offset`, validated as a finite number and
  clamped to `>= 0`; `limit` keeps its `[1, 100]` bound.
- `SearchCatalog.execute(query, { limit, offset })` ranks the full candidate set
  once and returns the requested window plus the full count. A request that would
  land past the end is served the last whole window instead of an empty one, and
  `offset` reports what was served; an in-range request is honored verbatim.
- The renderer pages at `SEARCH_PAGE_SIZE = 10` and asks for the window it needs
  (`offset = current ± pageSize`). The current page is **derived from the served
  window** (`floor(offset / limit) + 1`) instead of held as separate state, so the
  pager cannot drift from the list, a failed request leaves the visible page
  untouched, and no revert logic is needed. A `searchRequestVersion` guard drops a
  response that loses the race with a newer search.
- The pager sits outside the results `<ul>` so the existing `ul button` selectors
  keep matching only result rows.

## Constraints

- Layering: `application` must not import `shared`; the use case keeps its own
  clamp helpers, as it did before.
- Ranking rules and the SQLite repository are untouched: `findSearchCandidates`
  has no `LIMIT`, so `total` really is the full match count and the deterministic
  comparator keeps windows stable across calls.
- Spanish user-facing copy; English technical artifacts.
- The pagination styles land in `main`'s 59-line `style.css` and stay
  self-contained so the later visual-refresh restyle can re-adopt them.

## Tasks

- [x] **T1 — contract** (`f52026b`): `total`/`offset` on the search path
      (`domain/catalog.ts`, `shared/ipc.ts`, `application/useCases.ts`,
      `electron/ipcHandlers.ts`) plus the pinned tests that encoded the old shape.
      Backward compatible: the renderer was unchanged, so it still received up to
      100 rows.
- [x] **T2 — renderer** (`af52046`): the 10-per-page pager (`renderer/App.tsx`,
      `renderer/style.css`, six new renderer tests).
- [x] **T3 — defect fix** (`50a9be6`): an offset past the end returned an empty
      window under a nonzero `total`, so the renderer drew "N resultados." above
      an empty list with the pager collapsed and could label "Página 3 de 2". The
      use case now snaps such a request to the last reachable window.
- [x] **T4 — contract precision** (`b8c80a4`): the T3 snap clamped against the last
      *aligned* window start, so an in-range but unaligned request was rewound
      silently (with the default `limit` of 100, `offset 5` returned every match
      from zero). An in-range request is now honored verbatim; only a genuinely
      past-the-end request snaps.

## Outcome

Four work units, 10 tracked files, `+270/−26` against `main`:

| Area | Files |
| --- | --- |
| Contract | `src/domain/catalog.ts`, `src/shared/ipc.ts`, `src/application/useCases.ts`, `src/electron/ipcHandlers.ts` |
| Renderer | `src/renderer/App.tsx`, `src/renderer/style.css` |
| Tests | `src/shared/ipc.test.ts`, `src/application/useCases.test.ts`, `src/electron/ipcHandlers.test.ts`, `src/renderer/App.test.tsx` |

`pnpm test`: 20 files / 128 tests passed (from 118 at `main`).
`npx tsc -p tsconfig.json --noEmit`: clean. `git diff --check`: clean.

## Verification

Three independent `gentle-ai-verify` passes over the branch (read-only, separate
from the writer), reusing the same session so each finding was re-checked against
its own report:

1. First pass: no blocking or major defect. Two minors — an out-of-range window
   rendering an empty list under a nonzero `total`, and a possible "Página X de Y"
   with `X > Y` — plus nits.
2. Second pass, on `50a9be6`: both minors resolved, with the offset arithmetic
   recomputed cell by cell for `limit = 10` across `total ∈ {0, 1, 9, 10, 11, 25}`.
   One new minor: the snapshot rewound in-range unaligned offsets.
3. Final pass, on `b8c80a4`: item 1 resolved; suite/type-check/whitespace green;
   verdict **ready to merge**.

The reported defect states are pinned by tests at the layer that owns the rule:
`src/application/useCases.test.ts` covers the window contract, and
`src/renderer/App.test.tsx` covers the user-visible outcome when the match set
shrinks below the current offset.

## Accepted residuals (not fixed, by decision)

- **Pager race is a duplicate request, not a skip.** The page is derived from the
  served window, so two fast clicks on "Siguiente" ask for the same next window
  twice instead of advancing two pages. Idempotent, and the version guard keeps the
  last response — but it is one request more than needed.
- **Renderer regression test does not exercise the real snap.** `pagedSearch` in
  `App.test.tsx` returns a raw slice, and the shrinking-set test mocks the served
  window directly; snap coverage lives in `useCases.test.ts`. Adequate, but not
  end-to-end.
- **IPC `offset` has no upper bound.** With the snap rule a huge offset is
  harmless (it is served the last whole window), so the documented contract stays
  `offset >= 0`.
- **Accessibility:** only the page number is announced (`aria-live="polite"`); the
  newly loaded rows are not. Making the list live would double-announce on every
  page change, so it was left alone. Verified structurally, not with a screen
  reader.
- **Performance:** every page request re-runs the token query (`findSearchCandidates`
  has no `LIMIT`) and re-ranks the entire match set before slicing ten rows. That
  is pre-existing behaviour, unchanged by this work.

## Housekeeping note

`.git/info/exclude` gained a `.visual-probe/` entry during this session (local
scratch screenshots). It lives inside `.git/`, is unknown to git, and cannot be
committed; it only stops that scratch directory from showing as untracked. No
tracked file was affected.
