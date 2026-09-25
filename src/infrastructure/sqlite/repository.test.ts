import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GetItemDetail, ImportApprovedSource, SearchCatalog } from '../../application/useCases';
import { parseBc3 } from '../../domain/bc3/parser';
import type { ImportSnapshot, SourceKey } from '../../domain/catalog';
import { SqliteCatalogRepository } from './repository';

const singleResource = (source: SourceKey, code: string): ImportSnapshot => parseBc3(
  new TextEncoder().encode(`~C|${code}|u|${code} description|1|x|0|\n`),
  source,
  `${code}.bc3`,
);

describe('SQLite catalog persistence', () => {
  it('imports SYN-ASM-001, finds it, and returns its ordered typed breakdown', async () => {
    const repo = SqliteCatalogRepository.open(':memory:');
    const bytes = readFileSync('fixtures/bc3/synthetic-assembly.windows-1252.bc3');
    const imported = await new ImportApprovedSource(
      { chooseAndReadApprovedSource: async () => 'cancelled' },
      repo,
      { nowIso: () => '2025-01-01T00:00:00.000Z' },
    ).execute({
      source: 'guadalajara-2016-eu',
      displayName: 'synthetic-assembly.windows-1252.bc3',
      bytes,
    });

    expect(imported).toMatchObject({
      source: 'guadalajara-2016-eu',
      importedPartidas: 1,
      importedResources: 3,
    });

    const search = await new SearchCatalog(repo).execute('SYN-ASM-001');
    expect(search).toMatchObject({ status: 'ok' });
    if (search.status !== 'ok') throw new Error('expected a searchable catalog');
    expect(search.items.map((item) => item.code)).toEqual(['SYN-ASM-001']);

    const detail = await new GetItemDetail(repo).execute(search.items[0]!.ref);
    expect(detail).toEqual({
      kind: 'partida',
      item: expect.objectContaining({
        code: 'SYN-ASM-001',
        description: 'Synthetic assembly Ÿ',
      }),
      breakdown: [
        expect.objectContaining({ ordinal: 0, sourceLine: 5, component: { code: 'SYN-LAB-001', kind: 'resource', description: 'Synthetic labor', unit: 'h', unitPrice: '25' }, factor: '1', yield: '0.5' }),
        expect.objectContaining({ ordinal: 1, sourceLine: 5, component: { code: 'SYN-MAT-002', kind: 'resource', description: 'Synthetic material', unit: 'kg', unitPrice: '3.5' }, factor: '2', yield: '1.25' }),
        expect.objectContaining({ ordinal: 2, sourceLine: 5, component: { code: 'SYN-TOOL-003', kind: 'resource', description: 'Synthetic tool', unit: 'u', unitPrice: '12' }, factor: '1', yield: '0.1' }),
      ],
    });
  });

  it('creates an idempotent child-side index for the breakdown component foreign key', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bc3-repository-')), 'catalog.sqlite');
    SqliteCatalogRepository.open(path);
    const reopened = SqliteCatalogRepository.open(path);
    const db = (reopened as unknown as { db: { prepare: (sql: string) => { all: (...params: string[]) => Array<{ name: string }> } } }).db;

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='breakdown_lines'").all();
    expect(indexes.map((index) => index.name)).toContain('breakdown_component_lookup');
    const columns = db.prepare('PRAGMA index_info(breakdown_component_lookup)').all();
    expect(columns.map((column) => column.name)).toEqual(['parent_source_key', 'component_code_key']);
  });

  it('reports monotonic persistence progress from explicit write operations before committing', async () => {
      const repo = SqliteCatalogRepository.open(':memory:');
      const progress: { completed: number; total: number }[] = [];
      await repo.replaceSource(singleResource('guadalajara-2016-eu', 'E-PROGRESS'), (update) => progress.push(update));

      expect(progress).toEqual([
        { completed: 0, total: 8 }, { completed: 1, total: 8 }, { completed: 2, total: 8 },
        { completed: 3, total: 8 }, { completed: 4, total: 8 }, { completed: 5, total: 8 },
        { completed: 6, total: 8 }, { completed: 7, total: 8 }, { completed: 8, total: 8 },
      ]);
    });

    it('replaces only the imported source and retains its prior data when a replacement fails', async () => {
    const repo = SqliteCatalogRepository.open(':memory:');
    await repo.replaceSource(singleResource('guadalajara-2016-eu', 'E-ORIGINAL'));
    await repo.replaceSource(singleResource('guadalajara-2016-rm', 'RM-ONLY'));

    const broken: ImportSnapshot = {
      source: 'guadalajara-2016-eu',
      sourceDisplayName: 'broken.bc3',
      items: [{
        ref: { source: 'guadalajara-2016-eu', codeKey: 'e-replacement' },
        kind: 'partida', code: 'E-REPLACEMENT', description: 'Replacement', unit: 'u', price: '1',
        keywords: [], expandedText: '', sourceDisplayName: 'broken.bc3',
      }],
      breakdowns: [{
        parent: { source: 'guadalajara-2016-eu', codeKey: 'e-replacement' },
        line: {
          ordinal: 0, sourceLine: 1, factor: '1', yield: '1',
          component: { code: 'MISSING', kind: 'resource', description: 'Missing', unit: 'u', unitPrice: '1' },
        },
      }],
      diagnostics: [],
    };

    await expect(repo.replaceSource(broken)).rejects.toThrow();
    expect(await repo.getDetail({ source: 'guadalajara-2016-eu', codeKey: 'e-original' })).not.toBeNull();
    expect(await repo.getDetail({ source: 'guadalajara-2016-rm', codeKey: 'rm-only' })).not.toBeNull();

    await repo.replaceSource(singleResource('guadalajara-2016-eu', 'E-REPLACEMENT'));
    expect(await repo.getDetail({ source: 'guadalajara-2016-eu', codeKey: 'e-original' })).toBeNull();
    expect(await repo.getDetail({ source: 'guadalajara-2016-eu', codeKey: 'e-replacement' })).not.toBeNull();
    expect(await repo.getDetail({ source: 'guadalajara-2016-rm', codeKey: 'rm-only' })).not.toBeNull();
  });
});
