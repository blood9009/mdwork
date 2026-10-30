import type { InlineNode, ReferenceMap } from './ast';
import { inlineText } from './ast';
import { parseImageLabel } from './imageLayout';

type Delimiter = {
  type: 'delimiter';
  marker: '*' | '_' | '~';
  length: number;
  canOpen: boolean;
  canClose: boolean;
};
type WorkingNode = InlineNode | Delimiter;

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–',
};

function decodeEntity(entity: string): string | null {
  const match = /^&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([A-Za-z][A-Za-z\d]{1,31}));/.exec(entity);
  if (!match) return null;
  if (match[3]) return entities[match[3]] ?? null;
  const codePoint = Number.parseInt(match[1] ?? match[2], match[1] ? 10 : 16);
  if (!Number.isFinite(codePoint) || codePoint === 0 || codePoint > 0x10ffff) return '�';
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '�';
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{1,31});/g,
    (entity) => decodeEntity(entity) ?? entity);
}

function unescapeMarkdown(value: string): string {
  return decodeEntities(value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1'));
}

function pushText(nodes: WorkingNode[], value: string): void {
  if (!value) return;
  const previous = nodes[nodes.length - 1];
  if (previous?.type === 'text') previous.value += value;
  else nodes.push({ type: 'text', value });
}

function isWhitespace(character: string): boolean {
  return character === '' || /\s/u.test(character);
}

function isPunctuation(character: string): boolean {
  return character !== '' && /[\p{P}\p{S}]/u.test(character);
}

function delimiterFlanking(source: string, start: number, end: number, marker: string) {
  const previous = start > 0 ? source[start - 1] : '';
  const next = source[end] ?? '';
  const leftFlanking = !isWhitespace(next)
    && (!isPunctuation(next) || isWhitespace(previous) || isPunctuation(previous));
  const rightFlanking = !isWhitespace(previous)
    && (!isPunctuation(previous) || isWhitespace(next) || isPunctuation(next));
  if (marker === '_') {
    return {
      canOpen: leftFlanking && (!rightFlanking || isPunctuation(previous)),
      canClose: rightFlanking && (!leftFlanking || isPunctuation(next)),
    };
  }
  return { canOpen: leftFlanking, canClose: rightFlanking };
}

function isDelimiter(node: WorkingNode | undefined): node is Delimiter {
  return node?.type === 'delimiter';
}

function resolveDelimiters(nodes: WorkingNode[]): void {
  let closerIndex = 0;
  while (closerIndex < nodes.length) {
    const closer = nodes[closerIndex];
    if (!isDelimiter(closer) || !closer.canClose || closer.length === 0
      || (closer.marker === '~' && closer.length < 2)) {
      closerIndex += 1;
      continue;
    }

    let openerIndex = -1;
    for (let index = closerIndex - 1; index >= 0; index -= 1) {
      const candidate = nodes[index];
      if (!isDelimiter(candidate) || !candidate.canOpen || candidate.marker !== closer.marker
        || candidate.length === 0 || (candidate.marker === '~' && candidate.length < 2)) continue;
      const ruleOfThree = (closer.canOpen || candidate.canClose)
        && (candidate.length + closer.length) % 3 === 0
        && (candidate.length % 3 !== 0 || closer.length % 3 !== 0);
      if (!ruleOfThree) {
        openerIndex = index;
        break;
      }
    }
    if (openerIndex < 0) {
      closerIndex += 1;
      continue;
    }

    const opener = nodes[openerIndex] as Delimiter;
    const amount = closer.marker === '~' ? 2
      : opener.length >= 2 && closer.length >= 2 ? 2 : 1;
    const type = closer.marker === '~' ? 'strikethrough' : amount === 2 ? 'strong' : 'emphasis';
    const inner = nodes.slice(openerIndex + 1, closerIndex);
    const wrapper = { type, children: inner as InlineNode[] } as InlineNode;
    opener.length -= amount;
    closer.length -= amount;
    nodes.splice(openerIndex + 1, closerIndex - openerIndex - 1, wrapper);
    const closerPosition = openerIndex + 2;
    if (closer.length === 0) nodes.splice(closerPosition, 1);
    if (opener.length === 0) nodes.splice(openerIndex, 1);
    closerIndex = opener.length === 0 ? openerIndex + 1 : openerIndex + 2;
  }
}

function materialize(nodes: WorkingNode[]): InlineNode[] {
  return nodes.map((node): InlineNode => {
    if (isDelimiter(node)) return { type: 'text', value: node.marker.repeat(node.length) };
    if ('children' in node) {
      return { ...node, children: materialize(node.children as WorkingNode[]) };
    }
    return node;
  });
}

function findClosingBracket(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === '[') depth += 1;
    else if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findClosingParenthesis(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseDestination(body: string): { href: string; title?: string } | null {
  const input = body.trim();
  if (!input) return { href: '' };
  let destination = '';
  let rest = '';
  if (input.startsWith('<')) {
    const end = input.indexOf('>');
    if (end < 0) return null;
    destination = input.slice(1, end);
    rest = input.slice(end + 1).trim();
  } else {
    let depth = 0;
    let end = 0;
    for (; end < input.length; end += 1) {
      const character = input[end];
      if (character === '\\') end += 1;
      else if (/\s/.test(character) && depth === 0) break;
      else if (character === '(') depth += 1;
      else if (character === ')') {
        if (depth === 0) return null;
        depth -= 1;
      }
    }
    if (depth !== 0) return null;
    destination = input.slice(0, end);
    rest = input.slice(end).trim();
  }

  let title: string | undefined;
  if (rest) {
    const opening = rest[0];
    const closing = opening === '(' ? ')' : opening;
    if (!['"', "'", '('].includes(opening) || rest[rest.length - 1] !== closing) return null;
    title = unescapeMarkdown(rest.slice(1, -1));
  }
  return { href: unescapeMarkdown(destination), title };
}

export function normalizeReference(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function trimAutomaticUrl(value: string): string {
  let result = value;
  while (/[.,!?;:，。！？；：]$/.test(result)) result = result.slice(0, -1);
  while (result.endsWith(')')) {
    const opening = (result.match(/\(/g) ?? []).length;
    const closing = (result.match(/\)/g) ?? []).length;
    if (closing <= opening) break;
    result = result.slice(0, -1);
  }
  return result;
}

export function parseInline(source: string, references: ReferenceMap = new Map()): InlineNode[] {
  const nodes: WorkingNode[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === '\\') {
      if (source[index + 1] === '\n') {
        nodes.push({ type: 'hardBreak' });
        index += 2;
      } else if (source[index + 1] && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(source[index + 1])) {
        pushText(nodes, source[index + 1]);
        index += 2;
      } else {
        pushText(nodes, character);
        index += 1;
      }
      continue;
    }

    if (character === '&') {
      const decoded = decodeEntity(source.slice(index));
      if (decoded) {
        const entity = /^&[^;]+;/.exec(source.slice(index))?.[0];
        pushText(nodes, decoded);
        index += entity?.length ?? 1;
        continue;
      }
    }

    if (character === '`') {
      let runLength = 1;
      while (source[index + runLength] === '`') runLength += 1;
      const marker = '`'.repeat(runLength);
      const closing = source.indexOf(marker, index + runLength);
      if (closing >= 0) {
        let value = source.slice(index + runLength, closing).replace(/\n/g, ' ');
        if (/^ .* $/.test(value) && /[^ ]/.test(value)) value = value.slice(1, -1);
        nodes.push({ type: 'code', value });
        index = closing + runLength;
        continue;
      }
    }

    if (character === '!' && source[index + 1] === '[' || character === '[') {
      const image = character === '!';
      const bracketStart = image ? index + 1 : index;
      const labelEnd = findClosingBracket(source, bracketStart);
      if (labelEnd >= 0) {
        const label = source.slice(bracketStart + 1, labelEnd);
        let destination: { href: string; title?: string } | null = null;
        let end = labelEnd + 1;
        if (source[end] === '(') {
          const destinationEnd = findClosingParenthesis(source, end);
          if (destinationEnd >= 0) {
            destination = parseDestination(source.slice(end + 1, destinationEnd));
            if (destination) end = destinationEnd + 1;
          }
        } else {
          let referenceLabel = label;
          if (source[end] === '[') {
            const referenceEnd = source.indexOf(']', end + 1);
            if (referenceEnd >= 0) {
              referenceLabel = source.slice(end + 1, referenceEnd) || label;
              const reference = references.get(normalizeReference(referenceLabel));
              if (reference) {
                destination = reference;
                end = referenceEnd + 1;
              }
            }
          } else {
            destination = references.get(normalizeReference(referenceLabel)) ?? null;
          }
        }

        if (destination) {
          if (image) {
            const imageLabel = parseImageLabel(label);
            nodes.push({
              type: 'image', src: destination.href, title: destination.title,
              alt: inlineText(parseInline(imageLabel.label, references)),
              layout: imageLabel.layout, width: imageLabel.width,
            });
          } else {
            nodes.push({
              type: 'link', href: destination.href, title: destination.title,
              children: parseInline(label, references),
            });
          }
          index = end;
          continue;
        }
      }
    }

    if (character === '<') {
      const remainder = source.slice(index);
      const automatic = /^<((?:https?|mailto):[^ <>]+)>/i.exec(remainder);
      const email = /^<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/.exec(remainder);
      if (automatic || email) {
        const value = (automatic ?? email)![1];
        const href = email ? `mailto:${value}` : value;
        nodes.push({ type: 'link', href, children: [{ type: 'text', value }] });
        index += (automatic ?? email)![0].length;
        continue;
      }
      const html = /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>)/.exec(remainder);
      if (html) {
        nodes.push({ type: 'html', value: html[0] });
        index += html[0].length;
        continue;
      }
    }

    if ((source.startsWith('http://', index) || source.startsWith('https://', index)
      || source.startsWith('www.', index)) && (index === 0 || /[\s([{'"“‘]/.test(source[index - 1]))) {
      const remainder = source.slice(index);
      const candidate = /^[^\s<]+/.exec(remainder)?.[0] ?? '';
      const value = trimAutomaticUrl(candidate);
      if (value) {
        nodes.push({
          type: 'link', href: value.startsWith('www.') ? `http://${value}` : value,
          children: [{ type: 'text', value }],
        });
        index += value.length;
        continue;
      }
    }

    if (character === '*' || character === '_' || character === '~') {
      let runLength = 1;
      while (source[index + runLength] === character) runLength += 1;
      if (character !== '~' || runLength >= 2) {
        const flanking = delimiterFlanking(source, index, index + runLength, character);
        nodes.push({ type: 'delimiter', marker: character, length: runLength, ...flanking });
        index += runLength;
        continue;
      }
    }

    if (character === '\n') {
      let hardBreak = false;
      const previous = nodes[nodes.length - 1];
      if (previous?.type === 'text') {
        const spaces = / +$/.exec(previous.value)?.[0].length ?? 0;
        if (spaces > 0) previous.value = previous.value.trimEnd();
        hardBreak = spaces >= 2;
      }
      nodes.push({ type: hardBreak ? 'hardBreak' : 'softBreak' });
      index += 1;
      continue;
    }

    pushText(nodes, character);
    index += 1;
  }

  resolveDelimiters(nodes);
  return materialize(nodes);
}
