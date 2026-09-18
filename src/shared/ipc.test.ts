import { describe, expect, it } from 'vitest';
import { validateDetailRequest, validateSearchRequest } from './ipc';

describe('IPC request validation', () => {
  it('accepts only bounded plain search requests', () => {
    expect(validateSearchRequest({ query: 'agua', limit: 4 })).toEqual({ query: 'agua', limit: 4 });
    expect(() => validateSearchRequest({ query: 'x', extra: true })).toThrow();
    expect(() => validateSearchRequest({ query: 'x'.repeat(10001) })).toThrow();
  });
  it('validates source-scoped detail identifiers', () => {
    expect(validateDetailRequest({ source: 'guadalajara-2016-eu', codeKey: 'e11xm020' })).toEqual({ source: 'guadalajara-2016-eu', codeKey: 'e11xm020' });
    expect(() => validateDetailRequest({ source: 'other', codeKey: 'x' })).toThrow();
  });
});
