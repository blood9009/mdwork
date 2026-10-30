export type MindmapDirection = 'LR' | 'TD';

interface DirectionalMindmapNode {
  id: string;
  indent: number;
  plain: boolean;
  classes: string[];
}

interface MindmapShape {
  prefix: string;
  suffix: string;
  expression: RegExp;
  plain?: boolean;
}

const shapes: MindmapShape[] = [
  { prefix: '((', suffix: '))', expression: /^(.+?)\(\((.*)\)\)$/ },
  { prefix: '{{', suffix: '}}', expression: /^(.+?)\{\{(.*)\}\}$/ },
  { prefix: '))', suffix: '((', expression: /^(.+?)\)\)(.*)\(\($/ },
  { prefix: ')', suffix: '(', expression: /^(.+?)\)(.*)\($/ },
  { prefix: '[', suffix: ']', expression: /^(.+?)\[(.*)\]$/ },
  { prefix: '(', suffix: ')', expression: /^(.+?)\((.*)\)$/ },
];

function quoteLabel(value: string): string {
  return `"${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
}

function nodeDeclaration(id: string, text: string): { declaration: string; plain: boolean } {
  for (const shape of shapes) {
    const match = shape.expression.exec(text);
    if (match) return { declaration: `${id}${shape.prefix}${quoteLabel(match[2])}${shape.suffix}`, plain: false };
  }
  return { declaration: `${id}[${quoteLabel(text)}]`, plain: true };
}

/**
 * MDWork's directional mindmap shorthand uses a flowchart tree for deterministic
 * one-way LR/TD growth. Native `mermaid` + `mindmap` programs remain untouched.
 */
export function convertMindmapDirection(source: string, direction: MindmapDirection): string {
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim().toLowerCase() === 'mindmap') lines.shift();
  const nodes: DirectionalMindmapNode[] = [];
  const declarations: string[] = [];
  const edges: string[] = [];
  const stack: DirectionalMindmapNode[] = [];

  for (const [index, rawLine] of lines.entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('%%')) continue;
    const expanded = rawLine.replace(/^\s+/, (indent) => indent.replace(/\t/g, '  '));
    const indent = expanded.length - expanded.trimStart().length;
    const text = expanded.trim();
    const previous = nodes.at(-1);
    if (text.startsWith(':::')) {
      if (!previous) throw new Error(`第 ${index + 1} 行：节点样式必须放在节点之后`);
      const classes = text.slice(3).trim().split(/\s+/).filter(Boolean);
      if (!classes.length || classes.some((name) => !/^[A-Za-z_][\w-]*$/.test(name))) {
        throw new Error(`第 ${index + 1} 行：无效的节点样式名称`);
      }
      previous.classes.push(...classes);
      continue;
    }
    if (text.startsWith('::icon(')) {
      throw new Error(`第 ${index + 1} 行：定向思维导图不支持图标装饰，请使用标准 mindmap 围栏`);
    }

    while (stack.length && indent <= stack.at(-1)!.indent) stack.pop();
    if (nodes.length > 0 && stack.length === 0) {
      throw new Error(`第 ${index + 1} 行：思维导图只能有一个根节点`);
    }
    const id = `MindmapNode${nodes.length}`;
    const converted = nodeDeclaration(id, text);
    const node: DirectionalMindmapNode = { id, indent, plain: converted.plain, classes: [] };
    declarations.push(`  ${converted.declaration}`);
    if (stack.length) edges.push(`  ${stack.at(-1)!.id} --- ${id}`);
    nodes.push(node);
    stack.push(node);
  }

  if (!nodes.length) throw new Error('思维导图至少需要一个根节点');
  const plainNodes = nodes.filter((node) => node.plain).map((node) => node.id);
  const styles = plainNodes.length ? [
    '  classDef mdworkMindmapPlain fill:transparent,stroke:transparent;',
    `  class ${plainNodes.join(',')} mdworkMindmapPlain;`,
  ] : [];
  const decorated = nodes.filter((node) => node.classes.length)
    .map((node) => `  class ${node.id} ${[...new Set(node.classes)].join(',')};`);
  return [`flowchart ${direction}`, ...declarations, ...edges, ...styles, ...decorated].join('\n');
}
