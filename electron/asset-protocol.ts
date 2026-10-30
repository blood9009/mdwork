import { promises as fs } from 'node:fs';
import path from 'node:path';
import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

const allowedImageExtensions = new Set([
  '.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp',
]);

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'mdwork-asset',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

export function registerAssetProtocol(): void {
  protocol.handle('mdwork-asset', async (request) => {
    try {
      const url = new URL(request.url);
      const sourcePath = url.searchParams.get('base');
      const source = url.searchParams.get('src');
      if (!sourcePath || !source || url.hostname !== 'image') {
        return new Response('Invalid asset request', { status: 400 });
      }

      const documentDirectory = path.dirname(path.resolve(sourcePath));
      const requestedPath = path.isAbsolute(source)
        ? path.resolve(source)
        : path.resolve(documentDirectory, source);
      const [realDirectory, realPath] = await Promise.all([
        fs.realpath(documentDirectory),
        fs.realpath(requestedPath),
      ]);

      if (!isInside(realDirectory, realPath) || !allowedImageExtensions.has(path.extname(realPath).toLowerCase())) {
        return new Response('Asset is outside the document directory', { status: 403 });
      }

      return await net.fetch(pathToFileURL(realPath).toString());
    } catch {
      return new Response('Asset not found', { status: 404 });
    }
  });
}
