import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFolderDocument, scanFolder } from '../electron/folder-service';

async function temporaryFolder(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mdwork-folder-test-'));
}

describe('folder explorer', () => {
  it('recursively lists supported documents and picks up new files on refresh', async () => {
    const root = await temporaryFolder();
    try {
      await mkdir(path.join(root, 'notes'));
      await mkdir(path.join(root, 'node_modules'));
      for (const [name, content] of [
        ['README.md', '# Readme'],
        ['guide.markdown', '# Guide'],
        ['legacy.mdown', 'Legacy'],
        ['short.mkd', 'Short'],
        ['plain.txt', 'Plain'],
        ['notes/nested.md', '# Nested'],
        ['ignored.html', '<p>Ignored</p>'],
        ['node_modules/dependency.md', 'Dependency'],
      ]) await writeFile(path.join(root, name), content);

      const snapshot = await scanFolder(root);
      const files = snapshot.entries.filter((entry) => entry.kind === 'file').map((entry) => entry.relativePath);
      expect(files.sort()).toEqual([
        'README.md', 'guide.markdown', 'legacy.mdown', 'notes/nested.md', 'plain.txt', 'short.mkd',
      ]);
      expect(snapshot.entries.some((entry) => entry.relativePath === 'node_modules')).toBe(false);
      expect(snapshot.entries.find((entry) => entry.relativePath === 'notes')).toMatchObject({ kind: 'directory', depth: 0 });
      expect(snapshot.entries.find((entry) => entry.relativePath === 'notes/nested.md')).toMatchObject({ kind: 'file', depth: 1 });

      await writeFile(path.join(root, 'notes', 'added.md'), 'Added later');
      const refreshed = await scanFolder(root);
      expect(refreshed.entries.some((entry) => entry.relativePath === 'notes/added.md')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('opens only authorized Markdown files inside the selected folder', async () => {
    const parent = await temporaryFolder();
    const root = path.join(parent, 'workspace');
    try {
      await mkdir(root);
      const authorizedRoot = await realpath(root);
      await writeFile(path.join(root, 'document.md'), '# Folder document');
      await writeFile(path.join(root, 'ignored.html'), 'Not Markdown');
      await writeFile(path.join(parent, 'outside.md'), 'Outside');

      const opened = await readFolderDocument(authorizedRoot, path.join(authorizedRoot, 'document.md'));
      expect(opened.content).toBe('# Folder document');
      expect(opened.path).toBe(path.join(authorizedRoot, 'document.md'));
      await expect(readFolderDocument(authorizedRoot, path.join(parent, 'outside.md'))).rejects.toThrow('当前文件夹');
      await expect(readFolderDocument(authorizedRoot, path.join(authorizedRoot, '..', 'outside.md'))).rejects.toThrow('当前文件夹');
      await expect(readFolderDocument(authorizedRoot, path.join(authorizedRoot, 'ignored.html'))).rejects.toThrow('仅支持');

      if (process.platform !== 'win32') {
        await symlink(path.join(parent, 'outside.md'), path.join(authorizedRoot, 'linked.md'));
        expect((await scanFolder(authorizedRoot)).entries.some((entry) => entry.name === 'linked.md')).toBe(false);
        await expect(readFolderDocument(authorizedRoot, path.join(authorizedRoot, 'linked.md'))).rejects.toThrow('符号链接');
      }
      expect(await readFile(path.join(parent, 'outside.md'), 'utf8')).toBe('Outside');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
