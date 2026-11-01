export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code';
export type TextStyleProperty = 'fontFamily' | 'fontSize' | 'color';

export type EditorFormatCommand =
  | { type: 'inline'; format: InlineFormat }
  | { type: 'textStyle'; property: TextStyleProperty; value: string }
  | { type: 'heading'; level: number }
  | { type: 'list'; kind: 'bullet' | 'ordered' | 'task' }
  | { type: 'blockquote' }
  | { type: 'codeBlock' }
  | { type: 'table' }
  | { type: 'thematicBreak' };

export interface FormatSelection {
  start: number;
  end: number;
}

export interface FormatEdit {
  start: number;
  end: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const inlineFormats: Record<InlineFormat, { before: string; after: string; placeholder: string }> = {
  bold: { before: '**', after: '**', placeholder: '粗体文本' },
  italic: { before: '*', after: '*', placeholder: '斜体文本' },
  underline: { before: '<u>', after: '</u>', placeholder: '下划线文本' },
  strikethrough: { before: '~~', after: '~~', placeholder: '删除线文本' },
  code: { before: '`', after: '`', placeholder: '代码' },
};

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function wrappingEdit(
  source: string,
  selection: FormatSelection,
  before: string,
  after: string,
  placeholder: string,
): FormatEdit {
  const start = Math.max(0, Math.min(selection.start, selection.end));
  const end = Math.max(start, Math.min(source.length, Math.max(selection.start, selection.end)));
  const selected = source.slice(start, end);
  const hasOuterWrapper = source.slice(Math.max(0, start - before.length), start) === before
    && source.slice(end, end + after.length) === after;
  if (hasOuterWrapper) {
    const editStart = start - before.length;
    const editEnd = end + after.length;
    return {
      start: editStart, end: editEnd, text: selected,
      selectionStart: editStart, selectionEnd: editStart + selected.length,
    };
  }
  if (selected.startsWith(before) && selected.endsWith(after)
    && selected.length >= before.length + after.length) {
    const text = selected.slice(before.length, selected.length - after.length);
    return { start, end, text, selectionStart: start, selectionEnd: start + text.length };
  }

  const content = selected || placeholder;
  const text = `${before}${content}${after}`;
  return {
    start, end, text,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + content.length,
  };
}

function selectedLineRange(source: string, selection: FormatSelection) {
  const start = Math.max(0, Math.min(selection.start, selection.end));
  const end = Math.max(start, Math.min(source.length, Math.max(selection.start, selection.end)));
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = source.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = source.length;
  return { lineStart, lineEnd };
}

function lineEdit(
  source: string,
  selection: FormatSelection,
  transform: (lines: string[]) => string[],
): FormatEdit {
  const { lineStart, lineEnd } = selectedLineRange(source, selection);
  const selected = source.slice(lineStart, lineEnd);
  const text = transform(selected.split('\n')).join('\n');
  const insertedMarker = !selected.trim() && !selected.includes('\n') && text.length > 0;
  return {
    start: lineStart, end: lineEnd, text,
    selectionStart: insertedMarker ? lineStart + text.length : lineStart,
    selectionEnd: lineStart + text.length,
  };
}

function styleWrapper(property: TextStyleProperty, value: string): { before: string; after: string } {
  const cssProperty = property === 'fontFamily' ? 'font-family'
    : property === 'fontSize' ? 'font-size' : 'color';
  const normalized = property === 'fontSize' ? `${Number(value)}pt` : value;
  return { before: `<span style="${cssProperty}: ${escapeAttribute(normalized)}">`, after: '</span>' };
}

export function createFormatEdit(
  source: string,
  selection: FormatSelection,
  command: EditorFormatCommand,
): FormatEdit {
  if (command.type === 'inline') {
    const format = inlineFormats[command.format];
    return wrappingEdit(source, selection, format.before, format.after, format.placeholder);
  }
  if (command.type === 'textStyle') {
    const wrapper = styleWrapper(command.property, command.value);
    return wrappingEdit(source, selection, wrapper.before, wrapper.after, '样式文本');
  }
  if (command.type === 'heading') {
    return lineEdit(source, selection, (lines) => lines.map((line) => {
      const content = line.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '');
      if (!content.trim()) {
        if (!line.trim() && lines.length > 1) return content;
        return command.level > 0 ? `${'#'.repeat(command.level)} ` : content;
      }
      return command.level > 0 ? `${'#'.repeat(command.level)} ${content}` : content;
    }));
  }
  if (command.type === 'list') {
    return lineEdit(source, selection, (lines) => {
      let index = 0;
      return lines.map((line) => {
        const content = line.replace(/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:\s+\[[ xX]\])?\s+/, '');
        if (!content.trim() && !line.trim() && lines.length > 1) return content;
        index += 1;
        const marker = command.kind === 'ordered' ? `${index}. ` : command.kind === 'task' ? '- [ ] ' : '- ';
        return `${marker}${content}`;
      });
    });
  }
  if (command.type === 'blockquote') {
    return lineEdit(source, selection, (lines) => {
      const quoted = lines.some((line) => line.trim())
        && lines.every((line) => !line.trim() || /^ {0,3}>/.test(line));
      return lines.map((line) => quoted ? line.replace(/^( {0,3})> ?/, '$1') : `> ${line}`);
    });
  }

  const start = Math.max(0, Math.min(selection.start, selection.end));
  const end = Math.max(start, Math.min(source.length, Math.max(selection.start, selection.end)));
  const selected = source.slice(start, end);
  if (command.type === 'codeBlock') {
    const content = selected || '代码';
    const before = start > 0 && source[start - 1] !== '\n' ? '\n\n' : '';
    const text = `${before}\`\`\`\n${content}\n\`\`\`\n`;
    const selectionStart = start + before.length + 4;
    return { start, end, text, selectionStart, selectionEnd: selectionStart + content.length };
  }
  const content = command.type === 'table'
    ? '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |'
    : '---';
  const before = start > 0 && source[start - 1] !== '\n' ? '\n\n' : '';
  const text = `${before}${content}\n`;
  return {
    start, end, text,
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  };
}

export function applyFormatEdit(
  editor: {
    getModel(): {
      getValue(): string;
      getOffsetAt(position: { lineNumber: number; column: number }): number;
      getPositionAt(offset: number): { lineNumber: number; column: number };
    } | null;
    getSelection(): { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
    executeEdits(source: string, edits: Array<{
      range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
      text: string;
      forceMoveMarkers: boolean;
    }>): void;
    setSelection(range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }): void;
    focus(): void;
  },
  command: EditorFormatCommand,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;
  const start = model.getOffsetAt({ lineNumber: selection.startLineNumber, column: selection.startColumn });
  const end = model.getOffsetAt({ lineNumber: selection.endLineNumber, column: selection.endColumn });
  const edit = createFormatEdit(model.getValue(), { start, end }, command);
  const startPosition = model.getPositionAt(edit.start);
  const endPosition = model.getPositionAt(edit.end);
  editor.executeEdits('markdown-formatting', [{
    range: {
      startLineNumber: startPosition.lineNumber, startColumn: startPosition.column,
      endLineNumber: endPosition.lineNumber, endColumn: endPosition.column,
    },
    text: edit.text,
    forceMoveMarkers: true,
  }]);
  const selectionStart = model.getPositionAt(edit.selectionStart);
  const selectionEnd = model.getPositionAt(edit.selectionEnd);
  editor.setSelection({
    startLineNumber: selectionStart.lineNumber, startColumn: selectionStart.column,
    endLineNumber: selectionEnd.lineNumber, endColumn: selectionEnd.column,
  });
  editor.focus();
}
