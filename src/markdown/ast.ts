export type TextInline = { type: 'text'; value: string };
export type CodeInline = { type: 'code'; value: string };
export type HtmlInline = { type: 'html'; value: string };
export type BreakInline = { type: 'softBreak' | 'hardBreak' };
export type ContainerInline = {
  type: 'emphasis' | 'strong' | 'strikethrough';
  children: InlineNode[];
};
export type LinkInline = {
  type: 'link';
  href: string;
  title?: string;
  children: InlineNode[];
};
export type ImageInline = {
  type: 'image';
  src: string;
  alt: string;
  title?: string;
  layout?: 'left' | 'right' | 'center';
  width?: string;
};
export type InlineNode = TextInline | CodeInline | HtmlInline | BreakInline
  | ContainerInline | LinkInline | ImageInline;

export type ParagraphBlock = { type: 'paragraph'; line: number; children: InlineNode[] };
export type HeadingBlock = {
  type: 'heading';
  line: number;
  level: number;
  children: InlineNode[];
  compact?: boolean;
  numbering?: 'decimal' | 'upper-alpha' | 'lower-alpha';
};
export type CodeBlock = { type: 'codeBlock'; line: number; value: string; language: string; meta: string };
export type HtmlBlock = { type: 'htmlBlock'; line: number; value: string };
export type ThematicBreakBlock = { type: 'thematicBreak'; line: number };
export type ImageClearBlock = { type: 'imageClear'; line: number };
export type BlockquoteBlock = { type: 'blockquote'; line: number; children: BlockNode[] };
export type ListItemBlock = {
  type: 'listItem';
  line: number;
  checked: boolean | null;
  children: BlockNode[];
};
export type ListBlock = {
  type: 'list';
  line: number;
  ordered: boolean;
  start: number;
  tight: boolean;
  items: ListItemBlock[];
};
export type TableAlignment = 'left' | 'center' | 'right' | null;
export type TableBlock = {
  type: 'table';
  line: number;
  align: TableAlignment[];
  header: InlineNode[][];
  rows: InlineNode[][][];
};
export type BlockNode = ParagraphBlock | HeadingBlock | CodeBlock | HtmlBlock
  | ThematicBreakBlock | ImageClearBlock | BlockquoteBlock | ListBlock | TableBlock;
export type DocumentNode = { type: 'document'; children: BlockNode[] };

export interface SourceLine {
  text: string;
  line: number;
}

export interface ReferenceDefinition {
  href: string;
  title?: string;
}

export type ReferenceMap = Map<string, ReferenceDefinition>;

export function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if ('value' in node) return node.value;
    if ('children' in node) return inlineText(node.children);
    return '';
  }).join('');
}
