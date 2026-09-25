import { describe, expect, it, vi } from 'vitest';
import { createIpcHandlers } from './ipcHandlers';

describe('catalog IPC handlers', () => {
  it('validates renderer requests and delegates import, search, and detail to application use cases', async () => {
    const importSource = { execute: vi.fn(async () => ({ status: 'cancelled' as const })) };
    const searchCatalog = { execute: vi.fn(async () => ({ status: 'empty-query' as const })) };
    const getItemDetail = { execute: vi.fn(async () => null) };
    const handlers = createIpcHandlers({ importSource, searchCatalog, getItemDetail });

    await expect(handlers.importApprovedSource()).resolves.toEqual({ status: 'cancelled' });
    await expect(handlers.search({ query: ' barniz ', limit: 4 })).resolves.toEqual({ status: 'empty-query' });
    await expect(handlers.detail({ source: 'guadalajara-2016-eu', codeKey: 'E11XM020' })).resolves.toBeNull();
    await expect(handlers.search({ query: 'x', unsafe: true })).rejects.toThrow('invalid-request');

    expect(importSource.execute).toHaveBeenCalledOnce();
    expect(searchCatalog.execute).toHaveBeenCalledWith(' barniz ', { limit: 4, offset: 0 });
    expect(getItemDetail.execute).toHaveBeenCalledWith({ source: 'guadalajara-2016-eu', codeKey: 'e11xm020' });
  });
});
