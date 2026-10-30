import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { registerAssetProtocol, registerAssetScheme } from './asset-protocol';
import { importImage, openDocument, openDroppedDocument, openLocalResource, saveDocument } from './file-service';
import { listSystemFonts } from './font-service';
import { exportPdf } from './pdf-service';
import type { PdfExportRequest } from '../shared/contracts';

registerAssetScheme();
let mainWindow: BrowserWindow | null = null;
let documentDirty = false;
let allowClose = false;
let closePromptOpen = false;

function createWindow(): void {
  documentDirty = false;
  allowClose = false;
  closePromptOpen = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'MDWork',
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const window = mainWindow;
  window.on('close', (event) => {
    if (!documentDirty || allowClose) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    void dialog.showMessageBox(window, {
      type: 'warning',
      title: '未保存的修改',
      message: '有文档包含未保存的修改。',
      detail: '关闭窗口将丢失所有未保存标签中的修改，也可以取消后返回逐个保存。',
      buttons: ['取消', '不保存并关闭'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then(({ response }) => {
      if (response === 1) {
        allowClose = true;
        window.close();
      }
    }).finally(() => { closePromptOpen = false; });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerAssetProtocol();

  ipcMain.on('document:dirty', (event, dirty: boolean) => {
    if (event.sender === mainWindow?.webContents) documentDirty = Boolean(dirty);
  });
  ipcMain.handle('document:open', () => {
    if (!mainWindow) throw new Error('主窗口不可用');
    return openDocument(mainWindow);
  });
  ipcMain.handle('document:open-dropped', (event, filePath: string) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('主窗口不可用');
    if (typeof filePath !== 'string' || !filePath) throw new Error('未识别到拖入的文件');
    return openDroppedDocument(filePath);
  });
  ipcMain.handle('document:save', (_event, filePath: string | null, content: string) => {
    if (!mainWindow) throw new Error('主窗口不可用');
    if (typeof content !== 'string' || (filePath !== null && typeof filePath !== 'string')) {
      throw new Error('无效的文档保存参数');
    }
    return saveDocument(mainWindow, filePath, content);
  });
  ipcMain.handle('document:import-image', (event, documentPath: string) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('主窗口不可用');
    if (typeof documentPath !== 'string' || !documentPath) throw new Error('无效的文档路径');
    return importImage(mainWindow, documentPath);
  });
  ipcMain.handle('pdf:export', (_event, request: PdfExportRequest) => {
    if (!mainWindow) throw new Error('主窗口不可用');
    if (!request || typeof request.bodyHtml !== 'string' || !request.options) {
      throw new Error('无效的 PDF 导出参数');
    }
    return exportPdf(mainWindow, request);
  });
  ipcMain.handle('fonts:list', () => listSystemFonts());
  ipcMain.handle('shell:open-local', (event, documentPath: string, href: string) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('主窗口不可用');
    if (typeof documentPath !== 'string' || typeof href !== 'string') throw new Error('无效的本地链接');
    return openLocalResource(documentPath, href);
  });
  ipcMain.handle('shell:open-external', (event, value: string) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('主窗口不可用');
    const url = new URL(value);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      throw new Error('不允许打开此类型的链接');
    }
    return shell.openExternal(url.toString());
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
