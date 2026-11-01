import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ExportFormat, PdfOptions, PdfOrientation, PdfPageSize, PdfTheme } from '../../shared/contracts';
import type { AppSettings } from '../settings';

interface ExportDialogProps {
  settings: AppSettings;
  exporting: boolean;
  initialFormat: ExportFormat;
  onExport: (format: ExportFormat, options: PdfOptions) => Promise<boolean>;
  onClose: () => void;
}

function initialOptions(settings: AppSettings): PdfOptions {
  return {
    theme: 'default',
    pageSize: 'A4',
    orientation: 'portrait',
    fontFamily: settings.previewFont,
    codeFontFamily: settings.codeFont,
    fontSize: 11,
    lineHeight: 1.7,
    margin: 20,
    showPageNumbers: true,
    showToc: false,
    printBackground: true,
  };
}

export function ExportDialog({ settings, exporting, initialFormat, onExport, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [options, setOptions] = useState(() => initialOptions(settings));

  useEffect(() => {
    setOptions(initialOptions(settings));
  }, [settings.previewFont, settings.codeFont]);

  function patch<K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal title={`导出 ${format === 'docx' ? 'DOCX' : 'PDF'}`} onClose={onClose}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (await onExport(format, options)) onClose();
      }}>
        <div className="modal-body settings-form">
          <label>
            <span>导出格式</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              <option value="pdf">PDF（固定页面排版）</option>
              <option value="docx">DOCX（可用 Word/WPS 继续编辑）</option>
            </select>
          </label>
          <div className="form-row">
            {format === 'pdf' && <label>
              <span>样式主题</span>
              <select value={options.theme} onChange={(event) => patch('theme', event.target.value as PdfTheme)}>
                <option value="default">默认</option>
                <option value="clean">简洁</option>
                <option value="academic">论文</option>
                <option value="technical">技术文档</option>
              </select>
            </label>}
            <label>
              <span>纸张大小</span>
              <select value={options.pageSize} onChange={(event) => patch('pageSize', event.target.value as PdfPageSize)}>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>页面方向</span>
              <select value={options.orientation} onChange={(event) => patch('orientation', event.target.value as PdfOrientation)}>
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </label>
            <label>
              <span>页边距（毫米）</span>
              <input type="number" min="8" max="40" value={options.margin}
                onChange={(event) => patch('margin', Number(event.target.value))} />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>正文字号（pt）</span>
              <input type="number" min="8" max="24" value={options.fontSize}
                onChange={(event) => patch('fontSize', Number(event.target.value))} />
            </label>
            <label>
              <span>正文行高</span>
              <input type="number" min="1.1" max="2.5" step="0.1" value={options.lineHeight}
                onChange={(event) => patch('lineHeight', Number(event.target.value))} />
            </label>
          </div>
          <label><span>正文字体</span><input value={options.fontFamily}
            onChange={(event) => patch('fontFamily', event.target.value)} /></label>
          <label><span>代码字体</span><input value={options.codeFontFamily}
            onChange={(event) => patch('codeFontFamily', event.target.value)} /></label>
          <label className="check-label"><input type="checkbox" checked={options.showPageNumbers}
            onChange={(event) => patch('showPageNumbers', event.target.checked)} />显示页码</label>
          <label className="check-label"><input type="checkbox" checked={options.showToc}
            onChange={(event) => patch('showToc', event.target.checked)} />在正文前生成目录</label>
          <label className="check-label"><input type="checkbox" checked={options.printBackground}
            onChange={(event) => patch('printBackground', event.target.checked)} />保留代码块和表格背景色</label>
          {format === 'docx' && <p className="form-hint">
            保留标题、列表、表格、链接、代码、文字样式和可读取的图片；Mermaid 以静态图片嵌入。目录页码可在 Word/WPS 中更新。
          </p>}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose} disabled={exporting}>取消</button>
          <button type="submit" className="primary-button" disabled={exporting}>
            {exporting ? '正在导出…' : '选择位置并导出'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
