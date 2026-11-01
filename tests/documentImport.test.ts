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
import { convertPdfToMarkdown } from '../src/import/pdfToMarkdown';

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
});
