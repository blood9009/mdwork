import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
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
          development ? "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173" : "connect-src 'none'",
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
