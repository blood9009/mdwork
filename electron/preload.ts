import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  DocxExportRequest,
  ExportImageRequest,
  MdWorkApi,
  PdfExportRequest,
  SaveImportedDocumentRequest,
} from '../shared/contracts';

const api: MdWorkApi = {
  openDocument: () => ipcRenderer.invoke('document:open'),
  openDroppedDocument: (file: File) => ipcRenderer.invoke(
    'document:open-dropped', webUtils.getPathForFile(file),
  ),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  refreshFolder: () => ipcRenderer.invoke('folder:refresh'),
  openFolderDocument: (filePath) => ipcRenderer.invoke('folder:open-document', filePath),
  saveDocument: (path, content, saveAs) => ipcRenderer.invoke('document:save', path, content, saveAs),
  importImage: (documentPath) => ipcRenderer.invoke('document:import-image', documentPath),
  selectImportSource: (kind) => ipcRenderer.invoke('document:select-import-source', kind),
  saveImportedDocument: (request: SaveImportedDocumentRequest) => ipcRenderer.invoke('document:save-imported', request),
  exportPdf: (request: PdfExportRequest) => ipcRenderer.invoke('pdf:export', request),
  exportDocx: (request: DocxExportRequest) => ipcRenderer.invoke('docx:export', request),
  readExportImage: (request: ExportImageRequest) => ipcRenderer.invoke('docx:read-image', request),
  listSystemFonts: () => ipcRenderer.invoke('fonts:list'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openLocalResource: (documentPath, href) => ipcRenderer.invoke('shell:open-local', documentPath, href),
  setDocumentDirty: (dirty: boolean) => ipcRenderer.send('document:dirty', dirty),
};

contextBridge.exposeInMainWorld('mdwork', api);
