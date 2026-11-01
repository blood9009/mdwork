import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import type { DocxExportRequest, PdfExportResult } from '../shared/contracts';
import { atomicWriteFile } from './file-service';

function docxBuffer(data: DocxExportRequest['data']): Buffer {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error('DOCX 导出数据无效');
}

export async function exportDocx(
  owner: BrowserWindow,
  request: DocxExportRequest,
): Promise<PdfExportResult> {
  const bytes = docxBuffer(request.data);
  if (bytes.byteLength < 4 || bytes.byteLength > 150 * 1024 * 1024) {
    throw new Error('DOCX 文件大小无效');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('DOCX 导出内容不是有效的 Word 文档');

  const baseName = request.sourcePath
    ? path.basename(request.sourcePath, path.extname(request.sourcePath))
    : request.title || '未命名';
  const save = await dialog.showSaveDialog(owner, {
    defaultPath: `${baseName}.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (save.canceled || !save.filePath) return { canceled: true };
  await atomicWriteFile(save.filePath, bytes);
  return { canceled: false, path: save.filePath };
}
