import { describe, expect, it, vi } from 'vitest';
import { GetItemDetail, ImportApprovedSource, SearchCatalog } from './useCases';
import type { CatalogRepository, SelectedSource } from './ports';
import type { SearchCandidate } from '../domain/catalog';

const source: SelectedSource = { source: 'guadalajara-2016-eu', displayName: 'Guadalajara2016_e+u.bc3', bytes: new TextEncoder().encode('~V|x|') };
const repo = (): CatalogRepository => ({ replaceSource: vi.fn(async () => undefined), findSearchCandidates: vi.fn(async () => []), getDetail: vi.fn(async () => null) });

function ranked(count: number): SearchCandidate[] {
  return Array.from({ length: count }, (_, index): SearchCandidate => ({ ref: { source: 'guadalajara-2016-eu', codeKey: `c${String(index + 1).padStart(2, '0')}` }, kind: 'partida', code: `C${String(index + 1).padStart(2, '0')}`, description: `Item ${String(index + 1).padStart(2, '0')}`, unit: 'm²', price: '1', keywords: [], expandedText: `Item ${String(index + 1).padStart(2, '0')}`, sourceDisplayName: 'Guadalajara2016_e+u.bc3', fieldCounts: { code: 1, description: 1, keywords: 0, expandedText: 1 }, exactCode: false }));
}

describe('application use cases', () => {
  it('does not call the repository for a blank query and clamps limits', async () => {
    const r = repo(); const useCase = new SearchCatalog(r);
    expect(await useCase.execute('   ', { limit: 0 })).toEqual({ status: 'empty-query' });
    expect(r.findSearchCandidates).not.toHaveBeenCalled();
    await useCase.execute('agua', { limit: 999 });
    expect(r.findSearchCandidates).toHaveBeenCalledWith(['agua']);
  });
  it('serves the requested page window while reporting the full match count', async () => {
    const r = repo();
    r.findSearchCandidates = vi.fn(async () => ranked(25));
    const useCase = new SearchCatalog(r);
    const page = await useCase.execute('x', { limit: 10, offset: 20 });
    expect(page.status === 'ok' && page.items.map((candidate) => candidate.code)).toEqual(['C21', 'C22', 'C23', 'C24', 'C25']);
    expect(page.status === 'ok' && { total: page.total, offset: page.offset, limit: page.limit }).toEqual({ total: 25, offset: 20, limit: 10 });
    const whole = await useCase.execute('x');
    expect(whole.status === 'ok' && { count: whole.items.length, total: whole.total, offset: whole.offset, limit: whole.limit }).toEqual({ count: 25, total: 25, offset: 0, limit: 100 });
  });
  it('serves the last reachable window when the requested offset is past the end', async () => {
    const r = repo();
    r.findSearchCandidates = vi.fn(async () => ranked(25));
    const useCase = new SearchCatalog(r);
    const past = await useCase.execute('x', { limit: 10, offset: 30 });
    expect(past.status === 'ok' && past.items.map((candidate) => candidate.code)).toEqual(['C21', 'C22', 'C23', 'C24', 'C25']);
    expect(past.status === 'ok' && { total: past.total, offset: past.offset, limit: past.limit }).toEqual({ total: 25, offset: 20, limit: 10 });
    const inRange = await useCase.execute('x', { limit: 10, offset: 20 });
    expect(inRange.status === 'ok' && { items: inRange.items.map((candidate) => candidate.code), total: inRange.total, offset: inRange.offset, limit: inRange.limit }).toEqual({ items: ['C21', 'C22', 'C23', 'C24', 'C25'], total: 25, offset: 20, limit: 10 });
    const unaligned = await useCase.execute('x', { limit: 10, offset: 7 });
    expect(unaligned.status === 'ok' && unaligned.offset).toBe(7);
  });
  it('snaps a shrunken match set to its last window and an empty result to offset zero', async () => {
    const r = repo();
    r.findSearchCandidates = vi.fn(async () => ranked(11));
    const useCase = new SearchCatalog(r);
    const shrunk = await useCase.execute('x', { limit: 10, offset: 20 });
    expect(shrunk.status === 'ok' && shrunk.items.map((candidate) => candidate.code)).toEqual(['C11']);
    expect(shrunk.status === 'ok' && { total: shrunk.total, offset: shrunk.offset, limit: shrunk.limit }).toEqual({ total: 11, offset: 10, limit: 10 });
    const empty = await new SearchCatalog(repo()).execute('x', { limit: 10, offset: 20 });
    expect(empty.status === 'ok' && { items: empty.items, total: empty.total, offset: empty.offset, limit: empty.limit }).toEqual({ items: [], total: 0, offset: 0, limit: 10 });
  });
  it('returns cancellation without parsing or replacing', async () => {
    const r = repo(); const files = { chooseAndReadApprovedSource: vi.fn(async () => 'cancelled' as const) };
    expect(await new ImportApprovedSource(files, r, { nowIso: () => 'now' }).execute()).toEqual({ status: 'cancelled' });
    expect(r.replaceSource).not.toHaveBeenCalled();
  });
  it('counts one skipped record for multiple unresolved children', async () => {
    const r = repo(); const files = { chooseAndReadApprovedSource: vi.fn(async () => ({ source: 'guadalajara-2016-eu' as const, displayName: 'synthetic.bc3', bytes: new TextEncoder().encode('~C|P1|u|Parent|1|x|0|\n~D|P1|M1\\\\1\\\\1\\\\M2\\\\1\\\\1|\n') })) };
    const result = await new ImportApprovedSource(files, r, { nowIso: () => 'now' }).execute();
    expect(result.skippedRecords).toBe(1);
    expect(result.diagnostics).toHaveLength(2);
  });
  it('returns detail through the repository boundary', async () => {
    const r = repo(); const ref = { source: 'guadalajara-2016-eu' as const, codeKey: 'x' };
    await new GetItemDetail(r).execute(ref); expect(r.getDetail).toHaveBeenCalledWith(ref);
  });
});
