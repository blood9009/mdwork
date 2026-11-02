import { useEffect, useMemo, useState } from 'react';
import type { FolderEntry, FolderSnapshot } from '../../shared/contracts';

interface FileExplorerProps {
  snapshot: FolderSnapshot | null;
  busy: boolean;
  activePath: string | null;
  openPaths: Set<string>;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onOpenFile: (filePath: string) => void;
}

function isHiddenByCollapsedFolder(entry: FolderEntry, collapsed: Set<string>): boolean {
  const segments = entry.relativePath.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    if (collapsed.has(segments.slice(0, index).join('/'))) return true;
  }
  return false;
}

export function FileExplorer({
  snapshot,
  busy,
  activePath,
  openPaths,
  onOpenFolder,
  onRefresh,
  onOpenFile,
}: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootPath = snapshot?.rootPath;
  useEffect(() => { setCollapsed(new Set()); }, [rootPath]);
  const entries = useMemo(
    () => snapshot?.entries.filter((entry) => !isHiddenByCollapsedFolder(entry, collapsed)) ?? [],
    [collapsed, snapshot],
  );
  const fileCount = useMemo(
    () => snapshot?.entries.filter((entry) => entry.kind === 'file').length ?? 0,
    [snapshot],
  );

  function toggleDirectory(relativePath: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }

  return (
    <aside className="file-explorer" aria-label="文件资源管理器">
      <header className="explorer-header">
        <span>资源管理器</span>
        <div>
          {snapshot?.rootPath && <button type="button" className="explorer-icon-button"
            title="刷新文件列表" aria-label="刷新文件列表" disabled={busy} onClick={onRefresh}>↻</button>}
          <button type="button" className="explorer-icon-button"
            title="打开文件夹" aria-label="打开文件夹" disabled={busy} onClick={onOpenFolder}>＋</button>
        </div>
      </header>
      {!snapshot?.rootPath ? (
        <div className="explorer-empty">
          <strong>{busy ? '正在读取文件夹…' : '尚未打开文件夹'}</strong>
          <p>自动列出文件夹中的 Markdown 和文本文件，点击即可在新标签中打开。</p>
          <button type="button" className="primary-button" disabled={busy} onClick={onOpenFolder}>打开文件夹</button>
        </div>
      ) : (
        <>
          <div className="explorer-root" title={snapshot.rootPath}>
            <span aria-hidden="true">▾</span>
            <strong>{snapshot.rootName}</strong>
          </div>
          <div className="explorer-tree" role="tree" aria-label={`${snapshot.rootName} 文件列表`}>
            {entries.map((entry) => {
              const expanded = !collapsed.has(entry.relativePath);
              const active = entry.path === activePath;
              const opened = openPaths.has(entry.path);
              return (
                <button type="button" role="treeitem" key={entry.path}
                  className={`explorer-entry ${entry.kind} ${active ? 'active' : ''} ${opened ? 'opened' : ''}`}
                  style={{ paddingLeft: 8 + entry.depth * 14 }}
                  title={entry.relativePath}
                  aria-expanded={entry.kind === 'directory' ? expanded : undefined}
                  aria-selected={entry.kind === 'file' ? active : undefined}
                  onClick={() => {
                    if (entry.kind === 'directory') toggleDirectory(entry.relativePath);
                    else onOpenFile(entry.path);
                  }}>
                  <span className="explorer-entry-icon" aria-hidden="true">
                    {entry.kind === 'directory' ? (expanded ? '▾' : '▸') : 'M'}
                  </span>
                  <span className="explorer-entry-name">{entry.name}</span>
                  {entry.kind === 'file' && opened && <span className="explorer-open-dot" aria-label="已打开" />}
                </button>
              );
            })}
            {!entries.length && <p className="explorer-no-files">未找到 Markdown 或文本文件</p>}
          </div>
          <footer className="explorer-footer">
            <span>{fileCount} 个文件</span>
            {snapshot.truncated && <span title="条目过多，仅显示前 2000 项">列表已截断</span>}
          </footer>
        </>
      )}
    </aside>
  );
}
