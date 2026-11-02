import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import type {
  DocumentImportKind,
  ImportedDocumentResult,
  ImportSourceResult,
  SaveImportedDocumentRequest,
} from '../shared/contracts';
import { atomicWriteFile, authorizeDocumentPath } from './file-service';

const selectedSources = new Set<string>();
const imageExtensions: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'image/x-emf': '.emf',
  'image/x-wmf': '.wmf',
};

function normalizePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

export async function selectImportSource(
  window: BrowserWindow,
  kind: DocumentImportKind,
): Promise<ImportSourceResult> {
  const word = kind === 'word';
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [word
      ? { name: 'Word 文档', extensions: ['docx'] }
      : { name: 'PDF 文档', extensions: ['pdf'] }],
  });
  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) return { canceled: true };

  const filePath = normalizePath(selectedPath);
  const expectedExtension = word ? '.docx' : '.pdf';
  if (path.extname(filePath).toLowerCase() !== expectedExtension) {
    throw new Error(word ? '仅支持 Word .docx 文件，旧版 .doc 请先另存为 .docx。' : '请选择 PDF 文件。');
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('选择的项目不是文件。');
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer.byteLength);
  data.set(buffer);
  selectedSources.add(filePath);
  return { canceled: false, path: filePath, data: data.buffer, size: stat.size };
}

export async function saveImportedDocument(
  window: BrowserWindow,
  request: SaveImportedDocumentRequest,
): Promise<ImportedDocumentResult> {
  const sourcePath = normalizePath(request.sourcePath);
  if (!selectedSources.has(sourcePath)) throw new Error('导入源文件尚未获得访问授权，请重新选择。');
  const defaultPath = path.join(
    path.dirname(sourcePath),
    `${path.basename(sourcePath, path.extname(sourcePath))}.md`,
  );
  const result = await dialog.showSaveDialog(window, {
    title: '选择 Markdown 保存位置',
    buttonLabel: '保存',
    defaultPath,
    properties: ['createDirectory'],
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  let filePath = normalizePath(result.filePath);
  if (!/\.(md|markdown)$/i.test(filePath)) filePath += '.md';
  if (filePath === sourcePath) throw new Error('Markdown 保存路径不能覆盖导入源文件。');
  if (request.openPaths.some((openPath) => openPath && normalizePath(openPath) === filePath)) {
    throw new Error('目标 Markdown 已在编辑器中打开，请选择其他保存路径。');
  }

  let markdown = request.markdown;
  const warnings = request.warnings.filter((warning) => typeof warning === 'string').slice(0, 100);
  const referencedImages = request.images.filter((image) => markdown.includes(image.uri));
  if (referencedImages.length) {
    const assetsDirectory = path.join(path.dirname(filePath), 'assets');
    const existing = await fs.lstat(assetsDirectory).catch(() => null);
    if (existing?.isSymbolicLink()) throw new Error('assets 目录不能是符号链接。');
    await fs.mkdir(assetsDirectory, { recursive: true });

    for (let index = 0; index < referencedImages.length; index += 1) {
      const image = referencedImages[index];
      const validData = image.data instanceof ArrayBuffer || ArrayBuffer.isView(image.data);
      if (!/^mdwork-image:\d{1,9}$/.test(image.uri) || !validData) {
        throw new Error('导入图片数据无效。');
      }
      const bytes = image.data instanceof ArrayBuffer
        ? Buffer.from(image.data)
        : Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
      const extension = imageExtensions[image.contentType] ?? '.bin';
      if (extension === '.bin') warnings.push(`第 ${index + 1} 张图片的格式 ${image.contentType || '未知'} 可能无法预览。`);
      let fileName = '';
      for (let suffix = 1; ; suffix += 1) {
        fileName = `import-image-${index + 1}${suffix === 1 ? '' : `-${suffix}`}${extension}`;
        try {
          await fs.writeFile(path.join(assetsDirectory, fileName), bytes, { flag: 'wx' });
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      markdown = markdown.split(image.uri).join(`assets/${fileName}`);
    }
  }

  await atomicWriteFile(filePath, markdown);
  authorizeDocumentPath(filePath);
  return {
    canceled: false,
    path: filePath,
    content: markdown,
    size: Buffer.byteLength(markdown),
    warnings,
  };
}
