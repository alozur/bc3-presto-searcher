import { parentPort } from 'node:worker_threads';
import type { SelectedSource } from '../application/ports';
import { parseBc3 } from '../domain/bc3/parser';
import { SqliteCatalogRepository } from '../infrastructure/sqlite/repository';
import { countSkippedRecords } from '../domain/importDiagnostics';

const port = parentPort;
if (!port) throw new Error('BC3 import worker requires a parent port');

type ImportRequest = { databasePath: string; selected: SelectedSource };

port.on('message', async ({ databasePath, selected }: ImportRequest) => {
  try {
    const snapshot = parseBc3(selected.bytes, selected.source, selected.displayName, (progress) => {
      port.postMessage({ type: 'progress', progress });
    });

    const repository = SqliteCatalogRepository.open(databasePath);
    await repository.replaceSource(snapshot, (progress) => {
      port.postMessage({ type: 'progress', progress: { stage: 'storing', ...progress } });
    });

    port.postMessage({
      type: 'completed',
      result: {
        source: snapshot.source,
        sourceDisplayName: snapshot.sourceDisplayName,
        importedPartidas: snapshot.items.filter((item) => item.kind === 'partida').length,
        importedResources: snapshot.items.filter((item) => item.kind === 'resource').length,
        skippedRecords: countSkippedRecords(snapshot.diagnostics),
        diagnostics: snapshot.diagnostics,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    port.postMessage({ type: 'failed', message: error instanceof Error ? error.message : 'BC3 import failed' });
  }
});
