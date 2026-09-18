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

    worker.send({ type: 'progress', phase: 'parsing' });
    expect(progress).toHaveBeenCalledWith({ phase: 'parsing' });

    worker.send({ type: 'completed', result: { source: 'guadalajara-2016-eu', sourceDisplayName: selected.displayName, importedPartidas: 1, importedResources: 3, skippedRecords: 0, diagnostics: [], completedAt: '2025-01-01T00:00:00.000Z' } });
    await expect(result).resolves.toMatchObject({ importedPartidas: 1, importedResources: 3 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
