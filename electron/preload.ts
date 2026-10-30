import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  MdWorkApi,
  PdfExportRequest,
} from '../shared/contracts';

const api: MdWorkApi = {
  openDocument: () => ipcRenderer.invoke('document:open'),
  openDroppedDocument: (file: File) => ipcRenderer.invoke(
    'document:open-dropped', webUtils.getPathForFile(file),
  ),
  saveDocument: (path, content) => ipcRenderer.invoke('document:save', path, content),
  importImage: (documentPath) => ipcRenderer.invoke('document:import-image', documentPath),
  exportPdf: (request: PdfExportRequest) => ipcRenderer.invoke('pdf:export', request),
  listSystemFonts: () => ipcRenderer.invoke('fonts:list'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openLocalResource: (documentPath, href) => ipcRenderer.invoke('shell:open-local', documentPath, href),
  setDocumentDirty: (dirty: boolean) => ipcRenderer.send('document:dirty', dirty),
};

contextBridge.exposeInMainWorld('mdwork', api);
