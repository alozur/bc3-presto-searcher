import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const harness = vi.hoisted(() => {
  const listeners: Array<(message: { databasePath: string; selected: unknown }) => Promise<void> | void> = [];
  const posted: Array<{ type: string; result?: Record<string, unknown>; message?: string }> = [];
  return {
    listeners,
    posted,
    parentPort: {
      on: (_event: string, listener: (message: never) => unknown) => { listeners.push(listener as never); },
      postMessage: (message: never) => { posted.push(message as never); },
    },
  };
});

vi.mock('node:worker_threads', () => ({ parentPort: harness.parentPort }));

type PostedMessage = { type: string; result?: Record<string, unknown>; message?: string };

describe('BC3 import worker unchanged-content skip', () => {
  let databasePath: string;
  let bytes: Uint8Array;

  beforeAll(async () => {
    await import('./importWorker');
  });

  beforeEach(() => {
    harness.posted.length = 0;
    databasePath = join(mkdtempSync(join(tmpdir(), 'bc3-worker-')), 'catalog.sqlite');
    bytes = new TextEncoder().encode('~C|P-WORKER|u|Partida worker|1|x|0|\n~C|R-WORKER|u|Recurso worker|2|x|0|\n~D|P-WORKER|R-WORKER\\1\\1|\n');
  });

  const dispatch = (selected: unknown) => {
    const handler = harness.listeners[harness.listeners.length - 1];
    if (!handler) throw new Error('import worker did not register a message listener');
    return Promise.resolve(handler({ databasePath, selected }));
  };

  const completedMessages = () => harness.posted.filter((message) => message.type === 'completed');
  const storedImportedAt = () => (new Database(databasePath).prepare('SELECT imported_at FROM sources').get() as { imported_at: string }).imported_at;

  it('imports new bytes normally without the unchanged flag', async () => {
    await dispatch({ source: 'guadalajara-2016-eu', displayName: 'tiny.bc3', bytes });

    const failures = harness.posted.filter((message) => message.type === 'failed');
    expect(failures).toEqual([]);
    const completed = completedMessages();
    expect(completed).toHaveLength(1);
    expect(completed[0]!.result).toMatchObject({
      source: 'guadalajara-2016-eu',
      importedPartidas: 1,
      importedResources: 1,
    });
    expect(completed[0]!.result).not.toHaveProperty('unchanged');
  });

  it('skips parsing, deletion, and insertion when the same bytes are imported again', async () => {
    await dispatch({ source: 'guadalajara-2016-eu', displayName: 'tiny.bc3', bytes });
    expect(completedMessages()[0]!.result).not.toHaveProperty('unchanged');
    const importedAtAfterFirstImport = storedImportedAt();
    const postedAfterFirstImport = harness.posted.length;

    await dispatch({ source: 'guadalajara-2016-eu', displayName: 'tiny.bc3', bytes });

    const secondRunMessages = harness.posted.slice(postedAfterFirstImport);
    expect(secondRunMessages.filter((message) => message.type === 'progress')).toEqual([]);
    expect(secondRunMessages).toHaveLength(1);
    expect(secondRunMessages[0]!.type).toBe('completed');
    expect(secondRunMessages[0]!.result).toMatchObject({
      source: 'guadalajara-2016-eu',
      importedPartidas: 1,
      importedResources: 1,
      unchanged: true,
    });
    expect(secondRunMessages[0]!.result!.completedAt).toEqual(importedAtAfterFirstImport);
    expect(storedImportedAt()).toBe(importedAtAfterFirstImport);
  });
});
