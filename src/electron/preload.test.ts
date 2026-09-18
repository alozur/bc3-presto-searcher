import path from 'node:path';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';

describe('sandboxed Electron preload bundle', () => {
  it('exposes the typed API when sandboxed preload code can require only Electron', async () => {
    const result = await build({
      configFile: path.join(process.cwd(), 'vite.config.ts'),
      mode: 'preload',
      build: { write: false },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((buildResult) => {
      if (!('output' in buildResult)) throw new Error('Preload build did not complete');
      return buildResult.output;
    });
    const preload = outputs.find((output) => output.type === 'chunk' && output.fileName === 'preload.js');

    expect(preload).toBeDefined();
    if (!preload || preload.type !== 'chunk') throw new Error('Missing preload bundle');

    const exposeInMainWorld = vi.fn();
    const invoke = vi.fn();
    const module = { exports: {} };
    new Function('require', 'module', 'exports', preload?.code)(
      (moduleName: string) => {
        if (moduleName === 'electron') return { contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke } };
        throw new Error(`Sandboxed preload cannot require ${moduleName}`);
      },
      module,
      module.exports,
    );

    expect(exposeInMainWorld).toHaveBeenCalledWith('presto', expect.objectContaining({
      importApprovedSource: expect.any(Function),
      search: expect.any(Function),
      getDetail: expect.any(Function),
    }));
  });
});
