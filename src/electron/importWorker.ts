import { parentPort } from 'node:worker_threads';
import type { SelectedSource } from '../application/ports';
import { parseBc3 } from '../domain/bc3/parser';
import { SqliteCatalogRepository } from '../infrastructure/sqlite/repository';

const port = parentPort;
if (!port) throw new Error('BC3 import worker requires a parent port');

type ImportRequest = { databasePath: string; selected: SelectedSource };

port.on('message', async ({ databasePath, selected }: ImportRequest) => {
  try {
    port.postMessage({ type: 'progress', phase: 'parsing' });
    const snapshot = parseBc3(selected.bytes, selected.source, selected.displayName);

    port.postMessage({ type: 'progress', phase: 'storing' });
    const repository = SqliteCatalogRepository.open(databasePath);
    await repository.replaceSource(snapshot);

    port.postMessage({
      type: 'completed',
      result: {
        source: snapshot.source,
        sourceDisplayName: snapshot.sourceDisplayName,
        importedPartidas: snapshot.items.filter((item) => item.kind === 'partida').length,
        importedResources: snapshot.items.filter((item) => item.kind === 'resource').length,
        skippedRecords: snapshot.diagnostics.length,
        diagnostics: snapshot.diagnostics,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    port.postMessage({ type: 'failed', message: error instanceof Error ? error.message : 'BC3 import failed' });
  }
});
