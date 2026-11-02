import { randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import type { DocumentResult, ImageImportResult, SaveResult } from '../shared/contracts';

const authorizedPaths = new Set<string>();

function normalizePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

export function authorizeDocumentPath(filePath: string): void {
  authorizedPaths.add(normalizePath(filePath));
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function atomicWriteFile(filePath: string, content: string | Buffer): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(temporaryPath, content);
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

const markdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);
const imageExtensions = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

async function readDocument(selectedPath: string): Promise<DocumentResult> {
  const filePath = normalizePath(selectedPath);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('选择的项目不是文件。');
  const content = await fs.readFile(filePath, 'utf8');
  authorizeDocumentPath(filePath);
  return { canceled: false, path: filePath, content, size: stat.size };
}

export function isMarkdownDocumentPath(filePath: string): boolean {
  return markdownExtensions.has(path.extname(filePath).toLowerCase());
}

export async function readMarkdownDocument(selectedPath: string): Promise<DocumentResult> {
  const filePath = normalizePath(selectedPath);
  if (!isMarkdownDocumentPath(filePath)) {
    throw new Error('仅支持打开 Markdown 或文本文件（.md、.markdown、.mdown、.mkd、.txt）。');
  }
  return readDocument(filePath);
}

export async function openDocument(window: BrowserWindow): Promise<DocumentResult> {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) return { canceled: true };
  return readDocument(selectedPath);
}

export async function openDroppedDocument(filePath: string): Promise<DocumentResult> {
  return readMarkdownDocument(filePath);
}

export async function copyImageToAssets(
  documentPath: string,
  selectedPath: string,
): Promise<ImageImportResult> {
  const sourcePath = normalizePath(selectedPath);
  const extension = path.extname(sourcePath).toLowerCase();
  if (!imageExtensions.has(extension)) throw new Error('请选择 PNG、JPEG、GIF、WebP、SVG、AVIF 或 BMP 图片。');
  const stat = await fs.stat(sourcePath);
  if (!stat.isFile()) throw new Error('选择的项目不是图片文件。');

  const assetsDirectory = path.join(path.dirname(normalizePath(documentPath)), 'assets');
  const existing = await fs.lstat(assetsDirectory).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error('assets 目录不能是符号链接。');
  await fs.mkdir(assetsDirectory, { recursive: true });
  const stem = path.basename(sourcePath, path.extname(sourcePath))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/^\.+/, '').trim().slice(0, 80) || 'image';

  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : `-${index}`;
    const fileName = `${stem}${suffix}${extension}`;
    const destination = path.join(assetsDirectory, fileName);
    try {
      await fs.copyFile(sourcePath, destination, constants.COPYFILE_EXCL);
      return { canceled: false, src: `assets/${fileName}`, alt: stem };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

export async function importImage(
  window: BrowserWindow,
  documentPath: string,
): Promise<ImageImportResult> {
  if (!authorizedPaths.has(normalizePath(documentPath))) {
    throw new Error('请先保存文档，再导入图片。');
  }
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: [...imageExtensions].map((value) => value.slice(1)) }],
  });
  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) return { canceled: true };
  return copyImageToAssets(documentPath, selectedPath);
}

export async function resolveLocalResourcePath(documentPath: string, href: string): Promise<string> {
  if (typeof href !== 'string' || href.length === 0 || href.length > 4096) {
    throw new Error('无效的本地链接');
  }
  const encodedPath = href.split(/[?#]/, 1)[0];
  let resourcePath: string;
  try {
    resourcePath = decodeURIComponent(encodedPath);
  } catch {
    throw new Error('本地链接编码无效');
  }
  if (!resourcePath || resourcePath.includes('\0')) throw new Error('本地链接路径为空');

  const documentDirectory = path.dirname(normalizePath(documentPath));
  const requestedPath = path.isAbsolute(resourcePath)
    ? path.resolve(resourcePath) : path.resolve(documentDirectory, resourcePath);
  const [realDirectory, realPath] = await Promise.all([
    fs.realpath(documentDirectory), fs.realpath(requestedPath),
  ]);
  if (!isInside(realDirectory, realPath)) throw new Error('本地链接不能指向文档目录之外');
  return realPath;
}

export async function openLocalResource(documentPath: string, href: string): Promise<void> {
  if (!authorizedPaths.has(normalizePath(documentPath))) throw new Error('文档路径尚未获得访问授权');
  const resourcePath = await resolveLocalResourcePath(documentPath, href);
  const error = await shell.openPath(resourcePath);
  if (error) throw new Error(error);
}

export async function readExportImage(documentPath: string, source: string): Promise<Buffer> {
  if (!authorizedPaths.has(normalizePath(documentPath))) throw new Error('文档路径尚未获得图片读取授权');
  const resourcePath = await resolveLocalResourcePath(documentPath, source);
  if (!imageExtensions.has(path.extname(resourcePath).toLowerCase())) throw new Error('不支持导出此图片格式');
  const stat = await fs.stat(resourcePath);
  if (!stat.isFile()) throw new Error('图片路径不是文件');
  if (stat.size > 30 * 1024 * 1024) throw new Error('图片超过 30 MB，无法嵌入 DOCX');
  return fs.readFile(resourcePath);
}

export async function saveDocument(
  window: BrowserWindow,
  currentPath: string | null,
  content: string,
  saveAs = false,
): Promise<SaveResult> {
  let filePath = currentPath ? normalizePath(currentPath) : null;

  if (filePath && !authorizedPaths.has(filePath)) {
    throw new Error('该文件路径尚未获得保存授权，请重新打开文件。');
  }

  if (!filePath || saveAs) {
    const result = await dialog.showSaveDialog(window, {
      title: '选择 Markdown 保存位置',
      buttonLabel: '保存',
      defaultPath: filePath ?? path.join(app.getPath('home'), '未命名.md'),
      properties: ['createDirectory'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = normalizePath(result.filePath);
  }

  await atomicWriteFile(filePath, content);
  authorizeDocumentPath(filePath);
  return { canceled: false, path: filePath };
}
