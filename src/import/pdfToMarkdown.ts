import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ImportedDocumentImage, PdfImportMode } from '../../shared/contracts';

interface TextPart {
  text: string;
  x: number;
  width: number;
}

export interface PdfLine {
  parts: TextPart[];
  x: number;
  y: number;
  height: number;
  tableCells?: string[];
  breakBefore?: boolean;
}

export interface PdfPageLines {
  lines: PdfLine[];
  width?: number;
  height?: number;
  hasImages?: boolean;
  hasVectorGraphics?: boolean;
  imageObjectIds?: string[];
}

export interface PdfConversionOptions {
  mode?: PdfImportMode;
  removeHeaders?: boolean;
  includePreview?: boolean;
}

export interface PdfConversionStats {
  columnPages: number;
  removedHeaders: number;
  tables: number;
  extractedImages: number;
  pageSnapshots: number;
  scannedPages: number;
}

export interface PdfConversionResult {
  markdown: string;
  images: ImportedDocumentImage[];
  warnings: string[];
  preview?: ImportedDocumentImage;
  pageCount: number;
  recoveredSource: boolean;
  stats: PdfConversionStats;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PageFeatures {
  hasImages: boolean;
  hasVectorGraphics: boolean;
  imageObjectIds: string[];
}

interface TextAnalysis {
  pages: string[];
  stats: PdfConversionStats;
}

const emptyStats = (): PdfConversionStats => ({
  columnPages: 0,
  removedHeaders: 0,
  tables: 0,
  extractedImages: 0,
  pageSnapshots: 0,
  scannedPages: 0,
});

function sortedParts(line: PdfLine): TextPart[] {
  return [...line.parts].sort((left, right) => left.x - right.x);
}

function lineEnd(line: PdfLine): number {
  return Math.max(...line.parts.map((part) => part.x + part.width));
}

function lineText(line: PdfLine): string {
  let text = '';
  let endX = 0;
  for (const part of sortedParts(line)) {
    const gap = part.x - endX;
    if (text && gap > Math.max(0.8, line.height * 0.08) && !/\s$/.test(text) && !/^\s/.test(part.text)) {
      text += ' ';
    }
    text += part.text;
    endX = Math.max(endX, part.x + part.width);
  }
  return text.replace(/[\t ]+/g, ' ').trim();
}

function extractLines(items: Array<PdfTextItem | { type: string }>): PdfLine[] {
  const lines: PdfLine[] = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const x = Number(item.transform[4]);
    const y = Number(item.transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const height = Math.abs(item.height) || Math.hypot(Number(item.transform[2]), Number(item.transform[3])) || 12;
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= Math.max(1.5, height * 0.25));
    if (!line) {
      line = { parts: [], x, y, height };
      lines.push(line);
    }
    line.parts.push({ text: item.str, x, width: Math.max(0, item.width) });
    line.x = Math.min(line.x, x);
    line.height = Math.max(line.height, height);
  }
  return lines.sort((left, right) => right.y - left.y || left.x - right.x);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
}

function headingLevel(text: string, height: number, bodyHeight: number): number {
  if (text.length > 160) return 0;
  if (height >= bodyHeight * 1.8) return 1;
  if (height >= bodyHeight * 1.4) return 2;
  if (height >= bodyHeight * 1.18) return 3;
  return 0;
}

function listItem(text: string): string | null {
  const bullet = text.match(/^(?:[•▪◦∙·]|[-–—])\s+(.+)$/);
  if (bullet) return `- ${bullet[1]}`;
  const numbered = text.match(/^(\d{1,3}[.)])\s+(.+)$/);
  return numbered ? `${numbered[1]} ${numbered[2]}` : null;
}

function joinWrappedText(previous: string, next: string): string {
  if (/[A-Za-z]-$/.test(previous) && /^[a-z]/.test(next)) return `${previous.slice(0, -1)}${next}`;
  if (/[㐀-鿿]$/.test(previous) && /^[㐀-鿿]/.test(next)) return `${previous}${next}`;
  return `${previous} ${next}`;
}

function normalizedRepeatedLine(line: PdfLine): string {
  return lineText(line).toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

function withoutRepeatedHeaders(pages: PdfPageLines[]): { pages: PdfPageLines[]; removed: number } {
  const candidates = new Map<string, { pages: Set<number>; lines: Set<string> }>();
  pages.forEach((page, pageIndex) => {
    const height = page.height ?? 792;
    page.lines.forEach((line, lineIndex) => {
      if (line.y < height * 0.08 || line.y > height * 0.92) {
        const key = normalizedRepeatedLine(line);
        if (!key || key.length > 160) return;
        const candidate = candidates.get(key) ?? { pages: new Set<number>(), lines: new Set<string>() };
        candidate.pages.add(pageIndex);
        candidate.lines.add(`${pageIndex}:${lineIndex}`);
        candidates.set(key, candidate);
      }
    });
  });
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  const removedLines = new Set<string>();
  for (const candidate of candidates.values()) {
    if (candidate.pages.size >= threshold) {
      candidate.lines.forEach((line) => removedLines.add(line));
    }
  }
  return {
    pages: pages.map((page, pageIndex) => ({
      ...page,
      lines: page.lines.filter((_, lineIndex) => !removedLines.has(`${pageIndex}:${lineIndex}`)),
    })),
    removed: removedLines.size,
  };
}

function tableCells(line: PdfLine): string[] {
  return sortedParts(line).map((part) => part.text.replace(/\s+/g, ' ').trim());
}

function markSimpleTables(page: PdfPageLines): number {
  if (!page.hasVectorGraphics) return 0;
  const lines = [...page.lines].sort((left, right) => right.y - left.y || left.x - right.x);
  let run: PdfLine[] = [];
  let tables = 0;
  const flush = () => {
    if (run.length >= 2) {
      run.forEach((line) => { line.tableCells = tableCells(line); });
      tables += 1;
    }
    run = [];
  };
  for (const line of lines) {
    const cells = tableCells(line);
    const previous = run.at(-1);
    if (cells.length < 2 || cells.length > 12 || cells.some((cell) => !cell || cell.length > 80)) {
      flush();
      continue;
    }
    if (previous) {
      const previousParts = sortedParts(previous);
      const parts = sortedParts(line);
      const aligned = previousParts.length === parts.length && parts.every((part, index) =>
        Math.abs(part.x - previousParts[index].x) <= Math.max(6, line.height * 0.75));
      const gap = previous.y - line.y;
      if (!aligned || gap <= 0 || gap > Math.max(previous.height, line.height) * 2.6) flush();
    }
    run.push(line);
  }
  flush();
  return tables;
}

function withParts(line: PdfLine, parts: TextPart[]): PdfLine {
  return { ...line, parts, x: Math.min(...parts.map((part) => part.x)) };
}

interface ColumnSplit {
  left: PdfLine[];
  right: PdfLine[];
  spanning: PdfLine[];
  splitRows: number;
  score: number;
}

function findColumnSplit(lines: PdfLine[]): ColumnSplit | null {
  if (lines.length < 2) return null;
  const minX = Math.min(...lines.map((line) => line.x));
  const maxX = Math.max(...lines.map(lineEnd));
  const contentWidth = maxX - minX;
  if (contentWidth < 100) return null;
  let best: ColumnSplit | null = null;

  for (let ratio = 0.25; ratio <= 0.7501; ratio += 0.025) {
    const splitX = minX + contentWidth * ratio;
    const split: ColumnSplit = { left: [], right: [], spanning: [], splitRows: 0, score: 0 };
    for (const line of lines) {
      if (line.tableCells) {
        split.spanning.push(line);
        continue;
      }
      const parts = sortedParts(line);
      const crosses = parts.some((part) => part.x < splitX - 1 && part.x + part.width > splitX + 1);
      if (crosses) {
        split.spanning.push(line);
        continue;
      }
      const left = parts.filter((part) => part.x + part.width <= splitX + 1);
      const right = parts.filter((part) => part.x >= splitX - 1);
      if (left.length) split.left.push(withParts(line, left));
      if (right.length) split.right.push(withParts(line, right));
      if (left.length && right.length) split.splitRows += 1;
      if (!left.length && !right.length) split.spanning.push(line);
    }
    if (split.splitRows < 2 || split.left.length < 2 || split.right.length < 2) continue;
    const top = Math.min(
      Math.max(...split.left.map((line) => line.y)),
      Math.max(...split.right.map((line) => line.y)),
    );
    const bottom = Math.max(
      Math.min(...split.left.map((line) => line.y)),
      Math.min(...split.right.map((line) => line.y)),
    );
    if (top <= bottom) continue;
    const gutter = Math.min(...split.right.map((line) => line.x)) - Math.max(...split.left.map(lineEnd));
    if (gutter < Math.max(8, contentWidth * 0.012)) continue;
    split.score = split.splitRows * 4 + Math.min(split.left.length, split.right.length) * 0.2
      + gutter / contentWidth - split.spanning.length * 0.25;
    if (!best || split.score > best.score) best = split;
  }
  return best;
}

interface OrderedLines {
  lines: PdfLine[];
  multiColumn: boolean;
}

function orderLines(lines: PdfLine[], depth = 0): OrderedLines {
  const sorted = [...lines].sort((left, right) => right.y - left.y || left.x - right.x);
  const split = depth < 2 ? findColumnSplit(sorted) : null;
  if (!split) return { lines: sorted, multiColumn: false };

  const output: PdfLine[] = [];
  const append = (group: PdfLine[]) => {
    if (!group.length) return;
    const ordered = orderLines(group, depth + 1).lines;
    if (output.length && ordered.length) ordered[0] = { ...ordered[0], breakBefore: true };
    output.push(...ordered);
  };
  const separators = [...split.spanning].sort((left, right) => right.y - left.y || left.x - right.x);
  let left = split.left;
  let right = split.right;
  for (const separator of separators) {
    const leftAbove = left.filter((line) => line.y > separator.y);
    const rightAbove = right.filter((line) => line.y > separator.y);
    left = left.filter((line) => line.y <= separator.y);
    right = right.filter((line) => line.y <= separator.y);
    append(leftAbove);
    append(rightAbove);
    output.push(output.length ? { ...separator, breakBefore: true } : separator);
  }
  append(left);
  append(right);
  return { lines: output, multiColumn: true };
}

function markdownTable(rows: string[][]): string {
  const escapeCell = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return rows.map((row, index) => {
    const values = `| ${row.map(escapeCell).join(' | ')} |`;
    return index === 0 ? `${values}\n| ${row.map(() => '---').join(' | ')} |` : values;
  }).join('\n');
}

function linesToMarkdown(lines: PdfLine[], bodyHeight: number): string {
  const blocks: string[] = [];
  const blockTypes: Array<'heading' | 'list' | 'paragraph' | 'table'> = [];
  let paragraph = '';
  let previous: { y: number; height: number; type: 'heading' | 'list' | 'paragraph' | 'table' } | null = null;
  const flushParagraph = () => {
    if (!paragraph) return;
    blocks.push(paragraph);
    blockTypes.push('paragraph');
    paragraph = '';
  };
  const appendBlock = (text: string, type: 'heading' | 'list') => {
    flushParagraph();
    if (type === 'list' && blockTypes.at(-1) === 'list') {
      blocks[blocks.length - 1] += `\n${text}`;
      return;
    }
    blocks.push(text);
    blockTypes.push(type);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.tableCells) {
      flushParagraph();
      const rows: string[][] = [];
      while (index < lines.length && lines[index].tableCells) {
        rows.push(lines[index].tableCells!);
        index += 1;
      }
      index -= 1;
      blocks.push(markdownTable(rows));
      blockTypes.push('table');
      previous = null;
      continue;
    }
    const text = lineText(line);
    if (!text) continue;
    const level = headingLevel(text, line.height, bodyHeight);
    const item = level === 0 ? listItem(text) : null;
    if (level > 0) {
      appendBlock(`${'#'.repeat(level)} ${text}`, 'heading');
      previous = { y: line.y, height: line.height, type: 'heading' };
      continue;
    }
    if (item) {
      appendBlock(item, 'list');
      previous = { y: line.y, height: line.height, type: 'list' };
      continue;
    }
    const gap = previous ? previous.y - line.y : 0;
    const startsParagraph = line.breakBefore || !paragraph || !previous || previous.type !== 'paragraph'
      || gap > Math.max(bodyHeight * 1.8, previous.height * 1.8);
    if (startsParagraph) {
      flushParagraph();
      paragraph = text;
    } else {
      paragraph = joinWrappedText(paragraph, text);
    }
    previous = { y: line.y, height: line.height, type: 'paragraph' };
  }
  flushParagraph();
  return blocks.join('\n\n').trim();
}

function analyzePages(input: PdfPageLines[], removeHeaders: boolean): TextAnalysis {
  const headerResult = removeHeaders
    ? withoutRepeatedHeaders(input)
    : { pages: input, removed: 0 };
  const pages = headerResult.pages.map((page) => ({
    ...page,
    lines: page.lines.map((line) => ({ ...line })),
  }));
  const allLines = pages.flatMap((page) => page.lines);
  const bodyHeight = median(allLines.map((line) => line.height));
  const stats = emptyStats();
  stats.removedHeaders = headerResult.removed;
  stats.scannedPages = pages.filter((page) => !page.lines.length).length;
  const markdownPages = pages.map((page) => {
    stats.tables += markSimpleTables(page);
    const ordered = orderLines(page.lines);
    if (ordered.multiColumn) stats.columnPages += 1;
    return linesToMarkdown(ordered.lines, bodyHeight);
  });
  return { pages: markdownPages, stats };
}

export function pdfLinesToMarkdown(pages: PdfPageLines[]): string {
  if (!pages.some((page) => page.lines.length)) {
    throw new Error('PDF 没有可提取的文字层，可能是扫描件。请先进行 OCR，再导入生成的 PDF。');
  }
  const result = analyzePages(pages, true).pages.filter(Boolean).join('\n\n').trim();
  if (!result) throw new Error('PDF 没有可提取的文字内容。');
  return `${result}\n`;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PDF 页面图片编码失败。'));
        return;
      }
      void blob.arrayBuffer().then(resolve, reject);
    }, 'image/png');
  });
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

async function renderPageCanvas(page: PDFPageProxy, requestedScale: number): Promise<HTMLCanvasElement> {
  if (typeof window === 'undefined') throw new Error('PDF 页面渲染需要在 MDWork 桌面窗口中执行。');
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(requestedScale, Math.sqrt(12_000_000 / Math.max(1, base.width * base.height)));
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  try {
    await page.render({ canvas, viewport, intent: 'print', background: '#ffffff' }).promise;
    return canvas;
  } catch (error) {
    releaseCanvas(canvas);
    throw error;
  }
}

async function renderPageImage(page: PDFPageProxy, requestedScale: number): Promise<ArrayBuffer> {
  const canvas = await renderPageCanvas(page, requestedScale);
  try {
    return await canvasToPng(canvas);
  } finally {
    releaseCanvas(canvas);
  }
}

async function resolvePageImages(page: PDFPageProxy): Promise<void> {
  // getOperatorList() identifies images but does not decode their data. A
  // small offscreen render resolves page.objs without retaining a page image.
  const canvas = await renderPageCanvas(page, 0.25);
  releaseCanvas(canvas);
}

function pageObject(page: PDFPageProxy, objectId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const objects = objectId.startsWith('g_') ? page.commonObjs : page.objs;
      const value = objects.get(objectId, resolve);
      if (value) resolve(value);
    } catch (error) {
      reject(error);
    }
  });
}

async function imageToPng(image: any): Promise<ArrayBuffer> {
  if (typeof window === 'undefined') throw new Error('PDF 图片提取需要在桌面窗口中执行。');
  const source = image?.bitmap ?? image;
  const width = Number(source?.width);
  const height = Number(source?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 12_000_000) {
    throw new Error('不支持的 PDF 图片尺寸。');
  }
  const canvas = window.document.createElement('canvas');
  const scale = Math.min(1, 2400 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片处理画布。');
    if (source?.data && !source?.bitmap) {
      if (width * height > 12_000_000) throw new Error('PDF 图片过大。');
      const data = source.data as ArrayLike<number>;
      const pixels = width * height;
      const rgba = new Uint8ClampedArray(pixels * 4);
      if (data.length === pixels * 4) {
        rgba.set(data);
      } else if (data.length === pixels * 3 || data.length === pixels) {
        const channels = data.length === pixels ? 1 : 3;
        for (let index = 0; index < pixels; index += 1) {
          rgba[index * 4] = data[index * channels];
          rgba[index * 4 + 1] = data[index * channels + (channels === 1 ? 0 : 1)];
          rgba[index * 4 + 2] = data[index * channels + (channels === 1 ? 0 : 2)];
          rgba[index * 4 + 3] = 255;
        }
      } else {
        throw new Error('暂不支持该 PDF 图片编码。');
      }
      const rawCanvas = window.document.createElement('canvas');
      rawCanvas.width = width;
      rawCanvas.height = height;
      rawCanvas.getContext('2d')?.putImageData(new ImageData(rgba, width, height), 0, 0);
      context.drawImage(rawCanvas, 0, 0, canvas.width, canvas.height);
      rawCanvas.width = 1;
      rawCanvas.height = 1;
    } else {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    return await canvasToPng(canvas);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

async function extractPageImages(page: PDFPageProxy, objectIds: string[]): Promise<{ images: ArrayBuffer[]; failures: number }> {
  const images: ArrayBuffer[] = [];
  let failures = 0;
  for (const objectId of new Set(objectIds)) {
    try {
      const object = await pageObject(page, objectId);
      images.push(await imageToPng(object));
    } catch {
      failures += 1;
    }
  }
  return { images, failures };
}

function analyzeOperators(pdfjs: any, operatorList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<any[]> }): PageFeatures {
  const features: PageFeatures = { hasImages: false, hasVectorGraphics: false, imageObjectIds: [] };
  const imageOperators = new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintImageXObjectRepeat,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintImageMaskXObject,
  ]);
  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operation = operatorList.fnArray[index];
    if (operation === pdfjs.OPS.constructPath) features.hasVectorGraphics = true;
    if (!imageOperators.has(operation)) continue;
    features.hasImages = true;
    const objectId = operatorList.argsArray[index]?.[0];
    if (typeof objectId === 'string' && operation !== pdfjs.OPS.paintInlineImageXObject) {
      features.imageObjectIds.push(objectId);
    }
  }
  return features;
}

async function embeddedMarkdown(pdf: PDFDocumentProxy): Promise<string | null> {
  const attachments = await pdf.getAttachments().catch(() => null);
  if (!attachments) return null;
  for (const [id, attachment] of attachments) {
    if (attachment.filename !== 'mdwork-source.md' || attachment.description !== 'MDWork embedded Markdown source') continue;
    const content = attachment.content ?? await pdf.getAttachmentContent(id);
    if (!content) return null;
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  }
  return null;
}

export async function convertPdfDocument(
  arrayBuffer: ArrayBuffer,
  options: PdfConversionOptions = {},
): Promise<PdfConversionResult> {
  const mode = options.mode ?? 'editable';
  const browser = typeof window !== 'undefined';
  // PDF.js 6 fingerprints use Uint8Array.toHex, which Electron's Chromium does
  // not provide yet. The legacy build includes the compatibility polyfill.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // PDF.js treats file:// origins as cross-origin and wraps workerSrc in a
  // blob module. Chromium cannot import the packaged file from that wrapper,
  // so provide a real, per-conversion worker instead of the fake-worker path.
  const webWorker = browser ? new Worker(pdfWorkerUrl, { type: 'module' }) : null;
  const worker = webWorker
    ? new pdfjs.PDFWorker({ port: webWorker } as never)
    : undefined;
  const loadingTask = pdfjs.getDocument({
    worker,
    data: new Uint8Array(arrayBuffer.slice(0)),
    disableFontFace: !browser,
    useSystemFonts: false,
    useWasm: false,
    ...(browser ? {
      cMapUrl: import.meta.env.DEV
        ? '/node_modules/pdfjs-dist/cmaps/'
        : new URL('./pdfjs/cmaps/', window.document.baseURI).href,
      cMapPacked: true,
      standardFontDataUrl: import.meta.env.DEV
        ? '/node_modules/pdfjs-dist/standard_fonts/'
        : new URL('./pdfjs/standard_fonts/', window.document.baseURI).href,
    } : {}),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  let pdf: PDFDocumentProxy | undefined;
  try {
    pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    if (mode !== 'layout') {
      const source = await embeddedMarkdown(pdf);
      if (source !== null) {
        let preview: ImportedDocumentImage | undefined;
        if (options.includePreview) {
          const firstPage = await pdf.getPage(1);
          preview = { uri: 'mdwork-preview', contentType: 'image/png', data: await renderPageImage(firstPage, 0.9) };
          firstPage.cleanup();
        }
        return {
          markdown: source,
          images: [],
          warnings: ['已恢复 MDWork 内嵌的 Markdown 源文；外部图片仍按源文中的相对路径解析。'],
          preview,
          pageCount,
          recoveredSource: true,
          stats: emptyStats(),
        };
      }
    }

    const images: ImportedDocumentImage[] = [];
    const warnings: string[] = [];
    const pages: PdfPageLines[] = [];
    const pageImageUris: string[][] = [];
    const pageSnapshots = new Map<number, string>();
    const layoutUris: string[] = [];
    let preview: ImportedDocumentImage | undefined;
    let extractionFailures = 0;
    let vectorPages = 0;
    const renderedPages = new Set<number>();
    const pendingImagePages = new Map<number, { page: PDFPageProxy; imageObjectIds: string[] }>();
    const addImage = (data: ArrayBuffer): string => {
      const uri = `mdwork-image:${images.length + 1}`;
      images.push({ uri, contentType: 'image/png', data });
      return uri;
    };

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      if (options.includePreview && pageNumber === 1) {
        preview = { uri: 'mdwork-preview', contentType: 'image/png', data: await renderPageImage(page, 0.9) };
        renderedPages.add(pageNumber);
      }
      if (mode === 'layout') {
        layoutUris.push(addImage(await renderPageImage(page, 1.6)));
        page.cleanup();
        continue;
      }

      const [content, operatorList] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      const features = analyzeOperators(pdfjs, operatorList);
      if (features.hasVectorGraphics) vectorPages += 1;
      const lines = extractLines(content.items as Array<PdfTextItem | { type: string }>);
      pages.push({
        lines,
        width: page.view[2] - page.view[0],
        height: page.view[3] - page.view[1],
        ...features,
      });
      const needsSnapshot = mode === 'hybrid'
        && (features.hasVectorGraphics || !lines.length || (features.hasImages && !features.imageObjectIds.length));
      if (needsSnapshot) {
        pageSnapshots.set(pageNumber, addImage(await renderPageImage(page, 1.6)));
        pageImageUris.push([]);
      } else if (features.imageObjectIds.length) {
        if (mode === 'hybrid') {
          // Repeated headers are removed only after every page is analyzed.
          // Keep image pages alive until we know whether body text remains.
          pendingImagePages.set(pageNumber, { page, imageObjectIds: features.imageObjectIds });
          pageImageUris.push([]);
          continue;
        }
        let imageObjectIds = features.imageObjectIds;
        if (!renderedPages.has(pageNumber)) {
          await resolvePageImages(page);
          // Rendering may replace the operator-list generation. Refresh the
          // IDs so page.objs lookup targets the image data it just decoded.
          imageObjectIds = analyzeOperators(pdfjs, await page.getOperatorList()).imageObjectIds;
        }
        const extracted = await extractPageImages(page, imageObjectIds);
        extractionFailures += extracted.failures;
        pageImageUris.push(extracted.images.map(addImage));
      } else {
        pageImageUris.push([]);
      }
      page.cleanup();
    }

    if (mode === 'layout') {
      const markdown = `${layoutUris.map((uri, index) => `![PDF 第 ${index + 1} 页](${uri})`).join('\n\n')}\n`;
      const stats = emptyStats();
      stats.pageSnapshots = pageCount;
      return {
        markdown,
        images,
        warnings: [`已将 ${pageCount} 页渲染为原页图片；版式保留，但文字不能直接编辑。`],
        preview,
        pageCount,
        recoveredSource: false,
        stats,
      };
    }

    const analysis = analyzePages(pages, options.removeHeaders ?? true);
    for (const [pageNumber, pending] of pendingImagePages) {
      try {
        if (!analysis.pages[pageNumber - 1]) {
          pageSnapshots.set(pageNumber, addImage(await renderPageImage(pending.page, 1.6)));
          continue;
        }
        let imageObjectIds = pending.imageObjectIds;
        if (!renderedPages.has(pageNumber)) {
          await resolvePageImages(pending.page);
          imageObjectIds = analyzeOperators(pdfjs, await pending.page.getOperatorList()).imageObjectIds;
        }
        const extracted = await extractPageImages(pending.page, imageObjectIds);
        extractionFailures += extracted.failures;
        pageImageUris[pageNumber - 1] = extracted.images.map(addImage);
      } finally {
        pending.page.cleanup();
      }
    }
    if (!pages.some((page) => page.lines.length) && mode === 'editable') {
      throw new Error('PDF 没有可提取的文字层，可能是扫描件。请先 OCR，或改用“保留版式 / 混合”模式。');
    }
    const sections: string[] = [];
    analysis.pages.forEach((markdown, index) => {
      const pageNumber = index + 1;
      const blocks = markdown ? [markdown] : [];
      const snapshot = pageSnapshots.get(pageNumber);
      if (snapshot) blocks.push(`![PDF 第 ${pageNumber} 页原始版式](${snapshot})`);
      pageImageUris[index].forEach((uri, imageIndex) => {
        blocks.push(`![PDF 第 ${pageNumber} 页图片 ${imageIndex + 1}](${uri})`);
      });
      if (blocks.length) sections.push(blocks.join('\n\n'));
    });
    const markdown = sections.join('\n\n').trim();
    if (!markdown) throw new Error('PDF 没有可转换的文字或页面内容。');

    const stats = analysis.stats;
    stats.pageSnapshots = pageSnapshots.size;
    stats.extractedImages = images.length - stats.pageSnapshots;
    if (stats.columnPages) warnings.push(`${stats.columnPages} 页检测到多栏，已按栏整理阅读顺序。`);
    if (stats.removedHeaders) warnings.push(`已移除 ${stats.removedHeaders} 行重复页眉、页脚或页码，可在导入前关闭此选项。`);
    if (stats.tables) warnings.push(`已将 ${stats.tables} 个具有明确对齐结构的简单表格转换为 GFM。`);
    if (stats.extractedImages) warnings.push(`已提取 ${stats.extractedImages} 张内嵌图片；图片位置按所属页面附在文字后。`);
    if (stats.pageSnapshots) warnings.push(`${stats.pageSnapshots} 个复杂或无文字页面已附原始版式图片，避免强行猜测结构。`);
    if (stats.scannedPages) warnings.push(`${stats.scannedPages} 页没有文字层；当前未执行 OCR，扫描文字仍需识别后才能编辑。`);
    if (extractionFailures) warnings.push(`${extractionFailures} 张图片使用暂不支持的编码，未能单独提取；可改用混合模式保留原页图。`);
    if (mode === 'editable' && vectorPages) warnings.push(`${vectorPages} 页含矢量图形或复杂表格；需要保留原貌时请改用混合模式。`);
    return {
      markdown: `${markdown}\n`,
      images,
      warnings,
      preview,
      pageCount,
      recoveredSource: false,
      stats,
    };
  } catch (error) {
    if (error instanceof Error && /password/i.test(`${error.name} ${error.message}`)) {
      throw new Error('PDF 受密码保护，请先解除密码保护后再导入。');
    }
    throw error;
  } finally {
    // Cleanup must not replace the actual parsing error with AbortException.
    await loadingTask.destroy().catch(() => undefined);
    webWorker?.terminate();
  }
}

export async function convertPdfToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await convertPdfDocument(arrayBuffer, { mode: 'editable' });
  return result.markdown;
}
