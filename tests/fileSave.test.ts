import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDocument } from '../electron/file-service';

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  BrowserWindow: class {},
  dialog: { showSaveDialog: electronMocks.showSaveDialog },
  shell: { openPath: vi.fn() },
}));

const temporaryDirectories: string[] = [];

beforeEach(() => {
  electronMocks.getPath.mockReturnValue('/mdwork-test-home');
  electronMocks.showSaveDialog.mockReset();
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('document save location', () => {
  it('allows Save As to choose a folder outside the original document directory', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'mdwork-save-location-'));
    temporaryDirectories.push(parent);
    const originalDirectory = path.join(parent, 'original');
    const selectedDirectory = path.join(parent, 'any-other-folder');
    await mkdir(originalDirectory);
    await mkdir(selectedDirectory);
    const originalPath = path.join(originalDirectory, 'document.md');
    const selectedPath = path.join(selectedDirectory, 'renamed.md');

    electronMocks.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: originalPath });
    const first = await saveDocument(null as never, null, '# Original');
    expect(first.path).toBe(originalPath);
    expect(electronMocks.showSaveDialog.mock.calls[0][1]).toMatchObject({
      defaultPath: path.join('/mdwork-test-home', '未命名.md'),
      properties: ['createDirectory'],
    });

    electronMocks.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: selectedPath });
    const second = await saveDocument(null as never, originalPath, '# Saved elsewhere', true);
    expect(second.path).toBe(selectedPath);
    expect(electronMocks.showSaveDialog.mock.calls[1][1]).toMatchObject({
      defaultPath: originalPath,
      properties: ['createDirectory'],
    });
    expect(await readFile(selectedPath, 'utf8')).toBe('# Saved elsewhere');
    expect(await readFile(originalPath, 'utf8')).toBe('# Original');
  });

  it('does not change the original file when the Save As dialog is canceled', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mdwork-save-cancel-'));
    temporaryDirectories.push(directory);
    const originalPath = path.join(directory, 'document.md');
    electronMocks.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: originalPath });
    await saveDocument(null as never, null, '# Keep me');

    electronMocks.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    const result = await saveDocument(null as never, originalPath, '# Unsaved edit', true);
    expect(result).toEqual({ canceled: true });
    expect(await readFile(originalPath, 'utf8')).toBe('# Keep me');
  });
});
