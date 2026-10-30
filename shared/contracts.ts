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

export interface ImageImportResult {
  canceled: boolean;
  src?: string;
  alt?: string;
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
  bodyHtml: string;
  headings: ExportHeading[];
  options: PdfOptions;
}

export interface PdfExportResult {
  canceled: boolean;
  path?: string;
}

export interface MdWorkApi {
  openDocument(): Promise<DocumentResult>;
  openDroppedDocument(file: File): Promise<DocumentResult>;
  saveDocument(path: string | null, content: string): Promise<SaveResult>;
  importImage(documentPath: string): Promise<ImageImportResult>;
  exportPdf(request: PdfExportRequest): Promise<PdfExportResult>;
  listSystemFonts(): Promise<string[]>;
  openExternal(url: string): Promise<void>;
  openLocalResource(documentPath: string, href: string): Promise<void>;
  setDocumentDirty(dirty: boolean): void;
}
