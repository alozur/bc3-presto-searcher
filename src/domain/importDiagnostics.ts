import type { ImportDiagnostic } from './catalog';

export function countSkippedRecords(diagnostics: readonly Pick<ImportDiagnostic, 'line' | 'recordTag'>[]): number {
  const records = new Set(diagnostics.map(({ line, recordTag }) => JSON.stringify([line, recordTag ?? ''])));
  return records.size;
}
