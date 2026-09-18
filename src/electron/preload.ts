import { contextBridge, ipcRenderer } from 'electron';
import { createPreloadApi } from './preloadApi';

contextBridge.exposeInMainWorld(
  'presto',
  createPreloadApi(
    (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    (channel, listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => listener(progress);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  ),
);
