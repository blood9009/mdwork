import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('vscode-mdwork/dist', { recursive: true });
await mkdir('release', { recursive: true });
await copyFile('src/styles/markdown.css', 'vscode-mdwork/media/markdown.css');

await Promise.all([
  build({
    entryPoints: ['vscode-mdwork/extension.js'],
    outfile: 'vscode-mdwork/dist/extension.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    sourcemap: true,
  }),
  build({
    entryPoints: ['vscode-mdwork/media/preview.js'],
    outfile: 'vscode-mdwork/media/preview.bundle.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    sourcemap: true,
  }),
]);
