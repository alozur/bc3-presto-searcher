import { describe, expect, it, vi } from 'vitest';
import { GetItemDetail, ImportApprovedSource, SearchCatalog } from './useCases';
import type { CatalogRepository, SelectedSource } from './ports';

const source: SelectedSource = { source: 'guadalajara-2016-eu', displayName: 'Guadalajara2016_e+u.bc3', bytes: new TextEncoder().encode('~V|x|') };
const repo = (): CatalogRepository => ({ replaceSource: vi.fn(async () => undefined), findSearchCandidates: vi.fn(async () => []), getDetail: vi.fn(async () => null) });

describe('application use cases', () => {
  it('does not call the repository for a blank query and clamps limits', async () => {
    const r = repo(); const useCase = new SearchCatalog(r);
    expect(await useCase.execute('   ', 0)).toEqual({ status: 'empty-query' });
    expect(r.findSearchCandidates).not.toHaveBeenCalled();
    await useCase.execute('agua', 999);
    expect(r.findSearchCandidates).toHaveBeenCalledWith(['agua']);
  });
  it('returns cancellation without parsing or replacing', async () => {
    const r = repo(); const files = { chooseAndReadApprovedSource: vi.fn(async () => 'cancelled' as const) };
    expect(await new ImportApprovedSource(files, r, { nowIso: () => 'now' }).execute()).toEqual({ status: 'cancelled' });
    expect(r.replaceSource).not.toHaveBeenCalled();
  });
  it('returns detail through the repository boundary', async () => {
    const r = repo(); const ref = { source: 'guadalajara-2016-eu' as const, codeKey: 'x' };
    await new GetItemDetail(r).execute(ref); expect(r.getDetail).toHaveBeenCalledWith(ref);
  });
});
