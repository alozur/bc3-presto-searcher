import { describe, expect, it } from 'vitest';
import { admitSource } from './source';
import { parseDecimalText } from './decimal';
import { normalizeTokens, rankCandidates } from './search';
import type { SearchCandidate } from './catalog';

describe('approved sources and values', () => {
  it('admits only the exact approved basenames, case-insensitively', () => {
    expect(admitSource('GUADALAJARA2016_R+M.BC3')).toBe('guadalajara-2016-rm');
    expect(admitSource('other.bc3')).toBeUndefined();
    expect(admitSource('Guadalajara2016_r+m.bc3.bak')).toBeUndefined();
  });
  it('canonicalizes decimal commas and rejects unsafe numeric syntax', () => {
    expect(parseDecimalText(' +001,2300 ')).toBe('1.23');
    expect(parseDecimalText('-.50')).toBe('-0.5');
    expect(() => parseDecimalText('1e3')).toThrow();
    expect(() => parseDecimalText('Infinity')).toThrow();
  });
});

describe('search policy', () => {
  it('normalizes Spanish text while preserving ñ and removing duplicate terms', () => {
    expect(normalizeTokens('Ñandú, AGUA agua; árbol')).toEqual(['ñandu', 'agua', 'arbol']);
  });
  it('ranks complete description matches before code-only matches', () => {
    const make = (description: string, code: string, counts: SearchCandidate['fieldCounts']): SearchCandidate => ({
      ref: { source: 'guadalajara-2016-eu', codeKey: code.toLowerCase() }, kind: 'resource', code,
      description, unit: 'u', price: '1', keywords: [], expandedText: '', sourceDisplayName: 'x', fieldCounts: counts, exactCode: false,
    });
    const result = rankCandidates([
      make('Pintura', 'AGUA', { description: 0, keywords: 0, code: 1, expandedText: 0 }),
      make('Agua pintura', 'X', { description: 2, keywords: 0, code: 0, expandedText: 0 }),
    ], ['agua', 'pintura']);
    expect(result[0].description).toBe('Agua pintura');
  });
});
