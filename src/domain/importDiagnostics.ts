import type { ImportDiagnostic } from './catalog';

/** Diagnostics about imported content that do not represent an omitted/skipped source record. */
const IMPORTED_DIAGNOSTIC_CODES = new Set(['missing-price-defaulted']);

export function countSkippedRecords(diagnostics: readonly Pick<ImportDiagnostic, 'code' | 'line' | 'recordTag'>[]): number {
  const records = new Set(
    diagnostics
      .filter(({ code }) => !IMPORTED_DIAGNOSTIC_CODES.has(code))
      .map(({ line, recordTag }) => JSON.stringify([line, recordTag ?? ''])),
  );
  return records.size;
}
