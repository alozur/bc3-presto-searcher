import type { SelectedSource } from '../application/ports';
import type { ImportResponse } from '../shared/ipc';

export type ImportProgress = { phase: 'parsing' | 'storing' };
type WorkerMessage =
  | { type: 'progress'; phase: ImportProgress['phase'] }
  | { type: 'completed'; result: Exclude<ImportResponse, { status: 'cancelled' }> }
  | { type: 'failed'; message: string };

export interface ImportWorker {
  on(event: 'message', listener: (message: unknown) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  postMessage(message: { databasePath: string; selected: SelectedSource }): void;
  terminate(): Promise<number>;
}

export function createBackgroundImporter({ createWorker }: { createWorker: () => ImportWorker }) {
  return {
    execute(databasePath: string, selected: SelectedSource, reportProgress: (progress: ImportProgress) => void): Promise<Exclude<ImportResponse, { status: 'cancelled' }>> {
      const worker = createWorker();
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (action: () => void) => {
          if (settled) return;
          settled = true;
          void worker.terminate();
          action();
        };

        worker.on('message', (message: unknown) => {
          const event = message as WorkerMessage;
          if (event.type === 'progress') reportProgress({ phase: event.phase });
          if (event.type === 'completed') finish(() => resolve(event.result));
          if (event.type === 'failed') finish(() => reject(new Error(event.message)));
        });
        worker.on('error', (error) => finish(() => reject(error)));
        worker.on('exit', (code) => {
          if (code !== 0) finish(() => reject(new Error(`BC3 import worker stopped with code ${code}`)));
        });
        worker.postMessage({ databasePath, selected });
      });
    },
  };
}
