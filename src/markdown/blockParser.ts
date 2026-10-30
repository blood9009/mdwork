import type {
  BlockNode,
  DocumentNode,
  ListBlock,
  ListItemBlock,
  ReferenceMap,
  SourceLine,
  TableAlignment,
} from './ast';
import { normalizeReference, parseInline } from './inlineParser';

type ListMarker = {
  indent: number;
  marker: string;
  ordered: boolean;
  start: number;
  content: string;
  contentIndent: number;
};

const blankLine = /^[ \t]*$/;
const fencePattern = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/;
const headingPattern = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/;
const compactHeadingPattern = /^ {0,3}(#{1,6})(?:([0-9]+)|([A-Za-z])|(\*))[ \t]*$/;
const quotePattern = /^ {0,3}> ?(.*)$/;
const imageClearPattern = /^ {0,3}::clear[ \t]*$/i;
const referencePattern = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]+)>|(\S+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;

function matchListMarker(text: string): ListMarker | null {
  const match = /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/.exec(text);
  if (!match) return null;
  const marker = match[2];
  const spacing = match[3] ?? ' ';
  return {
    indent: match[1].length,
    marker,
    ordered: /^\d/.test(marker),
    start: /^\d/.test(marker) ? Number.parseInt(marker, 10) : 1,
    content: match[4] ?? '',
    contentIndent: match[1].length + marker.length + Math.min(spacing.length, 4),
  };
}

function isThematicBreak(text: string): boolean {
  return /^ {0,3}(?:\*[ \t]*){3,}$/.test(text)
    || /^ {0,3}(?:_[ \t]*){3,}$/.test(text)
    || /^ {0,3}(?:-[ \t]*){3,}$/.test(text);
}

function isHtmlBlockStart(text: string): boolean {
  return /^ {0,3}<(?:!--|\?|!\[CDATA\[|![A-Za-z]|\/?[A-Za-z][A-Za-z\d-]*(?:\s|\/?>))/.test(text);
}

function isBlockStart(text: string): boolean {
  return blankLine.test(text) || fencePattern.test(text) || headingPattern.test(text)
    || compactHeadingPattern.test(text) || quotePattern.test(text) || isThematicBreak(text) || isHtmlBlockStart(text)
    || imageClearPattern.test(text)
    || matchListMarker(text) !== null || /^ {4}/.test(text);
}

function leadingSpaces(text: string): number {
  return /^ */.exec(text)?.[0].length ?? 0;
}

function sameListKind(left: ListMarker, right: ListMarker): boolean {
  if (left.ordered !== right.ordered) return false;
  if (left.ordered) return left.marker.slice(-1) === right.marker.slice(-1);
  return left.marker === right.marker;
}

function collectReferences(lines: SourceLine[], references: ReferenceMap): void {
  for (const line of lines) {
    const match = referencePattern.exec(line.text);
    if (!match) continue;
    references.set(normalizeReference(match[1]), {
      href: match[2] ?? match[3],
      title: match[4] ?? match[5] ?? match[6],
    });
  }
}

function splitTableRow(text: string): string[] {
  const cells: string[] = [];
  let value = '';
  let codeMarker = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\\' && index + 1 < text.length) {
      value += character + text[index + 1];
      index += 1;
      continue;
    }
    if (character === '`') {
      let length = 1;
      while (text[index + length] === '`') length += 1;
      const marker = '`'.repeat(length);
      value += marker;
      codeMarker = codeMarker === marker ? '' : codeMarker || marker;
      index += length - 1;
      continue;
    }
    if (character === '|' && !codeMarker) {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  if (/^\s*\|/.test(text)) cells.shift();
  if (/\|\s*$/.test(text) && !/\\\|\s*$/.test(text)) cells.pop();
  return cells;
}

function tableAlignments(text: string): TableAlignment[] | null {
  const cells = splitTableRow(text);
  if (cells.length === 0) return null;
  const valid = cells.every((cell) => /^:?-{1,}:?$/.test(cell));
  if (!valid) return null;
  return cells.map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
  });
}

function parseList(
  lines: SourceLine[],
  startIndex: number,
  references: ReferenceMap,
): { node: ListBlock; next: number } {
  const firstMarker = matchListMarker(lines[startIndex].text)!;
  const items: ListItemBlock[] = [];
  let index = startIndex;
  let loose = false;

  while (index < lines.length) {
    const marker = matchListMarker(lines[index].text);
    if (!marker || marker.indent !== firstMarker.indent || !sameListKind(marker, firstMarker)) break;
    const itemLine = lines[index].line;
    const itemLines: SourceLine[] = [{ text: marker.content, line: itemLine }];
    index += 1;
    let sawBlank = false;

    while (index < lines.length) {
      const line = lines[index];
      const nextMarker = matchListMarker(line.text);
      if (nextMarker && nextMarker.indent === firstMarker.indent) break;
      if (blankLine.test(line.text)) {
        itemLines.push({ text: '', line: line.line });
        sawBlank = true;
        index += 1;
        continue;
      }
      const indentation = leadingSpaces(line.text);
      if (indentation >= marker.contentIndent) {
        itemLines.push({ text: line.text.slice(marker.contentIndent), line: line.line });
        index += 1;
        continue;
      }
      if (!sawBlank && !isBlockStart(line.text)) {
        itemLines.push({ text: line.text.trimStart(), line: line.line });
        index += 1;
        continue;
      }
      break;
    }

    while (itemLines.length > 0 && blankLine.test(itemLines[itemLines.length - 1].text)) itemLines.pop();
    const nextMarker = index < lines.length ? matchListMarker(lines[index].text) : null;
    const followedBySibling = Boolean(nextMarker && nextMarker.indent === firstMarker.indent
      && sameListKind(nextMarker, firstMarker));
    loose ||= itemLines.some((item) => blankLine.test(item.text)) || (sawBlank && followedBySibling);
    let checked: boolean | null = null;
    if (itemLines.length > 0) {
      const task = /^\[([ xX])\](?:\s+|$)/.exec(itemLines[0].text);
      if (task) {
        checked = task[1].toLowerCase() === 'x';
        itemLines[0] = {
          ...itemLines[0],
          text: itemLines[0].text.slice(task[0].length),
        };
      }
    }
    items.push({ type: 'listItem', line: itemLine, checked, children: parseBlocks(itemLines, references) });
    if (index < lines.length && blankLine.test(lines[index].text)) index += 1;
  }

  return {
    node: {
      type: 'list', line: lines[startIndex].line, ordered: firstMarker.ordered,
      start: firstMarker.start, tight: !loose, items,
    },
    next: index,
  };
}

function parseBlocks(lines: SourceLine[], references: ReferenceMap): BlockNode[] {
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (blankLine.test(line.text) || referencePattern.test(line.text)) {
      index += 1;
      continue;
    }

    const fence = fencePattern.exec(line.text);
    if (fence) {
      const marker = fence[2];
      const info = fence[3].trim();
      const [language = '', ...metaParts] = info.split(/\s+/);
      const meta = metaParts.join(' ');
      const content: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const closing = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);
        if (closing.test(lines[cursor].text)) break;
        const text = lines[cursor].text;
        const removable = Math.min(fence[1].length, leadingSpaces(text));
        content.push(text.slice(removable));
        cursor += 1;
      }
      blocks.push({
        type: 'codeBlock', line: line.line, language, meta,
        value: content.length ? `${content.join('\n')}\n` : '',
      });
      index = cursor < lines.length ? cursor + 1 : cursor;
      continue;
    }

    if (imageClearPattern.test(line.text)) {
      blocks.push({ type: 'imageClear', line: line.line });
      index += 1;
      continue;
    }

    const compactHeading = compactHeadingPattern.exec(line.text);
    if (compactHeading) {
      const value = compactHeading[2] ?? compactHeading[3] ?? '•';
      blocks.push({
        type: 'heading', line: line.line, level: compactHeading[1].length,
        compact: true,
        numbering: compactHeading[2] !== undefined ? 'decimal'
          : compactHeading[3] !== undefined
            ? compactHeading[3] === compactHeading[3].toUpperCase() ? 'upper-alpha' : 'lower-alpha'
            : undefined,
        children: parseInline(value, references),
      });
      index += 1;
      continue;
    }

    const heading = headingPattern.exec(line.text);
    if (heading) {
      const value = (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '');
      blocks.push({
        type: 'heading', line: line.line, level: heading[1].length,
        children: parseInline(value, references),
      });
      index += 1;
      continue;
    }

    if (isThematicBreak(line.text)) {
      blocks.push({ type: 'thematicBreak', line: line.line });
      index += 1;
      continue;
    }

    if (quotePattern.test(line.text)) {
      const content: SourceLine[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const quote = quotePattern.exec(lines[cursor].text);
        if (!quote) break;
        content.push({ text: quote[1], line: lines[cursor].line });
        cursor += 1;
      }
      blocks.push({ type: 'blockquote', line: line.line, children: parseBlocks(content, references) });
      index = cursor;
      continue;
    }

    if (matchListMarker(line.text)) {
      const list = parseList(lines, index, references);
      blocks.push(list.node);
      index = list.next;
      continue;
    }

    if (/^ {4}/.test(line.text)) {
      const content: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        if (/^ {4}/.test(lines[cursor].text)) content.push(lines[cursor].text.slice(4));
        else if (blankLine.test(lines[cursor].text)) content.push('');
        else break;
        cursor += 1;
      }
      while (content.length > 0 && content[content.length - 1] === '') content.pop();
      blocks.push({ type: 'codeBlock', line: line.line, language: '', meta: '', value: `${content.join('\n')}\n` });
      index = cursor;
      continue;
    }

    if (index + 1 < lines.length && line.text.includes('|')) {
      const align = tableAlignments(lines[index + 1].text);
      const header = splitTableRow(line.text);
      if (align && align.length === header.length) {
        const rows: string[][] = [];
        let cursor = index + 2;
        while (cursor < lines.length && !blankLine.test(lines[cursor].text)
          && lines[cursor].text.includes('|')) {
          const cells = splitTableRow(lines[cursor].text);
          while (cells.length < align.length) cells.push('');
          rows.push(cells.slice(0, align.length));
          cursor += 1;
        }
        blocks.push({
          type: 'table', line: line.line, align,
          header: header.map((cell) => parseInline(cell, references)),
          rows: rows.map((row) => row.map((cell) => parseInline(cell, references))),
        });
        index = cursor;
        continue;
      }
    }

    if (index + 1 < lines.length && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[index + 1].text)
      && !isBlockStart(line.text)) {
      blocks.push({
        type: 'heading', line: line.line, level: lines[index + 1].text.trim()[0] === '=' ? 1 : 2,
        children: parseInline(line.text.trim(), references),
      });
      index += 2;
      continue;
    }

    if (isHtmlBlockStart(line.text)) {
      const content = [line.text];
      let cursor = index + 1;
      while (cursor < lines.length && !blankLine.test(lines[cursor].text)) {
        content.push(lines[cursor].text);
        cursor += 1;
      }
      blocks.push({ type: 'htmlBlock', line: line.line, value: content.join('\n') });
      index = cursor;
      continue;
    }

    const paragraph = [line.text.trimStart()];
    let cursor = index + 1;
    while (cursor < lines.length && !blankLine.test(lines[cursor].text)
      && !isBlockStart(lines[cursor].text)) {
      if (cursor + 1 < lines.length && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[cursor + 1].text)) break;
      paragraph.push(lines[cursor].text.trimStart());
      cursor += 1;
    }
    blocks.push({
      type: 'paragraph', line: line.line,
      children: parseInline(paragraph.join('\n'), references),
    });
    index = cursor;
  }

  return blocks;
}

export function parseDocument(source: string): { document: DocumentNode; references: ReferenceMap } {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines: SourceLine[] = normalized.split('\n').map((text, index) => ({ text, line: index + 1 }));
  const references: ReferenceMap = new Map();
  collectReferences(lines, references);
  return { document: { type: 'document', children: parseBlocks(lines, references) }, references };
}
