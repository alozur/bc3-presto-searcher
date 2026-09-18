import { describe, expect, it, vi } from 'vitest';
import { createApprovedSourceFilePort } from './approvedFilePort';

describe('approved source file port', () => {
  it('turns a dismissed picker into cancellation and reads the selected approved file', async () => {
    const selectFile = vi.fn<() => Promise<string | undefined>>(async () => undefined);
    const readSelectedFile = vi.fn(async () => ({
      source: 'guadalajara-2016-eu' as const,
      displayName: 'Guadalajara2016_e+u.bc3',
      bytes: new Uint8Array(),
    }));
    const port = createApprovedSourceFilePort(selectFile, readSelectedFile);

    await expect(port.chooseAndReadApprovedSource()).resolves.toBe('cancelled');
    selectFile.mockResolvedValueOnce('/catalogs/Guadalajara2016_e+u.bc3');
    await expect(port.chooseAndReadApprovedSource()).resolves.toMatchObject({ source: 'guadalajara-2016-eu' });
    expect(readSelectedFile).toHaveBeenCalledWith('/catalogs/Guadalajara2016_e+u.bc3');
  });
});
