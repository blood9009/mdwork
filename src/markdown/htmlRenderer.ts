import hljs from 'highlight.js';
import type {
  BlockNode,
  DocumentNode,
  HeadingBlock,
  InlineNode,
  ListBlock,
  ListItemBlock,
  TableAlignment,
} from './ast';
import { inlineText } from './ast';
import { normalizeDiagramSource } from './diagramSyntax';
import { renderLayeredDiagram } from './layeredDiagram';
import type { ExportHeading } from '../../shared/contracts';

export interface RenderedMarkdown {
  html: string;
  headings: ExportHeading[];
}

type RenderContext = {
  headings: ExportHeading[];
  slugs: Map<string, number>;
  numbering: { value: number; style: NonNullable<HeadingBlock['numbering']> }[];
};

export function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function slugify(value: string): string {
  return value.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'section';
}

function alphabeticNumber(value: number): string {
  let result = '';
  for (let remaining = value; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
    result = String.fromCharCode(65 + ((remaining - 1) % 26)) + result;
  }
  return result;
}

function nextHeadingNumber(
  context: RenderContext,
  level: number,
  style: NonNullable<HeadingBlock['numbering']>,
): string {
  context.numbering[level].value += 1;
  context.numbering[level].style = style;
  for (let deeper = level + 1; deeper <= 6; deeper += 1) context.numbering[deeper].value = 0;
  return context.numbering.slice(1, level + 1)
    .filter((counter) => counter.value > 0)
    .map((counter) => {
      if (counter.style === 'decimal') return String(counter.value);
      const value = alphabeticNumber(counter.value);
      return counter.style === 'lower-alpha' ? value.toLowerCase() : value;
    })
    .join('.');
}

function titleAttribute(title: string | undefined): string {
  return title === undefined ? '' : ` title="${escapeHtml(title)}"`;
}

export function renderInlineNodes(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return escapeHtml(node.value);
      case 'code': return `<code>${escapeHtml(node.value)}</code>`;
      case 'html': return node.value;
      case 'softBreak': return '\n';
      case 'hardBreak': return '<br>\n';
      case 'emphasis': return `<em>${renderInlineNodes(node.children)}</em>`;
      case 'strong': return `<strong>${renderInlineNodes(node.children)}</strong>`;
      case 'strikethrough': return `<del>${renderInlineNodes(node.children)}</del>`;
      case 'link':
        return `<a href="${escapeHtml(node.href)}"${titleAttribute(node.title)}>${renderInlineNodes(node.children)}</a>`;
      case 'image': {
        const className = node.layout ? ` class="image-${node.layout}"` : '';
        const width = node.width ? ` data-image-width="${escapeHtml(node.width)}"` : '';
        return `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}"${titleAttribute(node.title)}${className}${width}>`;
      }
    }
  }).join('');
}

function renderListItem(item: ListItemBlock, list: ListBlock, context: RenderContext): string {
  const className = item.checked === null ? '' : ' class="task-list-item"';
  const checkbox = item.checked === null ? ''
    : `<input class="task-list-item-checkbox" type="checkbox" disabled${item.checked ? ' checked=""' : ''}> `;
  const [first, ...rest] = item.children;
  let content = '';

  if (first?.type === 'paragraph') {
    const inline = `${checkbox}${renderInlineNodes(first.children)}`;
    content += list.tight
      ? inline
      : `<p data-source-line="${first.line}">${inline}</p>`;
  } else {
    content += checkbox;
    if (first) content += renderBlock(first, context);
  }
  content += renderBlocks(rest, context);
  return `<li${className} data-source-line="${item.line}">${content}</li>`;
}

function alignmentAttribute(alignment: TableAlignment): string {
  return alignment ? ` align="${alignment}"` : '';
}

function renderBlock(node: BlockNode, context: RenderContext, tight = false): string {
  switch (node.type) {
    case 'paragraph':
      return tight
        ? renderInlineNodes(node.children)
        : `<p data-source-line="${node.line}">${renderInlineNodes(node.children)}</p>`;
    case 'heading': {
      const text = node.numbering
        ? nextHeadingNumber(context, node.level, node.numbering)
        : inlineText(node.children) || '未命名标题';
      if (!node.numbering) {
        for (let deeper = node.level + 1; deeper <= 6; deeper += 1) context.numbering[deeper].value = 0;
      }
      const base = slugify(text);
      const count = context.slugs.get(base) ?? 0;
      context.slugs.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      context.headings.push({ id, text, level: node.level });
      const className = node.numbering ? ' class="numbered-heading"'
        : node.compact ? ' class="compact-heading"' : '';
      const content = node.numbering ? escapeHtml(text) : renderInlineNodes(node.children);
      return `<h${node.level} id="${escapeHtml(id)}"${className} data-source-line="${node.line}">${content}</h${node.level}>`;
    }
    case 'codeBlock': {
      const language = node.language.replace(/[^\w+-]/g, '');
      if (language === 'layers') return renderLayeredDiagram(node.value, node.line);
      let diagramSource: string | null;
      try {
        diagramSource = normalizeDiagramSource(language, node.meta, node.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : '图表指令转换失败';
        return `<pre class="mermaid-error" data-source-line="${node.line}">${escapeHtml(`${message}\n\n${node.value}`)}</pre>`;
      }
      if (diagramSource !== null) {
        return `<div class="mermaid-diagram" data-source-line="${node.line}" data-mermaid-source="${escapeHtml(encodeURIComponent(diagramSource))}"><pre class="mermaid-source"><code>${escapeHtml(diagramSource)}</code></pre></div>`;
      }
      let code: string;
      if (language && hljs.getLanguage(language)) {
        try {
          code = hljs.highlight(node.value, { language, ignoreIllegals: true }).value;
        } catch {
          code = escapeHtml(node.value);
        }
      } else {
        code = escapeHtml(node.value);
      }
      return `<pre class="hljs" data-source-line="${node.line}"><code${language ? ` class="language-${language}"` : ''}>${code}</code></pre>`;
    }
    case 'htmlBlock': return node.value;
    case 'thematicBreak': return `<hr data-source-line="${node.line}">`;
    case 'imageClear': return `<div class="image-clear" data-source-line="${node.line}"></div>`;
    case 'blockquote':
      return `<blockquote data-source-line="${node.line}">\n${renderBlocks(node.children, context)}</blockquote>`;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const start = node.ordered && node.start !== 1 ? ` start="${node.start}"` : '';
      const taskClass = node.items.some((item) => item.checked !== null) ? ' class="contains-task-list"' : '';
      return `<${tag}${start}${taskClass} data-source-line="${node.line}">\n${node.items.map((item) => renderListItem(item, node, context)).join('\n')}\n</${tag}>`;
    }
    case 'table': {
      const header = node.header.map((cell, index) =>
        `<th${alignmentAttribute(node.align[index])}>${renderInlineNodes(cell)}</th>`).join('');
      const rows = node.rows.map((row) => `<tr>${row.map((cell, index) =>
        `<td${alignmentAttribute(node.align[index])}>${renderInlineNodes(cell)}</td>`).join('')}</tr>`).join('\n');
      return `<table data-source-line="${node.line}">\n<thead><tr>${header}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`;
    }
  }
}

function renderBlocks(nodes: BlockNode[], context: RenderContext, tight = false): string {
  return nodes.map((node) => renderBlock(node, context, tight)).join('\n');
}

export function renderDocument(document: DocumentNode): RenderedMarkdown {
  const context: RenderContext = {
    headings: [], slugs: new Map(),
    numbering: Array.from({ length: 7 }, () => ({ value: 0, style: 'decimal' })),
  };
  const html = renderBlocks(document.children, context);
  return { html, headings: context.headings };
}
