import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyImageToAssets, resolveLocalResourcePath } from '../electron/file-service';
import { resourceMarkdown } from '../src/markdown/resourceSyntax';
import { renderMarkdown } from '../src/markdown/renderMarkdown';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

describe('resource insertion', () => {
  it('copies local images into assets without overwriting existing files', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mdwork-image-test-'));
    temporaryDirectories.push(directory);
    const documentPath = path.join(directory, 'document.md');
    const sourcePath = path.join(directory, 'my diagram #1.PNG');
    await fs.writeFile(documentPath, '# Test');
    await fs.writeFile(sourcePath, 'image-data');

    const first = await copyImageToAssets(documentPath, sourcePath);
    const second = await copyImageToAssets(documentPath, sourcePath);
    expect(first).toEqual({ canceled: false, src: 'assets/my diagram #1.png', alt: 'my diagram #1' });
    expect(second.src).toBe('assets/my diagram #1-2.png');
    expect(await fs.readFile(path.join(directory, first.src!), 'utf8')).toBe('image-data');
    expect(await fs.readFile(path.join(directory, second.src!), 'utf8')).toBe('image-data');

    const markdown = resourceMarkdown({ url: first.src!, label: first.alt!, mode: 'image' });
    expect(renderMarkdown(markdown).html).toContain('<img src="assets/my diagram #1.png" alt="my diagram #1">');
  });

  it('rejects unsupported image files and symbolic-link asset directories', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mdwork-image-test-'));
    temporaryDirectories.push(directory);
    const documentPath = path.join(directory, 'document.md');
    const textPath = path.join(directory, 'not-image.txt');
    await fs.writeFile(documentPath, '# Test');
    await fs.writeFile(textPath, 'not an image');
    await expect(copyImageToAssets(documentPath, textPath)).rejects.toThrow('请选择');

    const sourcePath = path.join(directory, 'image.png');
    const target = path.join(directory, 'target');
    await fs.writeFile(sourcePath, 'image-data');
    await fs.mkdir(target);
    await fs.symlink(target, path.join(directory, 'assets'));
    await expect(copyImageToAssets(documentPath, sourcePath)).rejects.toThrow('符号链接');
  });

  it('resolves local file and folder links only inside the document directory', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mdwork-link-test-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mdwork-link-outside-'));
    temporaryDirectories.push(directory, outside);
    const documentPath = path.join(directory, 'document.md');
    const assets = path.join(directory, 'assets');
    const filePath = path.join(assets, 'report final.pdf');
    const hashPath = path.join(assets, 'a#b.txt');
    const outsidePath = path.join(outside, 'secret.txt');
    await fs.mkdir(assets);
    await fs.writeFile(documentPath, '# Test');
    await fs.writeFile(filePath, 'pdf');
    await fs.writeFile(hashPath, 'hash');
    await fs.writeFile(outsidePath, 'secret');

    expect(await resolveLocalResourcePath(documentPath, 'assets/report%20final.pdf#page=2')).toBe(await fs.realpath(filePath));
    expect(await resolveLocalResourcePath(documentPath, 'assets/a%23b.txt')).toBe(await fs.realpath(hashPath));
    expect(await resolveLocalResourcePath(documentPath, 'assets/')).toBe(await fs.realpath(assets));
    await expect(resolveLocalResourcePath(documentPath, `../${path.basename(outside)}/secret.txt`))
      .rejects.toThrow('目录之外');
    await fs.symlink(outsidePath, path.join(assets, 'escape.txt'));
    await expect(resolveLocalResourcePath(documentPath, 'assets/escape.txt')).rejects.toThrow('目录之外');
  });

  it('creates embedded image and link-only Markdown for URLs', () => {
    const image = resourceMarkdown({
      url: 'https://example.com/a b(1).png', label: 'A [diagram]', mode: 'image',
    });
    expect(image).toBe('![A \\[diagram\\]](<https://example.com/a b(1).png>)');
    expect(renderMarkdown(image).html).toContain('<img src="https://example.com/a b(1).png" alt="A [diagram]">');

    const link = resourceMarkdown({
      url: 'https://example.com/docs', label: '打开文档', mode: 'link',
    });
    expect(link).toBe('[打开文档](<https://example.com/docs>)');
    expect(renderMarkdown(link).html).toContain('<a href="https://example.com/docs">打开文档</a>');
  });
});
