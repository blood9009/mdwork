import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const pdfJsDirectory = path.dirname(require.resolve('pdfjs-dist/package.json'));

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'mdwork-pdfjs-resources',
      generateBundle() {
        for (const directory of ['cmaps', 'standard_fonts']) {
          const sourceDirectory = path.join(pdfJsDirectory, directory);
          for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            this.emitFile({
              type: 'asset',
              fileName: `pdfjs/${directory}/${entry.name}`,
              source: readFileSync(path.join(sourceDirectory, entry.name)),
            });
          }
        }
      },
    },
    {
      name: 'mdwork-csp',
      transformIndexHtml() {
        const development = command === 'serve';
        const content = [
          "default-src 'self'",
          development ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "img-src 'self' data: blob: https: http: mdwork-asset:",
          "worker-src 'self' blob:",
          development ? "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173" : "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
        ].join('; ');

        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content },
            injectTo: 'head',
          },
        ];
      },
    },
  ],
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist/renderer', emptyOutDir: true },
}));
