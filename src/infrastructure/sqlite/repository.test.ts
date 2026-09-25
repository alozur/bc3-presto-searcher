import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
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
        { completed: 0, total: 9 }, { completed: 1, total: 9 }, { completed: 2, total: 9 },
        { completed: 3, total: 9 }, { completed: 4, total: 9 }, { completed: 5, total: 9 },
        { completed: 6, total: 9 }, { completed: 7, total: 9 }, { completed: 8, total: 9 },
        { completed: 9, total: 9 },
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
      entities: [],
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

  it('persists and replaces source entity rows without deleting another source\'s entities', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bc3-repository-')), 'catalog.sqlite');
    const repo = SqliteCatalogRepository.open(path);
    const withEntities = (source: SourceKey): ImportSnapshot => parseBc3(
      new TextEncoder().encode('~C|E-1|u|Recurso|1|x|0|\n~E|PROV-A|Proveedor A|CIF-A|\n~E|PROV-B|Proveedor B|CIF-B|\n'),
      source,
      `${source}.bc3`,
    );
    const db = new Database(path);
    const rows = () => db.prepare('SELECT source_key, line, code, name, fields_json FROM source_entities ORDER BY source_key, line').all() as Array<{ source_key: string; line: number; code: string; name: string; fields_json: string }>;

    void repo.replaceSource(withEntities('guadalajara-2016-eu'));
    void repo.replaceSource(withEntities('guadalajara-2016-rm'));
    expect(rows()).toEqual([
      { source_key: 'guadalajara-2016-eu', line: 2, code: 'PROV-A', name: 'Proveedor A', fields_json: JSON.stringify(['PROV-A', 'Proveedor A', 'CIF-A', '']) },
      { source_key: 'guadalajara-2016-eu', line: 3, code: 'PROV-B', name: 'Proveedor B', fields_json: JSON.stringify(['PROV-B', 'Proveedor B', 'CIF-B', '']) },
      { source_key: 'guadalajara-2016-rm', line: 2, code: 'PROV-A', name: 'Proveedor A', fields_json: JSON.stringify(['PROV-A', 'Proveedor A', 'CIF-A', '']) },
      { source_key: 'guadalajara-2016-rm', line: 3, code: 'PROV-B', name: 'Proveedor B', fields_json: JSON.stringify(['PROV-B', 'Proveedor B', 'CIF-B', '']) },
    ]);

    void repo.replaceSource(parseBc3(
      new TextEncoder().encode('~C|E-1|u|Recurso|1|x|0|\n~E|PROV-C|Proveedor C|\n'),
      'guadalajara-2016-eu',
      'eu.bc3',
    ));
    const after = rows();
    expect(after.filter((row) => row.source_key === 'guadalajara-2016-eu').map((row) => row.code)).toEqual(['PROV-C']);
    expect(after.filter((row) => row.source_key === 'guadalajara-2016-rm').map((row) => row.code)).toEqual(['PROV-A', 'PROV-B']);
  });

  const sourceColumns = (path: string) => new Database(path).prepare('PRAGMA table_info(sources)').all() as { name: string }[];

  it('adds the content_hash column to a fresh database', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bc3-repository-')), 'catalog.sqlite');
    SqliteCatalogRepository.open(path);
    expect(sourceColumns(path).map((column) => column.name)).toContain('content_hash');
  });

  it('migrates a pre-content_hash database and keeps the migration idempotent on reopen', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bc3-repository-')), 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec('CREATE TABLE sources(source_key TEXT PRIMARY KEY,display_name TEXT NOT NULL,imported_at TEXT NOT NULL,item_count INTEGER NOT NULL)');
    legacy.prepare('INSERT INTO sources VALUES(?,?,?,?)').run('guadalajara-2016-eu', 'legacy.bc3', '2024-01-01T00:00:00.000Z', 7);
    legacy.close();

    const repo = SqliteCatalogRepository.open(path);
    expect(sourceColumns(path).map((column) => column.name)).toContain('content_hash');
    const row = new Database(path).prepare('SELECT source_key,display_name,imported_at,item_count FROM sources').get() as Record<string, unknown>;
    expect(row).toEqual({ source_key: 'guadalajara-2016-eu', display_name: 'legacy.bc3', imported_at: '2024-01-01T00:00:00.000Z', item_count: 7 });

    const reopened = SqliteCatalogRepository.open(path);
    expect(sourceColumns(path).filter((column) => column.name === 'content_hash')).toHaveLength(1);
    expect(reopened.findUnchangedImport('guadalajara-2016-eu', 'any-hash')).toBeNull();
  });

  it('finds unchanged imports by content hash and rejects other hashes, sources, or missing hashes', async () => {
    const repo = SqliteCatalogRepository.open(':memory:');
    const hashed: ImportSnapshot = { ...singleResource('guadalajara-2016-eu', 'E-HASHED'), contentHash: 'hash-1' };
    await repo.replaceSource(hashed);

    expect(repo.findUnchangedImport('guadalajara-2016-eu', 'hash-1')).toEqual({
      sourceDisplayName: 'E-HASHED.bc3',
      importedPartidas: 0,
      importedResources: 1,
      completedAt: expect.any(String),
    });
    expect(repo.findUnchangedImport('guadalajara-2016-eu', 'hash-2')).toBeNull();
    expect(repo.findUnchangedImport('guadalajara-2016-rm', 'hash-1')).toBeNull();

    await repo.replaceSource(singleResource('guadalajara-2016-rm', 'E-PLAIN'));
    expect(repo.findUnchangedImport('guadalajara-2016-rm', 'hash-1')).toBeNull();
  });

  it('stores and matches a sha-256 content hash through a full import cycle', async () => {
    const repo = SqliteCatalogRepository.open(':memory:');
    const bytes = new TextEncoder().encode('~C|E-CYCLE|u|Cycle|1|x|0|\n');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    await repo.replaceSource({ ...singleResource('guadalajara-2016-eu', 'E-CYCLE'), contentHash });
    expect(repo.findUnchangedImport('guadalajara-2016-eu', contentHash)).not.toBeNull();
  });
});
