import {
  AlignmentType,
  BorderStyle,
  Document as WordDocument,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
  type IParagraphOptions,
  type IRunStylePropertiesOptions,
  type NumberingDefinition,
  type ParagraphChild,
} from 'docx';
import type { PdfOptions } from '../../shared/contracts';

export interface DocxExportResult {
  data: ArrayBuffer;
  warnings: string[];
}

interface ListContext {
  level: number;
  ordered: boolean;
  reference?: string;
}

interface BlockContext {
  quote?: boolean;
  list?: ListContext;
}

interface ConversionContext {
  sourcePath: string | null;
  options: PdfOptions;
  contentWidth: number;
  numbering: NumberingDefinition[];
  warnings: string[];
  warningKeys: Set<string>;
  orderedListCount: number;
}

const blockTags = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE',
  'UL', 'OL', 'TABLE', 'HR', 'THEAD', 'TBODY', 'TR',
]);
const headingLevels = [
  HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
];
type BodyChild = Paragraph | Table;
type MutableParagraphOptions = { -readonly [K in keyof IParagraphOptions]: IParagraphOptions[K] };

function elementChildren(element: Element, tagName?: string): Element[] {
  return [...element.children].filter((child) => !tagName || child.tagName === tagName);
}

function directRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const child of [...table.childNodes]) {
    if (!(child instanceof Element)) continue;
    if (child.tagName === 'TR') rows.push(child);
    if (child.tagName === 'THEAD' || child.tagName === 'TBODY' || child.tagName === 'TFOOT') {
      rows.push(...elementChildren(child, 'TR'));
    }
  }
  return rows;
}

function hasBlockChild(element: Element): boolean {
  return [...element.children].some((child) => blockTags.has(child.tagName));
}

function normalizeText(value: string, preserveWhitespace: boolean): string {
  return preserveWhitespace ? value : value.replace(/\s+/g, ' ');
}

function safeFont(value: string): string | undefined {
  const font = value.trim();
  return font.length <= 120 && /^[\p{L}\p{N} _-]+$/u.test(font) ? font : undefined;
}

function wordColor(value: string): string | undefined {
  if (/^#[\da-fA-F]{6}$/.test(value)) return value.slice(1).toUpperCase();
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (!rgb) return undefined;
  return rgb.slice(1).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function spanStyle(element: HTMLElement, current: IRunStylePropertiesOptions): IRunStylePropertiesOptions {
  const next = { ...current };
  const font = safeFont(element.style.fontFamily);
  if (font) next.font = font;
  const size = /^(\d+(?:\.\d+)?)pt$/.exec(element.style.fontSize);
  if (size) next.size = Math.round(Math.min(72, Math.max(1, Number(size[1]))) * 2);
  const color = wordColor(element.style.color);
  if (color) next.color = color;
  return next;
}

function runStyle(style: IRunStylePropertiesOptions): IRunStylePropertiesOptions {
  return style;
}

function warn(context: ConversionContext, key: string, message: string): void {
  if (context.warningKeys.has(key)) return;
  context.warningKeys.add(key);
  context.warnings.push(message);
}

function imageBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function loadImage(source: string, remote: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (remote) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = source;
  });
}

function canvasBytes(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('图片转换失败')); return; }
      void blob.arrayBuffer().then(resolve, reject);
    }, 'image/png');
  });
}

async function createImageRun(
  element: HTMLImageElement,
  context: ConversionContext,
): Promise<ImageRun | TextRun> {
  const source = element.getAttribute('src') ?? '';
  const alt = element.getAttribute('alt') || '图片';
  let objectUrl: string | null = null;
  try {
    let loadSource = source;
    let remote = false;
    if (/^mdwork-asset:/i.test(source)) {
      if (!context.sourcePath) throw new Error('请先保存文档，再导出本地图片');
      const url = new URL(source);
      const assetSource = url.searchParams.get('src');
      if (!assetSource) throw new Error('本地图片地址无效');
      const result = await window.mdwork.readExportImage({
        documentPath: context.sourcePath, source: assetSource,
      });
      const bytes = imageBytes(result.data);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      objectUrl = URL.createObjectURL(new Blob([copy.buffer]));
      loadSource = objectUrl;
    } else if (/^https?:/i.test(source)) {
      remote = true;
    } else if (!/^data:image\//i.test(source)) {
      throw new Error('不支持的图片地址');
    }

    const image = await loadImage(loadSource, remote);
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!(naturalWidth > 0 && naturalHeight > 0)) throw new Error('图片尺寸无效');
    const rasterScale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(naturalWidth * rasterScale));
    canvas.height = Math.max(1, Math.round(naturalHeight * rasterScale));
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('无法创建图片转换画布');
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = await canvasBytes(canvas);

    let displayLimit = context.contentWidth;
    const styleWidth = element.style.width;
    if (styleWidth.endsWith('%')) {
      displayLimit *= Math.min(100, Math.max(1, Number.parseFloat(styleWidth))) / 100;
    } else if (element.classList.contains('image-left') || element.classList.contains('image-right')) {
      displayLimit *= 0.4;
    } else if (element.classList.contains('image-center')) {
      displayLimit *= 0.6;
    }
    const displayScale = Math.min(1, displayLimit / naturalWidth);
    return new ImageRun({
      type: 'png', data,
      transformation: {
        width: Math.max(1, Math.round(naturalWidth * displayScale)),
        height: Math.max(1, Math.round(naturalHeight * displayScale)),
      },
      altText: { name: alt.slice(0, 120), description: alt, title: alt },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    warn(context, `image:${source}`, `图片“${alt}”未嵌入：${reason}`);
    return new TextRun({ text: `[${alt}]`, italics: true, color: '6E7781' });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function inlineChildren(
  nodes: Iterable<Node>,
  style: IRunStylePropertiesOptions,
  context: ConversionContext,
  preserveWhitespace = false,
): Promise<ParagraphChild[]> {
  const children: ParagraphChild[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent ?? '', preserveWhitespace);
      if (text) children.push(new TextRun({ text, ...runStyle(style) }));
      continue;
    }
    if (!(node instanceof Element)) continue;
    if (node.tagName === 'BR') {
      children.push(new TextRun({ text: '', break: 1 }));
      continue;
    }
    if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') {
      children.push(new TextRun({ text: node.hasAttribute('checked') ? '☑ ' : '☐ ' }));
      continue;
    }
    if (node.tagName === 'IMG') {
      children.push(await createImageRun(node as HTMLImageElement, context));
      continue;
    }

    const next = { ...style };
    if (node.tagName === 'STRONG' || node.tagName === 'B') next.bold = true;
    if (node.tagName === 'EM' || node.tagName === 'I') next.italics = true;
    if (node.tagName === 'DEL' || node.tagName === 'S') next.strike = true;
    if (node.tagName === 'U') next.underline = {};
    if (node.tagName === 'CODE') {
      next.font = context.options.codeFontFamily;
      next.size = Math.round(context.options.fontSize * 1.76);
      next.shading = context.options.printBackground ? { fill: 'F3F4F6' } : undefined;
    }
    if (node instanceof HTMLElement && node.tagName === 'SPAN') Object.assign(next, spanStyle(node, next));
    const nested = await inlineChildren([...node.childNodes], next, context, preserveWhitespace || node.tagName === 'CODE');
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^(https?:|mailto:)/i.test(href) && nested.length) {
        children.push(new ExternalHyperlink({ link: href, children: nested }));
        continue;
      }
    }
    children.push(...nested);
  }
  return children;
}

function paragraphProperties(context: ConversionContext, block: BlockContext): MutableParagraphOptions {
  const properties: MutableParagraphOptions = {
    spacing: { after: 120, line: Math.round(context.options.lineHeight * 240) },
  };
  if (block.quote) {
    properties.indent = { left: 360 };
    properties.border = { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D7DE', space: 8 } };
  }
  if (block.list) {
    if (block.list.ordered && block.list.reference) {
      properties.numbering = { reference: block.list.reference, level: block.list.level };
    } else {
      properties.bullet = { level: block.list.level };
    }
  }
  return properties;
}

async function paragraph(
  element: Element,
  context: ConversionContext,
  block: BlockContext = {},
): Promise<Paragraph> {
  const children = await inlineChildren([...element.childNodes], {}, context);
  const properties = paragraphProperties(context, block);
  if (/^H[1-6]$/.test(element.tagName)) {
    properties.heading = headingLevels[Number(element.tagName[1]) - 1];
    properties.keepNext = true;
  }
  const images = [...element.children].filter((child) => child.tagName === 'IMG');
  if (element.tagName === 'DIV' && element.classList.contains('mermaid-diagram')) {
    properties.alignment = AlignmentType.CENTER;
  } else if (images.some((image) => image.classList.contains('image-center'))) {
    properties.alignment = AlignmentType.CENTER;
  }
  const alignment = element.getAttribute('align');
  if (alignment === 'center') properties.alignment = AlignmentType.CENTER;
  if (alignment === 'right') properties.alignment = AlignmentType.RIGHT;
  if (alignment === 'left') properties.alignment = AlignmentType.LEFT;
  return new Paragraph({ ...properties, children });
}

function registerOrderedList(element: Element, level: number, context: ConversionContext): string {
  const reference = `mdwork-ordered-${++context.orderedListCount}`;
  const start = Math.max(1, Number(element.getAttribute('start')) || 1);
  context.numbering.push({
    reference,
    levels: Array.from({ length: 9 }, (_, index) => ({
      level: index,
      format: LevelFormat.DECIMAL,
      text: `%${index + 1}.`,
      start: index === level ? start : 1,
      style: { paragraph: { indent: { left: 360 * (index + 1), hanging: 280 } } },
    })),
  });
  return reference;
}

async function convertList(
  element: Element,
  context: ConversionContext,
  block: BlockContext,
): Promise<BodyChild[]> {
  const ordered = element.tagName === 'OL';
  const level = Math.min(8, block.list?.level ?? 0);
  const list: ListContext = {
    level,
    ordered,
    reference: ordered ? registerOrderedList(element, level, context) : undefined,
  };
  const result: BodyChild[] = [];
  for (const item of elementChildren(element, 'LI')) {
    let firstParagraph = true;
    let inlineBuffer: Node[] = [];
    const flushInline = async () => {
      if (!inlineBuffer.length) return;
      const wrapper = element.ownerDocument.createElement('p');
      for (const node of inlineBuffer.splice(0)) wrapper.append(node.cloneNode(true));
      result.push(await paragraph(wrapper, context, {
        quote: block.quote, list: firstParagraph ? list : undefined,
      }));
      firstParagraph = false;
    };

    for (const node of [...item.childNodes]) {
      if (node instanceof Element && (node.tagName === 'UL' || node.tagName === 'OL')) {
        await flushInline();
        result.push(...await convertList(node, context, { quote: block.quote, list }));
        continue;
      }
      if (node instanceof Element && blockTags.has(node.tagName)) {
        await flushInline();
        result.push(...await convertBlocks([node], context, {
          quote: block.quote, list: firstParagraph ? list : undefined,
        }));
        firstParagraph = false;
      } else {
        inlineBuffer.push(node);
      }
    }
    await flushInline();
  }
  return result;
}

async function convertTable(element: Element, context: ConversionContext): Promise<Table> {
  const rows = directRows(element);
  const tableRows: TableRow[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    const cells = [...row.children].filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH');
    const converted: TableCell[] = [];
    for (const cell of cells) {
      const children = await convertBlocks([...cell.childNodes], context, {});
      converted.push(new TableCell({
        children: children.length ? children : [new Paragraph('')],
        shading: (rowIndex === 0 || cell.tagName === 'TH') && context.options.printBackground
          ? { fill: 'F3F4F6' } : undefined,
        margins: { top: 90, bottom: 90, left: 120, right: 120 },
      }));
    }
    tableRows.push(new TableRow({ children: converted, tableHeader: rowIndex === 0 }));
  }
  if (!tableRows.length) tableRows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph('')] })] }));
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

async function convertBlocks(
  nodes: Iterable<Node>,
  context: ConversionContext,
  block: BlockContext,
): Promise<BodyChild[]> {
  const result: BodyChild[] = [];
  let inlineBuffer: Node[] = [];
  const flushInline = async () => {
    if (!inlineBuffer.length) return;
    const wrapper = contextSourceDocument(inlineBuffer).createElement('p');
    for (const node of inlineBuffer.splice(0)) wrapper.append(node.cloneNode(true));
    if (wrapper.textContent?.trim() || wrapper.querySelector('img,input')) {
      result.push(await paragraph(wrapper, context, block));
    }
  };

  for (const node of nodes) {
    if (!(node instanceof Element)) {
      if (node.textContent?.trim()) inlineBuffer.push(node);
      continue;
    }
    if (!blockTags.has(node.tagName)) {
      inlineBuffer.push(node);
      continue;
    }
    await flushInline();
    if (/^H[1-6]$/.test(node.tagName) || node.tagName === 'P') {
      result.push(await paragraph(node, context, block));
      continue;
    }
    if (node.tagName === 'HR') {
      result.push(new Paragraph({ ...paragraphProperties(context, block), thematicBreak: true }));
      continue;
    }
    if (node.tagName === 'PRE') {
      const lines = (node.textContent ?? '').replace(/\n$/, '').split('\n');
      for (const line of lines) {
        result.push(new Paragraph({
          shading: context.options.printBackground ? { fill: 'F6F8FA' } : undefined,
          spacing: { after: 0, line: 240 },
          indent: block.quote ? { left: 360 } : undefined,
          children: [new TextRun({
            text: line || ' ', font: context.options.codeFontFamily,
            size: Math.round(context.options.fontSize * 1.76),
          })],
        }));
      }
      result.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }
    if (node.tagName === 'BLOCKQUOTE') {
      result.push(...await convertBlocks([...node.childNodes], context, { ...block, quote: true }));
      continue;
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      result.push(...await convertList(node, context, block));
      continue;
    }
    if (node.tagName === 'TABLE') {
      result.push(await convertTable(node, context));
      continue;
    }
    if (node.classList.contains('image-clear')) continue;
    if (node.classList.contains('layer-diagram')) {
      warn(context, 'layer-diagram', '分层架构图已按文字内容导出，复杂布局请在 PDF 中保留。');
    }
    if (hasBlockChild(node)) {
      result.push(...await convertBlocks([...node.childNodes], context, block));
    } else {
      result.push(await paragraph(node, context, block));
    }
  }
  await flushInline();
  return result;
}

function contextSourceDocument(nodes: Node[]): Document {
  return nodes[0]?.ownerDocument ?? document;
}

function contentWidth(options: PdfOptions): number {
  const portraitWidth = options.pageSize === 'Letter' ? 816 : 794;
  const pageWidth = options.orientation === 'landscape'
    ? (options.pageSize === 'Letter' ? 1056 : 1123) : portraitWidth;
  return Math.max(240, Math.round(pageWidth - options.margin * 2 * 96 / 25.4));
}

export async function createDocxExport(
  bodyHtml: string,
  title: string,
  sourcePath: string | null,
  options: PdfOptions,
): Promise<DocxExportResult> {
  const parsed = new DOMParser().parseFromString(bodyHtml, 'text/html');
  const context: ConversionContext = {
    sourcePath, options, contentWidth: contentWidth(options), numbering: [],
    warnings: [], warningKeys: new Set(), orderedListCount: 0,
  };
  const body = await convertBlocks([...parsed.body.childNodes], context, {});
  const children: FileChild[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 320 },
      children: [new TextRun({ text: title, bold: true })],
    }),
  ];
  if (options.showToc) {
    children.push(new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-6' }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  children.push(...body);
  const margin = Math.round(options.margin / 25.4 * 1440);
  const landscape = options.orientation === 'landscape';
  const portraitWidth = options.pageSize === 'Letter' ? 12240 : 11906;
  const portraitHeight = options.pageSize === 'Letter' ? 15840 : 16838;
  const word = new WordDocument({
    creator: 'MDWork',
    title,
    description: '由 MDWork 本地导出的 Markdown 文档',
    styles: {
      default: {
        document: {
          run: { font: options.fontFamily, size: Math.round(options.fontSize * 2) },
          paragraph: { spacing: { line: Math.round(options.lineHeight * 240), after: 120 } },
        },
      },
    },
    numbering: { config: context.numbering },
    sections: [{
      properties: {
        page: {
          size: {
            width: landscape ? portraitHeight : portraitWidth,
            height: landscape ? portraitWidth : portraitHeight,
            orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: { top: margin, right: margin, bottom: margin, left: margin },
        },
      },
      footers: options.showPageNumbers ? {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16 })],
        })] }),
      } : undefined,
      children,
    }],
  });
  return { data: await Packer.toArrayBuffer(word), warnings: context.warnings };
}
