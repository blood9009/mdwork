import type { Ref } from 'react';
import type { monaco } from '../editor/monaco';
import type { AppSettings } from '../settings';
import type { WorkspaceDocument } from '../workspace/workspace';
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';
import { DocumentPreview, LARGE_FILE_CHARACTER_THRESHOLD } from './DocumentPreview';
import type { PreviewHandle } from './MarkdownPreview';
import { SplitPane } from './SplitPane';

export type ViewMode = 'split' | 'edit' | 'preview';

export function documentTitle(document: WorkspaceDocument | null): string {
  return document?.path?.split(/[\\/]/).pop() || (document ? `未命名-${document.id.slice(0, 4)}` : '未命名');
}

interface WorkspaceGroupProps {
  groupId: string;
  active: boolean;
  documents: WorkspaceDocument[];
  document: WorkspaceDocument | null;
  model: monaco.editor.ITextModel | null;
  settings: AppSettings;
  viewMode: ViewMode;
  editorRef: Ref<MarkdownEditorHandle>;
  previewRef: Ref<PreviewHandle>;
  onActivate: () => void;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onVisibleLineChange: (line: number) => void;
  onNavigateLine: (line: number) => void;
  onNotify: (message: string) => void;
}

export function WorkspaceGroup({
  groupId, active, documents, document, model, settings, viewMode, editorRef, previewRef,
  onActivate, onSelectDocument, onCloseDocument, onNew, onOpen, onVisibleLineChange, onNavigateLine, onNotify,
}: WorkspaceGroupProps) {
  return <section className={`editor-group${active ? ' active' : ''}`}
    data-group-id={groupId} onPointerDown={onActivate}>
    <div className="document-tabs" role="tablist" aria-label={`文档标签 ${groupId}`}>
      {documents.map((item) => <div className={`document-tab${item.id === document?.id ? ' active' : ''}`}
        key={item.id} title={item.path ?? undefined}>
        <button className="document-tab-select" role="tab" aria-selected={item.id === document?.id}
          onClick={() => onSelectDocument(item.id)}>
          {item.dirty && <span className="tab-dirty" aria-label="未保存">●</span>}
          <span>{documentTitle(item)}</span>
        </button>
        <button className="document-tab-close" aria-label={`关闭 ${documentTitle(item)}`}
          title="关闭文档" onClick={() => onCloseDocument(item.id)}>×</button>
      </div>)}
    </div>
    <div className="editor-group-body">
      {document && model ? <SplitPane
        mode={viewMode}
        left={<MarkdownEditor ref={editorRef} documentId={document.id} model={model} settings={settings}
          largeFile={document.characterCount >= LARGE_FILE_CHARACTER_THRESHOLD}
          onActivate={onActivate} onVisibleLineChange={onVisibleLineChange} />}
        right={<DocumentPreview key={document.id} ref={previewRef} document={document} model={model}
          settings={settings} viewMode={viewMode} active={active}
          onNavigateLine={onNavigateLine} onNotify={onNotify} />}
      /> : <div className="empty-editor-group">
        <strong>空白分栏</strong>
        <span>新建或打开一个 Markdown 文档</span>
        <div><button onClick={onNew}>新建</button><button onClick={onOpen}>打开</button></div>
      </div>}
    </div>
  </section>;
}
