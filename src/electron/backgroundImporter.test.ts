import { describe, expect, it, vi } from 'vitest';
import { createBackgroundImporter, type ImportWorker } from './backgroundImporter';
import type { SelectedSource } from '../application/ports';

type MessageListener = (message: unknown) => void;
type ErrorListener = (error: Error) => void;
type ExitListener = (code: number) => void;

class FakeWorker implements ImportWorker {
  readonly postMessage = vi.fn();
  private readonly messageListeners: MessageListener[] = [];
  private readonly errorListeners: ErrorListener[] = [];
  private readonly exitListeners: ExitListener[] = [];

  on(event: 'message' | 'error' | 'exit', listener: MessageListener | ErrorListener | ExitListener) {
    if (event === 'message') this.messageListeners.push(listener as MessageListener);
    if (event === 'error') this.errorListeners.push(listener as ErrorListener);
    if (event === 'exit') this.exitListeners.push(listener as ExitListener);
    return this;
  }

  terminate = vi.fn(async () => 0);

  send(message: unknown) {
    this.messageListeners.forEach((listener) => listener(message));
  }
}

describe('background BC3 importer', () => {
  it('keeps the main-process event loop available while a selected catalog is parsed and stored by a worker', async () => {
    const worker = new FakeWorker();
    const importer = createBackgroundImporter({ createWorker: () => worker });
    const selected: SelectedSource = {
      source: 'guadalajara-2016-eu',
      displayName: 'Guadalajara2016_e+u.bc3',
      bytes: new TextEncoder().encode('~V|x|'),
    };
    const progress = vi.fn();

    const result = importer.execute(':memory:', selected, progress);
    let eventLoopTurned = false;
    await new Promise<void>((resolve) => setImmediate(() => { eventLoopTurned = true; resolve(); }));

    expect(eventLoopTurned).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ databasePath: ':memory:', selected });
    expect(progress).not.toHaveBeenCalled();

    worker.send({ type: 'progress', progress: { stage: 'processing-records', completed: 2, total: 4 } });
    worker.send({ type: 'progress', progress: { stage: 'validating-relations' } });
    worker.send({ type: 'progress', progress: { stage: 'storing', completed: 3, total: 6 } });
    expect(progress).toHaveBeenNthCalledWith(1, { stage: 'processing-records', completed: 2, total: 4 });
    expect(progress).toHaveBeenNthCalledWith(2, { stage: 'validating-relations' });
    expect(progress).toHaveBeenNthCalledWith(3, { stage: 'storing', completed: 3, total: 6 });

    worker.send({ type: 'completed', result: { source: 'guadalajara-2016-eu', sourceDisplayName: selected.displayName, importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' } });
    await expect(result).resolves.toMatchObject({ importedPartidas: 1, importedResources: 3 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('does not forward late progress from a settled import to a later import', async () => {
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const importer = createBackgroundImporter({ createWorker: () => workers.shift()! });
    const selected: SelectedSource = {
      source: 'guadalajara-2016-eu',
      displayName: 'Guadalajara2016_e+u.bc3',
      bytes: new TextEncoder().encode('~V|x|'),
    };
    const firstProgress = vi.fn();
    const firstImport = importer.execute(':memory:', selected, firstProgress);

    firstWorker.send({ type: 'completed', result: { source: 'guadalajara-2016-eu', sourceDisplayName: selected.displayName, importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' } });
    await expect(firstImport).resolves.toMatchObject({ importedPartidas: 1, importedResources: 3 });

    const secondProgress = vi.fn();
    const secondImport = importer.execute(':memory:', selected, secondProgress);
    firstWorker.send({ type: 'progress', progress: { stage: 'storing', completed: 3, total: 6 } });
    secondWorker.send({ type: 'progress', progress: { stage: 'processing-records', completed: 2, total: 4 } });

    expect(firstProgress).not.toHaveBeenCalled();
    expect(secondProgress).toHaveBeenCalledOnce();
    expect(secondProgress).toHaveBeenCalledWith({ stage: 'processing-records', completed: 2, total: 4 });

    secondWorker.send({ type: 'completed', result: { source: 'guadalajara-2016-eu', sourceDisplayName: selected.displayName, importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' } });
    await expect(secondImport).resolves.toMatchObject({ importedPartidas: 1, importedResources: 3 });
  });

  it('does not forward late progress after a failed import', async () => {
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const importer = createBackgroundImporter({ createWorker: () => workers.shift()! });
    const selected: SelectedSource = {
      source: 'guadalajara-2016-eu',
      displayName: 'Guadalajara2016_e+u.bc3',
      bytes: new TextEncoder().encode('~V|x|'),
    };
    const firstProgress = vi.fn();
    const firstImport = importer.execute(':memory:', selected, firstProgress);

    firstWorker.send({ type: 'failed', message: 'import failed' });
    await expect(firstImport).rejects.toThrow('import failed');

    const secondImport = importer.execute(':memory:', selected, vi.fn());
    firstWorker.send({ type: 'progress', progress: { stage: 'storing', completed: 3, total: 6 } });

    expect(firstProgress).not.toHaveBeenCalled();

    secondWorker.send({ type: 'completed', result: { source: 'guadalajara-2016-eu', sourceDisplayName: selected.displayName, importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' } });
    await expect(secondImport).resolves.toMatchObject({ importedPartidas: 1, importedResources: 3 });
  });
});
