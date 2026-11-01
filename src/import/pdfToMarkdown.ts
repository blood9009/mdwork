import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

interface TextPart {
  text: string;
  x: number;
  width: number;
}

interface PdfLine {
  parts: TextPart[];
  x: number;
  y: number;
  height: number;
}

interface PdfPageLines {
  lines: PdfLine[];
}

function lineText(line: PdfLine): string {
  let text = '';
  let endX = 0;
  const parts = [...line.parts].sort((left, right) => left.x - right.x);
  for (const part of parts) {
    const gap = part.x - endX;
    if (text && gap > Math.max(0.8, line.height * 0.08) && !/\s$/.test(text) && !/^\s/.test(part.text)) {
      text += ' ';
    }
    text += part.text;
    endX = Math.max(endX, part.x + part.width);
  }
  return text.replace(/[\t ]+/g, ' ').trim();
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
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

export function pdfLinesToMarkdown(pages: PdfPageLines[]): string {
  const allLines = pages.flatMap((page) => page.lines);
  if (!allLines.length) throw new Error('PDF 没有可提取的文字层，可能是扫描件。请先进行 OCR，再导入生成的 PDF。');
  const bodyHeight = median(allLines.map((line) => line.height));
  const blocks: string[] = [];
  const blockTypes: Array<'heading' | 'list' | 'paragraph'> = [];
  let paragraph = '';

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

  for (const page of pages) {
    flushParagraph();
    let previous: { text: string; y: number; height: number; type: 'heading' | 'list' | 'paragraph' } | null = null;
    for (const line of page.lines) {
      const text = lineText(line);
      if (!text) continue;
      const level = headingLevel(text, line.height, bodyHeight);
      const item = level === 0 ? listItem(text) : null;
      if (level > 0) {
        appendBlock(`${'#'.repeat(level)} ${text}`, 'heading');
        previous = { text, y: line.y, height: line.height, type: 'heading' };
        continue;
      }
      if (item) {
        appendBlock(item, 'list');
        previous = { text, y: line.y, height: line.height, type: 'list' };
        continue;
      }

      const gap = previous ? previous.y - line.y : 0;
      const startsParagraph = !paragraph || !previous || previous.type !== 'paragraph'
        || gap > Math.max(bodyHeight * 1.8, previous.height * 1.8);
      if (startsParagraph) {
        flushParagraph();
        paragraph = text;
      } else {
        paragraph = joinWrappedText(paragraph, text);
      }
      previous = { text, y: line.y, height: line.height, type: 'paragraph' };
    }
    flushParagraph();
  }

  const markdown = blocks.join('\n\n').trim();
  if (!markdown) throw new Error('PDF 没有可提取的文字内容。');
  return `${markdown}\n`;
}

export async function convertPdfToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
  const browser = typeof window !== 'undefined';
  // PDF.js 6 fingerprints use Uint8Array.toHex, which Electron's Chromium does
  // not provide yet. The legacy build includes the compatibility polyfill.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (browser) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  let document: PDFDocumentProxy | undefined;
  try {
    document = await loadingTask.promise;
    const pages: PdfPageLines[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({ lines: extractLines(content.items) });
      page.cleanup();
    }
    return pdfLinesToMarkdown(pages);
  } catch (error) {
    if (error instanceof Error && /password/i.test(`${error.name} ${error.message}`)) {
      throw new Error('PDF 受密码保护，请先解除密码保护后再导入。');
    }
    throw error;
  } finally {
    // Cleanup must not replace the actual parsing error with AbortException.
    await loadingTask.destroy().catch(() => undefined);
  }
}
