import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type DragEvent } from 'react';
import type { PreviewHandle } from './components/MarkdownPreview';
import type { MarkdownEditorHandle } from './components/MarkdownEditor';
import { WorkspaceGroup, documentTitle, type ViewMode } from './components/WorkspaceGroup';
import { LARGE_FILE_CHARACTER_THRESHOLD } from './components/DocumentPreview';
import { SettingsDialog } from './components/SettingsDialog';
import { ExportDialog } from './components/ExportDialog';
import { InsertUrlDialog } from './components/InsertUrlDialog';
import { sanitizeMarkdown } from './markdown/sanitizeMarkdown';
import { renderMermaidDiagrams } from './markdown/renderMermaidDiagrams';
import { renderMarkdownInWorker } from './markdown/previewWorkerClient';
import { resourceMarkdown, type ResourceInsert } from './markdown/resourceSyntax';
import { defaultSettings, loadSettings } from './settings';
import { DocumentModelRegistry } from './editor/documentModels';
import {
  activeDocument as getActiveDocument,
  canSplit,
  createWorkspace,
  editorGridSize,
  workspaceReducer,
  type WorkspaceDocument,
} from './workspace/workspace';
import type { DocumentResult, PdfOptions } from '../shared/contracts';

const welcomeDocument = `# 欢迎使用 MDWork

左侧编写 **Markdown**，右侧实时查看排版结果。支持 macOS 与 Windows。

## 编辑体验

- Monaco 编辑器与 Markdown 语法高亮
- 多文件标签页与最多 4 列 × 3 行分栏
- 空格、Tab 等隐藏字符显示
- 大文件后台解析与手动预览
- 实时预览和滚动联动
- 样式化 PDF 导出

## 列表示例

- [x] GFM 表格和任务列表
- [x] 静态 Mermaid 与思维导图
- [ ] 开始编写你的文档

## 紧凑编号标题

#1
##1
##1
#*
#A

## 代码示例

\`\`\`ts
interface Document {
  title: string;
  content: string;
}

const greet = (name: string) => \`Hello, \${name}!\`;
\`\`\`

## 流程图示例

\`\`\`mermaid
flowchart TD
  A[开始] --> B{完成编辑?}
  B -->|是| C[导出 PDF]
  B -->|否| A
\`\`\`

## 表格示例

| 功能 | 状态 |
| --- | --- |
| 多标签与分栏 | 已支持 |
| PDF 导出 | 已支持 |

> 使用“打开”选择本地 Markdown 文件，也可以将文件直接拖入窗口；使用 Cmd/Ctrl + S 保存。
`;

function hasDraggedFiles(event: DragEvent<HTMLDivElement>): boolean {
  return [...event.dataTransfer.types].includes('Files');
}

function createDocumentId(): string {
  return globalThis.crypto.randomUUID();
}

export default function App() {
  const modelsRef = useRef<DocumentModelRegistry | null>(null);
  if (!modelsRef.current) modelsRef.current = new DocumentModelRegistry();
  const models = modelsRef.current;
  const initialDocumentRef = useRef<WorkspaceDocument | null>(null);
  if (!initialDocumentRef.current) {
    const id = createDocumentId();
    models.create(id, welcomeDocument);
    initialDocumentRef.current = { id, path: null, ...models.stats(id) };
  }
  const [workspace, dispatch] = useReducer(workspaceReducer, initialDocumentRef.current, createWorkspace);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [settings, setSettings] = useState(loadSettings);
  const [fonts, setFonts] = useState<string[]>([defaultSettings.previewFont, defaultSettings.codeFont]);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('就绪');
  const [dragActive, setDragActive] = useState(false);
  const editorRefs = useRef(new Map<string, MarkdownEditorHandle>());
  const previewRefs = useRef(new Map<string, PreviewHandle>());
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepthRef = useRef(0);
  const saveQueuesRef = useRef(new Map<string, Promise<string | null>>());
  const autoSaveTimersRef = useRef(new Map<string, { revision: number; timer: ReturnType<typeof setTimeout> }>());

  const currentDocument = getActiveDocument(workspace);
  const documents = useMemo(() => workspace.documentOrder.map((id) => workspace.documents[id]), [workspace.documentOrder, workspace.documents]);
  const anyDirty = documents.some((document) => document.dirty);
  const gridSize = editorGridSize(workspace);

  const notify = useCallback((message: string) => {
    setStatus(message);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus('就绪'), 3500);
  }, []);

  const addDocument = useCallback((content: string, path: string | null, groupId?: string): string => {
    const id = createDocumentId();
    models.create(id, content);
    dispatch({ type: 'add-document', document: { id, path, ...models.stats(id) }, groupId });
    return id;
  }, [models]);

  const acceptOpenedDocument = useCallback((result: DocumentResult, groupId?: string): string | null => {
    if (result.canceled || typeof result.content !== 'string' || !result.path) return null;
    const targetGroupId = groupId ?? workspaceRef.current.activeGroupId;
    const existing = Object.values(workspaceRef.current.documents).find((document) => document.path === result.path);
    if (existing) {
      dispatch({ type: 'select-document', groupId: targetGroupId, documentId: existing.id });
      notify(`已定位到打开的标签：${documentTitle(existing)}`);
      return existing.id;
    }
    const id = addDocument(result.content, result.path, targetGroupId);
    notify(`已打开：${result.path}`);
    return id;
  }, [addDocument, notify]);

  const handleNew = useCallback((groupId?: string) => {
    addDocument('', null, groupId);
    setStatus('已新建文档');
  }, [addDocument]);

  const handleOpen = useCallback(async (groupId?: string) => {
    try {
      setStatus('正在选择并加载文件…');
      const result = await window.mdwork.openDocument();
      if (!acceptOpenedDocument(result, groupId)) setStatus('就绪');
    } catch (error) {
      notify(error instanceof Error ? error.message : '打开文件失败');
    }
  }, [acceptOpenedDocument, notify]);

  const performSave = useCallback(async (documentId: string, saveAs: boolean, silent: boolean): Promise<string | null> => {
    try {
      const document = workspaceRef.current.documents[documentId];
      if (!document) return null;
      const snapshot = models.snapshot(documentId);
      if (!silent) setStatus('正在保存…');
      const result = await window.mdwork.saveDocument(saveAs ? null : document.path, snapshot.content);
      if (result.canceled || !result.path) return null;
      const conflicting = Object.values(workspaceRef.current.documents)
        .find((item) => item.id !== documentId && item.path === result.path);
      if (conflicting) {
        notify('目标文件已在另一标签打开；已写入文件，请关闭重复标签后重新打开');
      }
      const stats = models.markSaved(documentId, snapshot.version);
      dispatch({ type: 'patch-document', documentId, patch: { path: result.path, ...stats } });
      if (!conflicting) notify(`${saveAs ? '已另存为' : '已保存'}：${result.path.split(/[\\/]/).pop()}`);
      return result.path;
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败');
      return null;
    }
  }, [models, notify]);

  const saveDocument = useCallback((documentId: string, saveAs = false, silent = false): Promise<string | null> => {
    const previous = saveQueuesRef.current.get(documentId) ?? Promise.resolve<string | null>(null);
    const operation = previous.then(() => performSave(documentId, saveAs, silent));
    saveQueuesRef.current.set(documentId, operation);
    void operation.finally(() => {
      if (saveQueuesRef.current.get(documentId) === operation) saveQueuesRef.current.delete(documentId);
    });
    return operation;
  }, [performSave]);

  const saveActiveDocument = useCallback((saveAs = false) => {
    const document = getActiveDocument(workspaceRef.current);
    if (document) void saveDocument(document.id, saveAs);
  }, [saveDocument]);

  const closeDocument = useCallback((groupId: string, documentId: string) => {
    const state = workspaceRef.current;
    const document = state.documents[documentId];
    if (!document) return;
    const lastReference = !Object.values(state.groups)
      .some((group) => group.id !== groupId && group.documentIds.includes(documentId));
    if (lastReference && document.dirty && !window.confirm(`“${documentTitle(document)}”有未保存的修改，确定关闭吗？`)) return;
    dispatch({ type: 'close-document', groupId, documentId });
    setTimeout(() => {
      if (!workspaceRef.current.documents[documentId]) models.dispose(documentId);
    }, 0);
  }, [models]);

  useEffect(() => {
    if (!settings.autoSave) {
      for (const entry of autoSaveTimersRef.current.values()) clearTimeout(entry.timer);
      autoSaveTimersRef.current.clear();
      return;
    }
    for (const [id, entry] of autoSaveTimersRef.current) {
      const document = workspace.documents[id];
      if (!document?.path || !document.dirty || document.revision !== entry.revision) {
        clearTimeout(entry.timer);
        autoSaveTimersRef.current.delete(id);
      }
    }
    for (const document of Object.values(workspace.documents)) {
      if (!document.path || !document.dirty || autoSaveTimersRef.current.has(document.id)) continue;
      const revision = document.revision;
      const timer = setTimeout(() => {
        autoSaveTimersRef.current.delete(document.id);
        const latest = workspaceRef.current.documents[document.id];
        if (latest?.path && latest.dirty) void saveDocument(document.id, false, true);
      }, 1500);
      autoSaveTimersRef.current.set(document.id, { revision, timer });
    }
  }, [workspace.documents, settings.autoSave, saveDocument]);

  useEffect(() => () => {
    for (const entry of autoSaveTimersRef.current.values()) clearTimeout(entry.timer);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    localStorage.setItem('mdwork.settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    void window.mdwork.listSystemFonts().then(setFonts).catch(() => {
      notify('系统字体读取失败，已使用默认字体');
    });
  }, [notify]);

  useEffect(() => {
    document.title = `${currentDocument?.dirty ? '● ' : ''}${documentTitle(currentDocument)} — MDWork`;
  }, [currentDocument]);

  useEffect(() => {
    window.mdwork.setDocumentDirty(anyDirty);
  }, [anyDirty]);

  function insertResource(resource: ResourceInsert): void {
    const groupId = workspaceRef.current.activeGroupId;
    const document = getActiveDocument(workspaceRef.current);
    if (!document) { notify('请先新建或打开文档'); return; }
    const markdown = resourceMarkdown(resource);
    if (workspaceRef.current.groups[groupId]?.activeDocumentId === document.id && editorRefs.current.has(groupId)) {
      editorRefs.current.get(groupId)!.insertText(markdown);
    } else {
      models.appendText(document.id, markdown);
    }
  }

  async function handleImportImage(): Promise<void> {
    const groupId = workspaceRef.current.activeGroupId;
    const document = getActiveDocument(workspaceRef.current);
    if (!document) { notify('请先新建或打开文档'); return; }
    const documentId = document.id;
    try {
      setStatus('正在导入图片…');
      const currentPath = document.path ?? await saveDocument(documentId);
      if (!currentPath) { notify('已取消导入图片'); return; }
      const result = await window.mdwork.importImage(currentPath);
      if (result.canceled) { notify('已取消导入图片'); return; }
      if (!result.src) throw new Error('未获取到图片路径');
      const markdown = resourceMarkdown({ url: result.src, label: result.alt ?? '图片', mode: 'image' });
      if (workspaceRef.current.groups[groupId]?.activeDocumentId === documentId && editorRefs.current.has(groupId)) {
        editorRefs.current.get(groupId)!.insertText(markdown);
      } else {
        models.appendText(documentId, markdown);
      }
      notify(`已导入图片：${result.src}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '图片导入失败');
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (!hasDraggedFiles(event)) return;
    const files = [...event.dataTransfer.files].filter((file) => /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name));
    if (!files.length) { notify('仅支持拖入 Markdown 或文本文件'); return; }
    setStatus(`正在加载 ${files.length} 个文件…`);
    for (const file of files) {
      try {
        const result = await window.mdwork.openDroppedDocument(file);
        acceptOpenedDocument(result);
      } catch (error) {
        notify(error instanceof Error ? `${file.name}：${error.message}` : `${file.name} 打开失败`);
      }
    }
  }

  async function handleExport(options: PdfOptions): Promise<boolean> {
    const document = getActiveDocument(workspaceRef.current);
    if (!document) { notify('请先新建或打开文档'); return false; }
    const { id, path } = document;
    const title = documentTitle(document);
    setExporting(true);
    try {
      const snapshot = models.snapshot(id).content;
      const current = await renderMarkdownInWorker(snapshot);
      const bodyHtml = await renderMermaidDiagrams(
        sanitizeMarkdown(current.html, path), settings.theme, 'image',
      );
      const result = await window.mdwork.exportPdf({ title, sourcePath: path, bodyHtml, headings: current.headings, options });
      if (result.canceled) return false;
      notify(`PDF 已导出：${result.path}`);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PDF 导出失败');
      return false;
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveActiveDocument(event.shiftKey);
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void handleOpen();
      } else if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        const state = workspaceRef.current;
        const document = getActiveDocument(state);
        if (document) closeDocument(state.activeGroupId, document.id);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [closeDocument, handleOpen, saveActiveDocument]);

  return (
    <div className="app-shell"
      onDragEnter={handleDragEnter} onDragOver={handleDragOver}
      onDragLeave={handleDragLeave} onDrop={(event) => { void handleDrop(event); }}>
      <header className="toolbar">
        <div className="brand"><span className="brand-mark">M↓</span><strong>MDWork</strong></div>
        <div className="toolbar-group">
          <button onClick={() => handleNew()}>新建</button>
          <button onClick={() => void handleOpen()}>打开</button>
          <button onClick={() => saveActiveDocument()} disabled={!currentDocument} className={currentDocument?.dirty ? 'needs-save' : ''}>保存</button>
          <button onClick={() => saveActiveDocument(true)} disabled={!currentDocument}>另存为</button>
          <button onClick={() => void handleImportImage()} disabled={!currentDocument} title="选择本地图片并复制到文档 assets 目录">导入图片</button>
          <button onClick={() => setUrlDialogOpen(true)} disabled={!currentDocument} title="插入 URL 图片或链接">插入 URL</button>
          <button onClick={() => setExportOpen(true)} disabled={!currentDocument}>导出 PDF</button>
        </div>
        <div className="toolbar-spacer" />
        <div className="segmented" aria-label="视图模式">
          <button className={viewMode === 'edit' ? 'active' : ''} onClick={() => setViewMode('edit')}>编辑</button>
          <button className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')}>分栏</button>
          <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>预览</button>
        </div>
        <button className="icon-button" title="切换明暗主题" aria-label="切换明暗主题"
          onClick={() => setSettings({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
          {settings.theme === 'dark' ? '☀' : '◐'}
        </button>
        <button className="icon-button" title="设置" aria-label="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
      </header>

      <div className="workspace-toolbar">
        <button className={settings.showHiddenCharacters ? 'active-tool' : ''}
          title="显示或隐藏空格、Tab 等空白符号"
          onClick={() => setSettings({ ...settings, showHiddenCharacters: !settings.showHiddenCharacters })}>
          ¶ 隐藏字符
        </button>
        <span className="toolbar-separator" />
        <button disabled={!canSplit(workspace, 'right')}
          onClick={() => dispatch({ type: 'split', direction: 'right' })}>向右分栏</button>
        <button disabled={!canSplit(workspace, 'down')}
          onClick={() => dispatch({ type: 'split', direction: 'down' })}>向下分栏</button>
        {workspace.groupOrder.length > 1 && <button onClick={() => dispatch({ type: 'reset-grid' })}>单栏</button>}
        <span className="layout-summary">{gridSize.columns} 列 × {gridSize.rows} 行</span>
        {currentDocument && currentDocument.characterCount >= LARGE_FILE_CHARACTER_THRESHOLD && <span className="large-file-badge">大文件模式</span>}
      </div>

      <main className="workspace">
        <div className="editor-grid" style={{
          gridTemplateColumns: `repeat(${gridSize.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridSize.rows}, minmax(0, 1fr))`,
        }}>
          {workspace.groupOrder.map((groupId) => {
            const group = workspace.groups[groupId];
            const document = group.activeDocumentId ? workspace.documents[group.activeDocumentId] ?? null : null;
            const groupDocuments = group.documentIds.map((id) => workspace.documents[id]);
            return <WorkspaceGroup key={groupId} groupId={groupId} active={workspace.activeGroupId === groupId}
              documents={groupDocuments} document={document} model={document ? models.get(document.id) : null}
              settings={settings} viewMode={viewMode}
              editorRef={(handle) => { if (handle) editorRefs.current.set(groupId, handle); else editorRefs.current.delete(groupId); }}
              previewRef={(handle) => { if (handle) previewRefs.current.set(groupId, handle); else previewRefs.current.delete(groupId); }}
              onActivate={() => dispatch({ type: 'activate-group', groupId })}
              onSelectDocument={(documentId) => dispatch({ type: 'select-document', groupId, documentId })}
              onCloseDocument={(documentId) => closeDocument(groupId, documentId)}
              onNew={() => handleNew(groupId)} onOpen={() => void handleOpen(groupId)}
              onVisibleLineChange={(line) => {
                if (settings.syncScroll && viewMode === 'split') previewRefs.current.get(groupId)?.scrollToSourceLine(line);
              }}
              onNavigateLine={(line) => editorRefs.current.get(groupId)?.revealLine(line)}
              onNotify={notify} />;
          })}
        </div>
      </main>

      {dragActive && <div className="drop-overlay" aria-hidden="true">
        <div>释放以在新标签中打开 Markdown 文件</div>
      </div>}

      <footer className="status-bar">
        <span className="status-path" title={currentDocument?.path ?? undefined}>{currentDocument?.path ?? '未保存到本地'}</span>
        {currentDocument?.dirty && <span className="dirty-indicator">未保存</span>}
        <span className="status-spacer" />
        <span>{status}</span>
        <span>{currentDocument?.characterCount.toLocaleString() ?? 0} 字符</span>
        <span>{currentDocument?.lineCount.toLocaleString() ?? 0} 行</span>
      </footer>

      {settingsOpen && <SettingsDialog settings={settings} fonts={fonts}
        onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
      {urlDialogOpen && <InsertUrlDialog onClose={() => setUrlDialogOpen(false)}
        onInsert={(resource) => {
          insertResource(resource);
          notify(resource.mode === 'image' ? '已插入 URL 图片' : '已插入跳转链接');
        }} />}
      {exportOpen && <ExportDialog settings={settings} exporting={exporting}
        onExport={handleExport} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
