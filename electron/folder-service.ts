import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import type { DocumentResult, FolderEntry, FolderSnapshot } from '../shared/contracts';
import { isMarkdownDocumentPath, readMarkdownDocument } from './file-service';

const MAX_FOLDER_ENTRIES = 2000;
const MAX_FOLDER_DEPTH = 64;
const skippedDirectories = new Set(['.git', 'node_modules']);
const folderSessions = new Map<number, string>();

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function relativeName(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join('/');
}

export async function scanFolder(selectedPath: string): Promise<FolderSnapshot> {
  const rootPath = await fs.realpath(path.resolve(selectedPath));
  const stat = await fs.stat(rootPath);
  if (!stat.isDirectory()) throw new Error('选择的项目不是文件夹。');
  const entries: FolderEntry[] = [];
  let truncated = false;

  async function visit(directoryPath: string, depth: number): Promise<void> {
    if (truncated) return;
    if (depth > MAX_FOLDER_DEPTH) {
      truncated = true;
      return;
    }
    const children = await fs.readdir(directoryPath, { withFileTypes: true });
    children.sort((left, right) => {
      const directoryOrder = Number(right.isDirectory()) - Number(left.isDirectory());
      return directoryOrder || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    for (const child of children) {
      if (entries.length >= MAX_FOLDER_ENTRIES) {
        truncated = true;
        return;
      }
      if (child.isSymbolicLink()) continue;
      const childPath = path.join(directoryPath, child.name);
      if (child.isDirectory()) {
        if (skippedDirectories.has(child.name)) continue;
        entries.push({
          kind: 'directory',
          name: child.name,
          path: childPath,
          relativePath: relativeName(rootPath, childPath),
          depth,
        });
        try {
          await visit(childPath, depth + 1);
        } catch (error) {
          if (!['EACCES', 'EPERM', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        }
      } else if (child.isFile() && isMarkdownDocumentPath(child.name)) {
        entries.push({
          kind: 'file',
          name: child.name,
          path: childPath,
          relativePath: relativeName(rootPath, childPath),
          depth,
        });
      }
      if (truncated) return;
    }
  }

  await visit(rootPath, 0);
  return {
    canceled: false,
    rootPath,
    rootName: path.basename(rootPath) || rootPath,
    entries,
    truncated,
  };
}

export async function openFolder(window: BrowserWindow): Promise<FolderSnapshot> {
  const result = await dialog.showOpenDialog(window, {
    title: '选择要打开的文件夹',
    buttonLabel: '选择此文件夹',
    properties: ['openDirectory', 'createDirectory'],
  });
  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) return { canceled: true, entries: [], truncated: false };
  const snapshot = await scanFolder(selectedPath);
  folderSessions.set(window.webContents.id, snapshot.rootPath!);
  return snapshot;
}

export async function refreshFolder(window: BrowserWindow): Promise<FolderSnapshot> {
  const rootPath = folderSessions.get(window.webContents.id);
  if (!rootPath) throw new Error('请先打开文件夹。');
  return scanFolder(rootPath);
}

export async function readFolderDocument(
  rootPath: string,
  selectedPath: string,
): Promise<DocumentResult> {
  const root = await fs.realpath(path.resolve(rootPath));
  const candidate = path.resolve(selectedPath);
  if (!isInside(root, candidate)) throw new Error('文件不在当前文件夹内。');
  const linkStat = await fs.lstat(candidate);
  if (linkStat.isSymbolicLink()) throw new Error('文件列表不支持打开符号链接。');
  const filePath = await fs.realpath(candidate);
  if (!isInside(root, filePath)) throw new Error('文件不能指向当前文件夹之外。');
  return readMarkdownDocument(filePath);
}

export async function openFolderDocument(
  window: BrowserWindow,
  selectedPath: string,
): Promise<DocumentResult> {
  const rootPath = folderSessions.get(window.webContents.id);
  if (!rootPath) throw new Error('请先打开文件夹。');
  return readFolderDocument(rootPath, selectedPath);
}

export function clearFolderSession(window: BrowserWindow): void {
  folderSessions.delete(window.webContents.id);
}
