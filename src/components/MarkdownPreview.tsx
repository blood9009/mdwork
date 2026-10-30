import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { AppSettings } from '../settings';
import { navigatePreviewFragment, scrollPreviewToLine } from '../markdown/previewNavigation';

export interface PreviewHandle {
  scrollToSourceLine: (line: number) => void;
}

interface MarkdownPreviewProps {
  html: string;
  settings: AppSettings;
  documentPath: string | null;
  onNavigateLine: (line: number) => void;
  onNotify: (message: string) => void;
}

function isLocalDocumentLink(href: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('//')) return false;
  if (/^[a-z]:[\\/]/i.test(href)) return true;
  return !/^[a-z][a-z\d+.-]*:/i.test(href);
}

export const MarkdownPreview = forwardRef<PreviewHandle, MarkdownPreviewProps>(
  function MarkdownPreview({ html, settings, documentPath, onNavigateLine, onNotify }, forwardedRef) {
    const articleRef = useRef<HTMLElement>(null);

    useImperativeHandle(forwardedRef, () => ({
      scrollToSourceLine(line) {
        if (articleRef.current) scrollPreviewToLine(articleRef.current, line);
      },
    }), []);

    function handleClick(event: MouseEvent<HTMLElement>) {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (/^(https?:|mailto:)/i.test(href)) {
        event.preventDefault();
        void window.mdwork.openExternal(href).catch((error) => {
          onNotify(error instanceof Error ? error.message : '链接打开失败');
        });
      } else if (href.startsWith('#')) {
        event.preventDefault();
        const article = articleRef.current;
        if (!article) return;
        const result = navigatePreviewFragment(article, href);
        if (result.kind === 'line' && result.line) onNavigateLine(result.line);
        if (!result.found) onNotify('未找到链接指定的标题或文字');
      } else if (isLocalDocumentLink(href)) {
        event.preventDefault();
        if (!documentPath) {
          onNotify('请先保存文档，再打开相对路径链接');
          return;
        }
        void window.mdwork.openLocalResource(documentPath, href).then(() => {
          onNotify('已使用系统默认方式打开本地链接');
        }).catch((error) => {
          onNotify(error instanceof Error ? error.message : '本地链接打开失败');
        });
      } else if (href) {
        event.preventDefault();
      }
    }

    const style = {
      '--preview-font': settings.previewFont,
      '--code-font': settings.codeFont,
      '--preview-size': `${settings.previewFontSize}px`,
    } as CSSProperties;

    return (
      <article
        ref={articleRef}
        className="markdown-preview"
        style={style}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);
