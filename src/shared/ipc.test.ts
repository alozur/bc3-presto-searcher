import { describe, expect, it } from 'vitest';
import { validateDetailRequest, validateSearchRequest, type ImportResponse, type ImportProgress } from './ipc';

describe('IPC request validation', () => {
  it('accepts only bounded plain search requests', () => {
    expect(validateSearchRequest({ query: 'agua', limit: 4 })).toEqual({ query: 'agua', limit: 4 });
    expect(() => validateSearchRequest({ query: 'x', extra: true })).toThrow();
    expect(() => validateSearchRequest({ query: 'x'.repeat(10001) })).toThrow();
  });
  it('defines named, measured import stages without a global percentage', () => {
    const progress: ImportProgress[] = [
      { stage: 'processing-records', completed: 2, total: 4 },
      { stage: 'validating-relations' },
      { stage: 'storing', completed: 3, total: 6 },
    ];
    expect(progress).toHaveLength(3);
  });

  it('validates source-scoped detail identifiers', () => {
    expect(validateDetailRequest({ source: 'guadalajara-2016-eu', codeKey: 'e11xm020' })).toEqual({ source: 'guadalajara-2016-eu', codeKey: 'e11xm020' });
    expect(() => validateDetailRequest({ source: 'other', codeKey: 'x' })).toThrow();
  });

  it('type-checks successful import responses with and without the unchanged flag', () => {
    const withoutUnchanged: ImportResponse = { source: 'guadalajara-2016-eu', sourceDisplayName: 'catalog.bc3', importedPartidas: 1, importedResources: 2, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' };
    const withUnchanged: ImportResponse = { ...withoutUnchanged, unchanged: true };
    expect(withoutUnchanged).not.toHaveProperty('unchanged');
    expect(withUnchanged.unchanged).toBe(true);
  });
});
