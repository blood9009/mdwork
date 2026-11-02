import { describe, expect, it } from 'vitest';
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { convertWordToMarkdown } from '../src/import/wordToMarkdown';
import { convertPdfDocument, convertPdfToMarkdown } from '../src/import/pdfToMarkdown';

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Word to Markdown import', () => {
  it('preserves headings, formatting, lists, tables, links and images', async () => {
    const word = new Document({ sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('项目报告')] }),
      new Paragraph({ children: [
        new TextRun({ text: '重要', bold: true }),
        new TextRun('内容，访问 '),
        new ExternalHyperlink({
          link: 'https://github.com/blood9009/mdwork',
          children: [new TextRun({ text: 'MDWork', style: 'Hyperlink' })],
        }),
      ] }),
      new Paragraph({ children: [new TextRun('第一项')], bullet: { level: 0 } }),
      new Paragraph({ children: [new TextRun('第二项')], bullet: { level: 0 } }),
      new Table({ rows: [
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph('名称')] }),
          new TableCell({ children: [new Paragraph('状态')] }),
        ] }),
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph('导入')] }),
          new TableCell({ children: [new Paragraph('完成')] }),
        ] }),
      ] }),
      new Paragraph({ children: [new ImageRun({
        type: 'png',
        data: onePixelPng,
        transformation: { width: 1, height: 1 },
        altText: { name: 'pixel', description: '示例图片', title: '示例图片' },
      })] }),
    ] }] });
    const buffer = await Packer.toBuffer(word);
    const result = await convertWordToMarkdown(arrayBuffer(buffer));

    expect(result.markdown).toContain('# 项目报告');
    expect(result.markdown).toContain('**重要**');
    expect(result.markdown).toContain('[MDWork](https://github.com/blood9009/mdwork)');
    expect(result.markdown).toContain('- 第一项');
    expect(result.markdown).toContain('- 第二项');
    expect(result.markdown).toContain('| 名称 | 状态 |\n| --- | --- |\n| 导入 | 完成 |');
    expect(result.markdown).toContain('![示例图片](mdwork-image:1)');
    expect(result.images).toHaveLength(1);
    expect(result.images[0].contentType).toBe('image/png');
    expect(result.images[0].data.byteLength).toBe(onePixelPng.byteLength);
  }, 20_000);
});

describe('PDF to Markdown import', () => {
  it('extracts headings, joins wrapped paragraphs and preserves list items', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Import Guide', { x: 72, y: 730, size: 24, font });
    page.drawText('This is the first line of a para-', { x: 72, y: 680, size: 12, font });
    page.drawText('graph joined during import.', { x: 72, y: 664, size: 12, font });
    page.drawText('- First item', { x: 72, y: 620, size: 12, font });
    page.drawText('- Second item', { x: 72, y: 604, size: 12, font });
    const bytes = await pdf.save();
    const markdown = await convertPdfToMarkdown(arrayBuffer(bytes));

    expect(markdown).toContain('# Import Guide');
    expect(markdown).toContain('This is the first line of a paragraph joined during import.');
    expect(markdown).toContain('- First item\n- Second item');
  }, 20_000);

  it('reports scanned PDFs without a text layer instead of returning empty Markdown', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const bytes = await pdf.save();

    await expect(convertPdfToMarkdown(arrayBuffer(bytes))).rejects.toThrow('OCR');
  }, 20_000);

  it('reads each column completely before continuing with the next column', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const [text, x, y] of [
      ['Left column first line', 50, 700],
      ['Left column second line', 50, 680],
      ['Left column third line', 50, 660],
      ['Right column first line', 330, 700],
      ['Right column second line', 330, 680],
      ['Right column third line', 330, 660],
    ] as const) page.drawText(text, { x, y, size: 12, font });
    const result = await convertPdfDocument(arrayBuffer(await pdf.save()));

    expect(result.markdown).toContain('Left column first line Left column second line Left column third line');
    expect(result.markdown).toContain('Right column first line Right column second line Right column third line');
    expect(result.markdown.indexOf('Left column third line')).toBeLessThan(result.markdown.indexOf('Right column first line'));
    expect(result.stats.columnPages).toBe(1);
  }, 20_000);

  it('removes only repeated page-edge headers, footers and page numbers', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const page = pdf.addPage([612, 792]);
      page.drawText('ACME 2026 REPORT', { x: 72, y: 760, size: 12, font });
      page.drawText(`Unique body ${pageNumber}`, { x: 72, y: 700, size: 12, font });
      page.drawText(`Page ${pageNumber}`, { x: 280, y: 30, size: 12, font });
    }
    const bytes = await pdf.save();
    const result = await convertPdfDocument(arrayBuffer(bytes));

    expect(result.markdown).not.toContain('ACME');
    expect(result.markdown).not.toContain('Page 1');
    expect(result.markdown).toContain('Unique body 1');
    expect(result.markdown).toContain('Unique body 2');
    expect(result.markdown).toContain('Unique body 3');
    expect(result.stats.removedHeaders).toBe(6);

    const retained = await convertPdfDocument(arrayBuffer(bytes), { removeHeaders: false });
    expect(retained.markdown).toContain('ACME 2026 REPORT');
    expect(retained.markdown).toContain('Page 1');
    expect(retained.markdown).toContain('Page 3');
    expect(retained.stats.removedHeaders).toBe(0);
  }, 20_000);

  it('converts aligned text rows with vector rules into a GFM table', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const [left, right, y] of [
      ['Name', 'Value', 650],
      ['Alpha', '100', 630],
      ['Beta', '200', 610],
    ] as const) {
      page.drawText(left, { x: 72, y, size: 12, font });
      page.drawText(right, { x: 240, y, size: 12, font });
    }
    page.drawLine({ start: { x: 60, y: 670 }, end: { x: 400, y: 670 }, thickness: 1 });
    const result = await convertPdfDocument(arrayBuffer(await pdf.save()));

    expect(result.markdown).toContain('| Name | Value |\n| --- | --- |\n| Alpha | 100 |\n| Beta | 200 |');
    expect(result.stats.tables).toBe(1);
  }, 20_000);

  it('restores the exact embedded MDWork Markdown source before heuristic conversion', async () => {
    const source = '# 原始标题\n\n**粗体**、原始 Markdown 与 [链接](https://example.com)。\n';
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Visual PDF output', { x: 72, y: 700, size: 18, font });
    await pdf.attach(new TextEncoder().encode(source), 'mdwork-source.md', {
      mimeType: 'text/markdown',
      description: 'MDWork embedded Markdown source',
    });
    const result = await convertPdfDocument(arrayBuffer(await pdf.save()));

    expect(result.markdown).toBe(source);
    expect(result.recoveredSource).toBe(true);
    expect(result.warnings[0]).toContain('内嵌');
  }, 20_000);
});
