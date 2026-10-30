import { forwardRef, useEffect, useState } from 'react';
import type { monaco } from '../editor/monaco';
import type { AppSettings } from '../settings';
import type { WorkspaceDocument } from '../workspace/workspace';
import type { ViewMode } from './WorkspaceGroup';
import { MarkdownPreview, type PreviewHandle } from './MarkdownPreview';
import { sanitizeMarkdown } from '../markdown/sanitizeMarkdown';
import { renderMermaidDiagrams } from '../markdown/renderMermaidDiagrams';
import { renderMarkdownInWorker } from '../markdown/previewWorkerClient';

export const LARGE_FILE_CHARACTER_THRESHOLD = 1_000_000;

interface DocumentPreviewProps {
  document: WorkspaceDocument;
  model: monaco.editor.ITextModel;
  settings: AppSettings;
  viewMode: ViewMode;
  active: boolean;
  onNavigateLine: (line: number) => void;
  onNotify: (message: string) => void;
}

export const DocumentPreview = forwardRef<PreviewHandle, DocumentPreviewProps>(
  function DocumentPreview({ document, model, settings, viewMode, active, onNavigateLine, onNotify }, forwardedRef) {
    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(false);
    const [renderedRevision, setRenderedRevision] = useState(-1);
    const [manualRevision, setManualRevision] = useState<number | null>(null);
    const largeFile = document.characterCount >= LARGE_FILE_CHARACTER_THRESHOLD;
    const paused = largeFile && renderedRevision !== document.revision && manualRevision !== document.revision;

    useEffect(() => {
      if (viewMode === 'edit' || !active || largeFile && manualRevision !== document.revision) return;
      let current = true;
      const revision = document.revision;
      const timer = setTimeout(() => {
        setLoading(true);
        const snapshot = model.getValue();
        void renderMarkdownInWorker(snapshot).then(async (rendered) => {
          if (!current) return;
          const sanitized = sanitizeMarkdown(rendered.html, document.path);
          setHtml(sanitized);
          setRenderedRevision(revision);
          const withDiagrams = await renderMermaidDiagrams(sanitized, settings.theme);
          if (current) setHtml(withDiagrams);
        }).catch((error: unknown) => {
          if (current) onNotify(error instanceof Error ? error.message : '预览更新失败');
        }).finally(() => {
          if (current) setLoading(false);
        });
      }, largeFile ? 0 : 250);
      return () => {
        current = false;
        clearTimeout(timer);
      };
    }, [document.id, document.path, document.revision, document.characterCount, largeFile,
      manualRevision, model, settings.theme, viewMode, active, onNotify]);

    const notice = loading ? '正在后台解析并更新预览…'
      : paused ? `大文件实时预览已暂停（${document.characterCount.toLocaleString()} 字符）`
        : renderedRevision !== document.revision && !active ? '激活此分栏后更新预览' : '';

    return <div className="document-preview">
      {notice && <div className="preview-notice">
        <span>{notice}</span>
        {paused && <button onClick={() => setManualRevision(document.revision)}>刷新预览</button>}
      </div>}
      {!html && !loading && paused
        ? <div className="preview-empty">编辑保持流畅；需要检查时手动生成整篇预览。</div>
        : <MarkdownPreview ref={forwardedRef} html={html} settings={settings}
          documentPath={document.path} onNavigateLine={onNavigateLine} onNotify={onNotify} />}
    </div>;
  },
);
