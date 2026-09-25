import { describe, expect, it } from 'vitest';
import { countSkippedRecords } from './importDiagnostics';

describe('skipped record diagnostics', () => {
  it('deduplicates by physical line and record tag', () => {
    expect(countSkippedRecords([
      { code: 'malformed-decimal', line: 4, recordTag: 'D' },
      { code: 'malformed-decimal', line: 4, recordTag: 'D' },
      { code: 'malformed-decimal', line: 5, recordTag: 'D' },
      { code: 'unknown-parent', line: 5, recordTag: 'C' },
      { code: 'unknown-tag', line: 6 },
      { code: 'unknown-tag', line: 6 },
    ])).toBe(4);
  });

  it('excludes missing-price-defaulted from skipped record counts', () => {
    expect(countSkippedRecords([
      { code: 'missing-price-defaulted', line: 10, recordTag: 'C' },
      { code: 'missing-price-defaulted', line: 12, recordTag: 'C' },
      { code: 'malformed-decimal', line: 20, recordTag: 'C' },
      { code: 'malformed-decimal', line: 20, recordTag: 'C' },
      { code: 'unknown-parent', line: 30, recordTag: 'D' },
      { code: 'unresolved-child', line: 40, recordTag: 'D' },
      { code: 'unknown-tag', line: 50, recordTag: 'X' },
    ])).toBe(4);
  });
});
