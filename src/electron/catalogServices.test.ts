import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCatalogServices } from './catalogServices';

describe('Electron catalog services', () => {
  it('imports a synthetic approved selection into SQLite and serves SYN-ASM-001 through main-process handlers', async () => {
    const services = createCatalogServices({
      databasePath: ':memory:',
      files: {
        chooseAndReadApprovedSource: async () => ({
          source: 'guadalajara-2016-eu',
          displayName: 'synthetic-assembly.windows-1252.bc3',
          bytes: readFileSync('fixtures/bc3/synthetic-assembly.windows-1252.bc3'),
        }),
      },
      clock: { nowIso: () => '2025-01-01T00:00:00.000Z' },
    });

    await expect(services.handlers.importApprovedSource()).resolves.toMatchObject({ importedPartidas: 1, importedResources: 3 });
    const search = await services.handlers.search({ query: 'SYN-ASM-001' });
    expect(search).toMatchObject({ status: 'ok' });
    if (search.status !== 'ok') throw new Error('expected an imported catalog');
    await expect(services.handlers.detail(search.items[0]!.ref)).resolves.toMatchObject({ kind: 'partida', item: { code: 'SYN-ASM-001' } });
  });
});
