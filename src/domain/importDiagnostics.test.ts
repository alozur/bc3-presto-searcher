import { describe, expect, it } from 'vitest';
import { countSkippedRecords } from './importDiagnostics';

describe('skipped record diagnostics', () => {
  it('deduplicates by physical line and record tag', () => {
    expect(countSkippedRecords([
      { line: 4, recordTag: 'D' },
      { line: 4, recordTag: 'D' },
      { line: 5, recordTag: 'D' },
      { line: 5, recordTag: 'C' },
      { line: 6 },
      { line: 6 },
    ])).toBe(4);
  });
});
