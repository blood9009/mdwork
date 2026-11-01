import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { ImportedDocumentImage } from '../../shared/contracts';

export interface WordConversionResult {
  markdown: string;
  images: ImportedDocumentImage[];
  warnings: string[];
}

export async function convertWordToMarkdown(arrayBuffer: ArrayBuffer): Promise<WordConversionResult> {
  const images: ImportedDocumentImage[] = [];
  const input = typeof window === 'undefined' ? { buffer: Buffer.from(arrayBuffer) } : { arrayBuffer };
  const result = await mammoth.convertToHtml(input, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const uri = `mdwork-image:${images.length + 1}`;
      images.push({
        uri,
        contentType: image.contentType.toLowerCase(),
        data: await image.readAsArrayBuffer(),
      });
      return { src: uri };
    }),
  });

  const cleanHtml = sanitizeHtml(result.value, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      td: ['align', 'colspan', 'rowspan'],
      th: ['align', 'colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'mdwork-image'],
  });
  // Mammoth emits only TD cells. Treat the first row as the GFM header instead
  // of leaving the whole table as raw HTML.
  const tableHtml = cleanHtml.replace(/<table>[\s\S]*?<\/table>/g, (table) =>
    table.replace(/<tr>[\s\S]*?<\/tr>/, (row) =>
      row.replace(/<(\/?)td(?=[\s>])/g, '<$1th'),
    ),
  );
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  turndown.use(gfm);
  turndown.addRule('wordTableCell', {
    filter: ['th', 'td'],
    replacement(content, node) {
      const value = content.replace(/\s*\n+\s*/g, ' ').trim();
      const index = node.parentNode
        ? Array.prototype.indexOf.call(node.parentNode.childNodes, node)
        : 0;
      return `${index === 0 ? '| ' : ' '}${value} |`;
    },
  });
  turndown.addRule('compactListItems', {
    filter: 'li',
    replacement(content, node, options) {
      const item = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
        .replace(/\n/gm, '\n    ');
      let prefix = `${options.bulletListMarker} `;
      const parent = node.parentNode;
      if (parent && parent.nodeName === 'OL') {
        const start = (parent as HTMLElement).getAttribute('start');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start ? Number(start) + index : index + 1}. `;
      }
      return prefix + item + (node.nextSibling && !/\n$/.test(item) ? '\n' : '');
    },
  });
  const markdown = turndown.turndown(tableHtml)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!markdown) throw new Error('Word 文档没有可转换的文字内容。');

  return {
    markdown: `${markdown}\n`,
    images: images.filter((image) => cleanHtml.includes(image.uri)),
    warnings: result.messages.map((message) => message.message),
  };
}
