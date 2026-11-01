import { useState, type MouseEvent, type ReactNode } from 'react';
import type { EditorFormatCommand } from '../editor/formatting';

interface FormattingToolbarProps {
  disabled: boolean;
  fonts: string[];
  defaultFont: string;
  onFormat: (command: EditorFormatCommand) => void;
  onInsertUrl: () => void;
}

const shortcutModifier = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl+';

export function FormattingToolbar({
  disabled, fonts, defaultFont, onFormat, onInsertUrl,
}: FormattingToolbarProps) {
  const [fontFamily, setFontFamily] = useState(defaultFont);
  const [fontSize, setFontSize] = useState('12');
  const [color, setColor] = useState('#c2272d');

  function keepSelection(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
  }

  function button(
    label: ReactNode,
    title: string,
    command: EditorFormatCommand,
    className = '',
  ) {
    return <button type="button" className={className} title={title} aria-label={title}
      disabled={disabled} onMouseDown={keepSelection} onClick={() => onFormat(command)}>
      {label}
    </button>;
  }

  return <div className="format-toolbar" aria-label="Markdown 格式工具">
    <div className="format-toolbar-row">
      <div className="format-group" role="group" aria-label="段落格式">
        <span className="format-group-label">段落</span>
        <select aria-label="段落或标题级别" title="将选中文本所在行设置为正文或标题"
          defaultValue="0" disabled={disabled} onChange={(event) => {
            onFormat({ type: 'heading', level: Number(event.target.value) });
          }}>
          <option value="0">正文</option>
          {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>标题 {level}</option>)}
        </select>
        {button('H', '一级标题', { type: 'heading', level: 1 })}
        {button('“”', '引用所选行', { type: 'blockquote' })}
      </div>
      <div className="format-group" role="group" aria-label="字体和字符格式">
        <span className="format-group-label">字体</span>
        <select className="format-font-select" aria-label="选中文字字体" title="设置选中文字字体"
          value={fontFamily} disabled={disabled} onChange={(event) => {
            setFontFamily(event.target.value);
            onFormat({ type: 'textStyle', property: 'fontFamily', value: event.target.value });
          }}>
          {[...new Set([defaultFont, ...fonts])].map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
        <select className="format-size-select" aria-label="选中文字字号" title="设置选中文字字号（pt）"
          value={fontSize} disabled={disabled} onChange={(event) => {
            setFontSize(event.target.value);
            onFormat({ type: 'textStyle', property: 'fontSize', value: event.target.value });
          }}>
          {[10, 12, 14, 16, 18, 20, 24, 28, 32].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        {button(<strong>B</strong>, `粗体（${shortcutModifier}B）`, { type: 'inline', format: 'bold' }, 'format-bold')}
        {button(<em>I</em>, `斜体（${shortcutModifier}I）`, { type: 'inline', format: 'italic' })}
        {button(<u>U</u>, `下划线（${shortcutModifier}U）`, { type: 'inline', format: 'underline' })}
        {button(<del>S</del>, `删除线（${shortcutModifier}Shift+X）`, { type: 'inline', format: 'strikethrough' })}
        {button('</>', '行内代码', { type: 'inline', format: 'code' }, 'format-code')}
        <label className="format-color" title="设置选中文字颜色">
          <span style={{ backgroundColor: color }} aria-hidden="true" />
          <input type="color" value={color} disabled={disabled} aria-label="选中文字颜色"
            onChange={(event) => {
              setColor(event.target.value);
              onFormat({ type: 'textStyle', property: 'color', value: event.target.value });
            }} />
          颜色
        </label>
      </div>
    </div>
    <div className="format-toolbar-row">
      <div className="format-group" role="group" aria-label="列表工具">
        <span className="format-group-label">列表</span>
        {button('• 列表', '无序列表', { type: 'list', kind: 'bullet' })}
        {button('1. 列表', '有序列表', { type: 'list', kind: 'ordered' })}
        {button('☑ 任务', '任务列表', { type: 'list', kind: 'task' })}
      </div>
      <div className="format-group" role="group" aria-label="插入工具">
        <span className="format-group-label">插入</span>
        {button('{ }', '代码块', { type: 'codeBlock' })}
        {button('▦ 表格', '插入三列表格', { type: 'table' })}
        {button('― 分割线', '插入水平分割线', { type: 'thematicBreak' })}
        <button type="button" disabled={disabled} title="插入 URL 图片或链接"
          onMouseDown={keepSelection} onClick={onInsertUrl}>🔗 URL</button>
      </div>
      <span className="format-toolbar-hint">先选中文字再设置格式；悬停按钮可查看快捷键</span>
    </div>
  </div>;
}
