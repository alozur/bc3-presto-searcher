import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { createApprovedSourceFilePort } from './approvedFilePort';
import { createBackgroundImporter } from './backgroundImporter';
import { createCatalogServices } from './catalogServices';
import { IPC_CHANNELS } from '../shared/ipc';

let window: BrowserWindow | undefined;

function createWindow() {
  window = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadFile(path.join(__dirname, '../../dist/index.html'));
}

app.whenReady().then(() => {
  const files = createApprovedSourceFilePort(async () => {
    const selection = await dialog.showOpenDialog({
      title: 'Seleccionar catálogo BC3 aprobado',
      properties: ['openFile'],
      filters: [{ name: 'Catálogos BC3', extensions: ['bc3'] }],
    });
    return selection.canceled ? undefined : selection.filePaths[0];
  });
  const databasePath = path.join(app.getPath('userData'), 'presto-catalog.sqlite');
  const { handlers } = createCatalogServices({ databasePath, files });
  const importer = createBackgroundImporter({
    createWorker: () => new Worker(path.join(__dirname, 'importWorker.js')),
  });

  ipcMain.handle(IPC_CHANNELS.import, async () => {
    const selected = await files.chooseAndReadApprovedSource();
    if (selected === 'cancelled') return { status: 'cancelled' as const };
    return importer.execute(databasePath, selected, (progress) => {
      window?.webContents.send(IPC_CHANNELS.importProgress, progress);
    });
  });
  ipcMain.handle(IPC_CHANNELS.search, (_event, request: unknown) => handlers.search(request));
  ipcMain.handle(IPC_CHANNELS.detail, (_event, request: unknown) => handlers.detail(request));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
