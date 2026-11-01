import { describe, expect, it } from 'vitest';
import { createFormatEdit, type EditorFormatCommand } from '../src/editor/formatting';

function format(source: string, start: number, end: number, command: EditorFormatCommand) {
  const edit = createFormatEdit(source, { start, end }, command);
  return {
    value: source.slice(0, edit.start) + edit.text + source.slice(edit.end),
    selection: edit.text.slice(edit.selectionStart - edit.start, edit.selectionEnd - edit.start),
  };
}

describe('Markdown formatting commands', () => {
  it('wraps and unwraps selected bold text without losing the selection', () => {
    const bold = format('hello world', 6, 11, { type: 'inline', format: 'bold' });
    expect(bold.value).toBe('hello **world**');
    expect(bold.selection).toBe('world');
    expect(format(bold.value, 8, 13, { type: 'inline', format: 'bold' }).value).toBe('hello world');
  });

  it('inserts a selected placeholder for italic, underline and inline code', () => {
    expect(format('', 0, 0, { type: 'inline', format: 'italic' })).toEqual({ value: '*斜体文本*', selection: '斜体文本' });
    expect(format('', 0, 0, { type: 'inline', format: 'underline' }).value).toBe('<u>下划线文本</u>');
    expect(format('const', 0, 5, { type: 'inline', format: 'code' }).value).toBe('`const`');
  });

  it('uses safe inline HTML for font, size and color', () => {
    expect(format('文字', 0, 2, { type: 'textStyle', property: 'fontFamily', value: 'PingFang SC' }).value)
      .toBe('<span style="font-family: PingFang SC">文字</span>');
    expect(format('文字', 0, 2, { type: 'textStyle', property: 'fontSize', value: '18' }).value)
      .toBe('<span style="font-size: 18pt">文字</span>');
    expect(format('文字', 0, 2, { type: 'textStyle', property: 'color', value: '#c2272d' }).value)
      .toBe('<span style="color: #c2272d">文字</span>');
    expect(format('x', 0, 1, { type: 'textStyle', property: 'fontFamily', value: 'bad\" onclick="x' }).value)
      .not.toContain('onclick="x');
  });

  it('inserts a block marker on an empty line and leaves the cursor after it', () => {
    expect(format('', 0, 0, { type: 'heading', level: 1 })).toEqual({ value: '# ', selection: '' });
    expect(format('', 0, 0, { type: 'list', kind: 'bullet' })).toEqual({ value: '- ', selection: '' });
    expect(format('', 0, 0, { type: 'list', kind: 'ordered' })).toEqual({ value: '1. ', selection: '' });
    expect(format('', 0, 0, { type: 'list', kind: 'task' })).toEqual({ value: '- [ ] ', selection: '' });
    expect(format('', 0, 0, { type: 'blockquote' })).toEqual({ value: '> ', selection: '' });
  });

  it('formats every selected line as headings, lists or quotes', () => {
    expect(format('one\ntwo', 1, 7, { type: 'heading', level: 2 }).value).toBe('## one\n## two');
    expect(format('## one\n## two', 1, 13, { type: 'heading', level: 0 }).value).toBe('one\ntwo');
    expect(format('one\ntwo', 0, 7, { type: 'list', kind: 'ordered' }).value).toBe('1. one\n2. two');
    expect(format('one\n\ntwo', 0, 8, { type: 'list', kind: 'ordered' }).value).toBe('1. one\n\n2. two');
    expect(format('one\ntwo', 0, 7, { type: 'list', kind: 'task' }).value).toBe('- [ ] one\n- [ ] two');
    expect(format('old\n2. two', 0, 9, { type: 'list', kind: 'bullet' }).value).toBe('- old\n- two');
    expect(format('one\ntwo', 0, 7, { type: 'blockquote' }).value).toBe('> one\n> two');
    expect(format('> one\n> two', 0, 11, { type: 'blockquote' }).value).toBe('one\ntwo');
  });

  it('inserts block-level code, tables and thematic breaks on clean boundaries', () => {
    expect(format('before', 6, 6, { type: 'codeBlock' }).value).toBe('before\n\n```\n代码\n```\n');
    expect(format('', 0, 0, { type: 'table' }).value)
      .toBe('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n');
    expect(format('before', 6, 6, { type: 'thematicBreak' }).value).toBe('before\n\n---\n');
  });
});
