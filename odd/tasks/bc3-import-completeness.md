# BC3 import completeness

## Goal
Preserve as much valid BC3 catalog data as possible during import instead of dropping whole concepts or partidas when a related record is incomplete.

## Constraints
- Do not add real Guadalajara BC3 source extracts to the repository.
- Keep the importer deterministic and covered by synthetic fixtures.
- Prefer partial import with diagnostics over silently deleting otherwise valid items.

## Tasks

### 1. Reproduce omission classes with parser tests
- Status: done
- Evidence: gentle-ai-worker observed focused red/green evidence in `src/domain/bc3/parser.test.ts` for empty-price concepts and partially unresolved decompositions.
- Notes: Cover at least unresolved child handling and empty-price concepts because both can make valid catalog rows disappear.

### 2. Make parser tolerant without violating DB integrity
- Status: done
- Evidence: Parser now defaults empty prices to `0`, keeps valid breakdown lines when some children are unresolved, and skipped-record counting excludes imported defaulted-price diagnostics.
- Notes: Keep valid concepts/items and valid breakdown lines; keep diagnostics for unsupported or unresolved parts.

### 3. Export BC3 pliego L records into searchable item text
- Status: done
- Evidence: Local real-file probe found `Guadalajara2016_e+u.bc3` has 283 `~L` pliego records and one `~E` entity record reported as unsupported/skipped by the previous parser; parser now attaches `~L` text to parent `expandedText` and has focused tests for normal, trailing-pipe, orphan, and malformed cases.
- Notes: Attach `~L` pliego section text to the parent concept's searchable expanded text instead of treating it as unsupported.

### 4. Persist BC3 E entity records
- Status: done
- Evidence: After `~L` support, local real-file parser check reported `Guadalajara2016_e+u.bc3` had one remaining skipped `~E` entity record; parser now exposes `entities` and SQLite stores them in `source_entities`.
- Notes: Store source entity metadata in SQLite rather than reporting it as unsupported.

### 5. Verify focused and full import behavior
- Status: done
- Evidence: Local compiled parser check on the two approved Guadalajara downloads now reports zero diagnostics and zero skipped records for both files; E+U has 68,054 items, 195,975 breakdowns, and 1 source entity; R+M has 15,276 items and 54,201 breakdowns. Independent verification passed focused Vitest (30 tests), full `pnpm test` (116 tests), `pnpm exec tsc -p tsconfig.json --noEmit`, and `pnpm build`.
- Notes: Run focused parser/repository tests and the full test suite or document any unavailable checks.
