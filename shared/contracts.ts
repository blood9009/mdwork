export interface DocumentResult {
  canceled: boolean;
  path?: string;
  content?: string;
  size?: number;
}

export interface SaveResult {
  canceled: boolean;
  path?: string;
}

export interface FolderEntry {
  kind: 'directory' | 'file';
  name: string;
  path: string;
  relativePath: string;
  depth: number;
}

export interface FolderSnapshot {
  canceled: boolean;
  rootPath?: string;
  rootName?: string;
  entries: FolderEntry[];
  truncated: boolean;
}

export interface ImageImportResult {
  canceled: boolean;
  src?: string;
  alt?: string;
}

export type DocumentImportKind = 'word' | 'pdf';
export type PdfImportMode = 'editable' | 'layout' | 'hybrid';

export interface ImportSourceResult {
  canceled: boolean;
  path?: string;
  data?: ArrayBuffer;
  size?: number;
}

export interface ImportedDocumentImage {
  uri: string;
  contentType: string;
  data: ArrayBuffer | Uint8Array;
}

export interface SaveImportedDocumentRequest {
  sourcePath: string;
  markdown: string;
  images: ImportedDocumentImage[];
  warnings: string[];
  openPaths: Array<string | null>;
}

export interface ImportedDocumentResult extends DocumentResult {
  warnings?: string[];
}

export type PdfTheme = 'default' | 'clean' | 'academic' | 'technical';
export type PdfPageSize = 'A4' | 'Letter';
export type PdfOrientation = 'portrait' | 'landscape';

export interface PdfOptions {
  theme: PdfTheme;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  fontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  lineHeight: number;
  margin: number;
  showPageNumbers: boolean;
  showToc: boolean;
  printBackground: boolean;
}

export interface ExportHeading {
  id: string;
  text: string;
  level: number;
}

export interface PdfExportRequest {
  title: string;
  sourcePath: string | null;
  sourceMarkdown: string;
  bodyHtml: string;
  headings: ExportHeading[];
  options: PdfOptions;
}

export interface PdfExportResult {
  canceled: boolean;
  path?: string;
}

export type ExportFormat = 'pdf' | 'docx';

export interface DocxExportRequest {
  title: string;
  sourcePath: string | null;
  data: ArrayBuffer | Uint8Array;
}

export interface ExportImageRequest {
  documentPath: string;
  source: string;
}

export interface ExportImageResult {
  data: ArrayBuffer | Uint8Array;
}

export interface MdWorkApi {
  openDocument(): Promise<DocumentResult>;
  openDroppedDocument(file: File): Promise<DocumentResult>;
  openFolder(): Promise<FolderSnapshot>;
  refreshFolder(): Promise<FolderSnapshot>;
  openFolderDocument(filePath: string): Promise<DocumentResult>;
  saveDocument(path: string | null, content: string, saveAs?: boolean): Promise<SaveResult>;
  importImage(documentPath: string): Promise<ImageImportResult>;
  selectImportSource(kind: DocumentImportKind): Promise<ImportSourceResult>;
  saveImportedDocument(request: SaveImportedDocumentRequest): Promise<ImportedDocumentResult>;
  exportPdf(request: PdfExportRequest): Promise<PdfExportResult>;
  exportDocx(request: DocxExportRequest): Promise<PdfExportResult>;
  readExportImage(request: ExportImageRequest): Promise<ExportImageResult>;
  listSystemFonts(): Promise<string[]>;
  openExternal(url: string): Promise<void>;
  openLocalResource(documentPath: string, href: string): Promise<void>;
  setDocumentDirty(dirty: boolean): void;
}
