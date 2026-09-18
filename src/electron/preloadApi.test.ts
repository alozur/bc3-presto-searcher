import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../shared/ipc';
import { createPreloadApi } from './preloadApi';

describe('typed preload API', () => {
  it('exposes only the approved catalog operations over their IPC channels', async () => {
    const invoke = vi.fn(async () => ({ status: 'ok' }));
    const api = createPreloadApi(invoke);

    await api.importApprovedSource();
    await api.search({ query: 'barniz', limit: 3 });
    await api.getDetail({ source: 'guadalajara-2016-eu', codeKey: 'e11xm020' });

    expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.import);
    expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.search, { query: 'barniz', limit: 3 });
    expect(invoke).toHaveBeenNthCalledWith(3, IPC_CHANNELS.detail, { source: 'guadalajara-2016-eu', codeKey: 'e11xm020' });
  });

  it('subscribes only to typed import progress events', () => {
    const subscribe = vi.fn(() => () => undefined);
    const listener = vi.fn();
    const api = createPreloadApi(vi.fn(), subscribe);

    api.onImportProgress(listener);

    expect(subscribe).toHaveBeenCalledWith(IPC_CHANNELS.importProgress, listener);
  });
});
