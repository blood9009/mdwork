import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import type { PdfImportMode } from '../../shared/contracts';
import type { PdfConversionResult } from '../import/pdfToMarkdown';

interface PdfImportDialogProps {
  sourcePath: string;
  data: ArrayBuffer;
  onConfirm: (result: PdfConversionResult) => Promise<boolean>;
  onClose: () => void;
}

const modeDescriptions: Record<PdfImportMode, string> = {
  editable: '提取正文、简单表格和图片，便于继续修改',
  layout: '每页保存为高清图片，完整保留视觉版式',
  hybrid: '正文可编辑，复杂或无文字页面附原页图',
};

export function PdfImportDialog({ sourcePath, data, onConfirm, onClose }: PdfImportDialogProps) {
  const [mode, setMode] = useState<PdfImportMode>('editable');
  const [removeHeaders, setRemoveHeaders] = useState(true);
  const [result, setResult] = useState<PdfConversionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sourceName = sourcePath.split(/[\\/]/).pop() ?? sourcePath;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setResult(null);
    setError('');
    const timer = window.setTimeout(() => {
      void import('../import/pdfToMarkdown')
        .then(({ convertPdfDocument }) => convertPdfDocument(data, {
          mode,
          removeHeaders,
          includePreview: true,
        }))
        .then((converted) => { if (active) setResult(converted); })
        .catch((reason) => {
          if (active) setError(reason instanceof Error ? reason.message : 'PDF 转换失败。');
        })
        .finally(() => { if (active) setLoading(false); });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [data, mode, removeHeaders]);

  const previewUrl = useMemo(() => {
    if (!result?.preview) return null;
    const source = result.preview.data;
    const bytes = source instanceof ArrayBuffer ? source.slice(0) : new Uint8Array(source).slice().buffer;
    return URL.createObjectURL(new Blob([bytes], { type: result.preview.contentType }));
  }, [result]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <Modal title="导入 PDF" className="pdf-import-modal" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (!result || loading || saving) return;
        setSaving(true);
        try {
          if (await onConfirm(result)) onClose();
        } finally {
          setSaving(false);
        }
      }}>
        <div className="modal-body settings-form">
          <p className="form-hint pdf-source-name" title={sourcePath}>{sourceName}</p>
          <fieldset className="pdf-import-modes">
            <legend>导入方式</legend>
            {(Object.keys(modeDescriptions) as PdfImportMode[]).map((value) => (
              <label key={value} className={mode === value ? 'selected' : ''}>
                <input type="radio" name="pdf-import-mode" value={value} checked={mode === value}
                  onChange={() => setMode(value)} disabled={saving} />
                <strong>{value === 'editable' ? '可编辑 Markdown' : value === 'layout' ? '保留原版式' : '混合模式'}</strong>
                <span>{modeDescriptions[value]}</span>
              </label>
            ))}
          </fieldset>
          <label className="check-label">
            <input type="checkbox" checked={removeHeaders} disabled={mode === 'layout' || saving || Boolean(result?.recoveredSource)}
              onChange={(event) => setRemoveHeaders(event.target.checked)} />
            移除多页重复的页眉、页脚和页码
          </label>
          {result?.recoveredSource && <p className="pdf-source-recovered">
            检测到 MDWork 源文件，将直接恢复原始 Markdown，不需要推测 PDF 排版。
          </p>}
          <div className="pdf-import-preview">
            <section>
              <h3>原 PDF 首页</h3>
              <div className="pdf-original-preview">
                {previewUrl && !loading
                  ? <img src={previewUrl} alt="原 PDF 首页预览" />
                  : <span>{loading ? '正在本地分析 PDF…' : '暂无页面预览'}</span>}
              </div>
            </section>
            <section>
              <h3>Markdown 预览</h3>
              <textarea aria-label="转换后的 Markdown 预览" readOnly
                value={loading ? '正在转换，请稍候…' : result?.markdown ?? ''}
                placeholder="转换结果将在这里显示" />
            </section>
          </div>
          {result && !loading && <div className="pdf-import-report">
            <span>{result.pageCount} 页</span>
            <span>{result.markdown.length.toLocaleString()} 字符</span>
            <span>{result.images.length} 张页面 / 图片</span>
          </div>}
          {result && result.warnings.length > 0 && <ul className="pdf-import-warnings">
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="form-hint">所有转换均在本机完成。复杂表格和扫描件请核对预览；当前不会自动执行 OCR。</p>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="primary-button" disabled={!result || loading || saving || Boolean(error)}>
            {saving ? '正在保存…' : loading ? '正在分析…' : '选择位置并导入'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
