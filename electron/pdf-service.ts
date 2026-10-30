import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import sanitizeHtml from 'sanitize-html';
import type { PdfExportRequest, PdfExportResult, PdfOptions } from '../shared/contracts';
import { atomicWriteFile } from './file-service';

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function safeFontFamily(value: string, fallback: string): string {
  const font = value.trim().slice(0, 100);
  return /^[\p{L}\p{N} _-]+$/u.test(font) ? font : fallback;
}

function normalizedOptions(options: PdfOptions): PdfOptions {
  const themes = ['default', 'clean', 'academic', 'technical'];
  return {
    theme: themes.includes(options.theme) ? options.theme : 'default',
    pageSize: options.pageSize === 'Letter' ? 'Letter' : 'A4',
    orientation: options.orientation === 'landscape' ? 'landscape' : 'portrait',
    fontFamily: safeFontFamily(options.fontFamily, 'sans-serif'),
    codeFontFamily: safeFontFamily(options.codeFontFamily, 'monospace'),
    fontSize: Math.min(24, Math.max(8, Number(options.fontSize) || 11)),
    lineHeight: Math.min(2.5, Math.max(1.1, Number(options.lineHeight) || 1.7)),
    margin: Math.min(40, Math.max(8, Number(options.margin) || 20)),
    showPageNumbers: Boolean(options.showPageNumbers),
    showToc: Boolean(options.showToc),
    printBackground: Boolean(options.printBackground),
  };
}

const themeStyles = {
  default: 'color: #24292f; h1, h2 { border-bottom: 1px solid #d8dee4; }',
  clean: 'color: #18181b; h1, h2, h3 { border: 0; font-weight: 600; }',
  academic: 'color: #1f2328; text-align: justify; h1, h2, h3 { text-align: left; border: 0; font-family: inherit; }',
  technical: 'color: #172033; h1, h2 { color: #173f73; border-bottom-color: #9db7d5; } code { color: #9d2b65; }',
};

function exportStyles(options: PdfOptions): string {
  return `
    @page { size: ${options.pageSize} ${options.orientation}; margin: ${options.margin}mm; }
    * { box-sizing: border-box; }
    body { margin: 0 auto; max-width: 100%; font-family: "${options.fontFamily}", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: ${options.fontSize}pt; line-height: ${options.lineHeight}; overflow-wrap: anywhere; }
    ${themeStyles[options.theme]}
    h1, h2, h3, h4, h5, h6 { line-height: 1.35; break-after: avoid-page; page-break-after: avoid; }
    h1 { font-size: 2em; padding-bottom: .3em; }
    h2 { font-size: 1.5em; padding-bottom: .25em; }
    p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
    a { color: #0969da; text-decoration: none; }
    blockquote { padding: .1em 1em; color: #59636e; border-left: 4px solid #d0d7de; break-inside: avoid; }
    code { font-family: "${options.codeFontFamily}", Menlo, Consolas, monospace; font-size: .88em; background: #f3f4f6; border-radius: 4px; padding: .15em .35em; }
    pre { padding: 14px; background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid-page; }
    pre code { padding: 0; background: transparent; color: inherit; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #d0d7de; padding: 6px 10px; text-align: left; }
    th { background: #f3f4f6; }
    img { max-width: 100%; height: auto; break-inside: avoid; }
    img.image-left { float: left; width: 40%; margin: .2em 1.4em .8em 0; }
    img.image-right { float: right; width: 40%; margin: .2em 0 .8em 1.4em; }
    img.image-center { display: block; width: 60%; margin: 1em auto; }
    .image-clear { clear: both; height: 0; margin: 0 0 1em; }
    .mermaid-diagram { margin: 1em 0; text-align: center; break-inside: avoid-page; }
    .mermaid-diagram .mermaid-svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
    .mermaid-source { text-align: left; }
    .mermaid-error { padding: 12px; border: 1px solid #d1242f; color: #d1242f; white-space: pre-wrap; }
    .layer-diagram { --layer-ink: #30343b; --layer-border: #59636e; --layer-arrow: #7b838d; margin: 1.4em 0; color: var(--layer-ink); line-height: 1.5; }
    .layer-row, .layer-connector { display: grid; grid-template-columns: minmax(64px, 88px) 24px minmax(0, 1fr); column-gap: 12px; }
    .layer-row { break-inside: avoid-page; }
    .layer-label { display: grid; place-items: center; min-height: 80px; padding: 14px 8px; border: 1px solid var(--layer-border); border-radius: 5px; background: var(--layer-label-bg); font-weight: 650; text-align: center; overflow-wrap: anywhere; }
    .layer-side-arrow { position: relative; align-self: center; height: 24px; }
    .layer-side-arrow::before { content: ""; position: absolute; top: 50%; left: 0; width: 17px; border-top: 2px solid var(--layer-arrow); }
    .layer-side-arrow::after { content: ""; position: absolute; top: calc(50% - 6px); right: 1px; width: 12px; height: 12px; border-top: 2px solid var(--layer-arrow); border-right: 2px solid var(--layer-arrow); transform: rotate(45deg); }
    .layer-panel { min-width: 0; padding: 16px; border: 2px dashed var(--layer-border); }
    .layer-title, .layer-group-title { font-weight: 650; text-align: center; overflow-wrap: anywhere; }
    .layer-title { margin: 0 0 14px; font-size: 1.08em; }
    .layer-group-title { margin: 0 0 10px; }
    .layer-groups, .layer-items { display: grid; gap: 9px; }
    .layer-columns-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    .layer-columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .layer-columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .layer-columns-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .layer-item-span-2 { grid-column: span 2; }
    .layer-item-span-3 { grid-column: span 3; }
    .layer-item-span-4 { grid-column: span 4; }
    .layer-group { min-width: 0; padding: 12px; border: 1px solid var(--layer-border); background: var(--layer-group-bg); }
    .layer-item { min-width: 0; padding: 9px 8px; border: 1px solid var(--layer-border); background: var(--layer-item-bg); text-align: center; overflow-wrap: anywhere; }
    .layer-tone-green { --layer-label-bg: #a5d685; --layer-group-bg: #e6f0dc; --layer-item-bg: #f2f7ed; }
    .layer-tone-yellow { --layer-label-bg: #e7d98b; --layer-group-bg: #eee6ba; --layer-item-bg: #f7f2dc; }
    .layer-tone-orange { --layer-label-bg: #e8b477; --layer-group-bg: #ecd3b7; --layer-item-bg: #f7ebdd; }
    .layer-tone-red { --layer-label-bg: #e3a1a1; --layer-group-bg: #e9c1c1; --layer-item-bg: #f6e4e4; }
    .layer-tone-blue { --layer-label-bg: #9fc5e8; --layer-group-bg: #d6e6f3; --layer-item-bg: #edf4f9; }
    .layer-tone-purple { --layer-label-bg: #c4addd; --layer-group-bg: #e2d7ec; --layer-item-bg: #f2edf6; }
    .layer-links { display: grid; gap: 10px; margin-top: 16px; }
    .layer-link { display: grid; grid-template-columns: minmax(50px, 1fr) minmax(90px, 2fr) minmax(50px, 1fr); align-items: end; gap: 10px; font-size: .9em; }
    .layer-link-source { text-align: right; }
    .layer-link-source, .layer-link-target, .layer-link-label { overflow-wrap: anywhere; }
    .layer-link-relation { min-width: 0; text-align: center; }
    .layer-link-label { display: block; margin-bottom: 5px; }
    .layer-link-line { position: relative; display: block; height: 8px; border-top: 2px solid var(--layer-ink); }
    .layer-link-line::before, .layer-link-line::after { position: absolute; top: -6px; width: 10px; height: 10px; }
    .layer-link-forward::after, .layer-link-both::after { content: ""; right: 0; border-top: 2px solid var(--layer-ink); border-right: 2px solid var(--layer-ink); transform: rotate(45deg); }
    .layer-link-backward::before, .layer-link-both::before { content: ""; left: 0; border-bottom: 2px solid var(--layer-ink); border-left: 2px solid var(--layer-ink); transform: rotate(45deg); }
    .layer-connector { height: 32px; break-after: avoid-page; }
    .layer-connector::before { content: ""; grid-column: 3; grid-row: 1; align-self: start; justify-self: center; width: 0; height: 21px; border-left: 2px solid var(--layer-arrow); }
    .layer-connector::after { content: ""; grid-column: 3; grid-row: 1; align-self: end; justify-self: center; width: 12px; height: 12px; margin-bottom: 3px; border-right: 2px solid var(--layer-arrow); border-bottom: 2px solid var(--layer-arrow); transform: rotate(45deg); }
    .layer-diagram-error { padding: 12px; border: 1px solid #d1242f; color: #d1242f; white-space: pre-wrap; }
    hr { border: 0; border-top: 1px solid #d0d7de; margin: 2em 0; }
    input[type="checkbox"] { margin-right: .45em; }
    .export-title { font-size: 2.1em; border: 0; margin: 0 0 1.2em; }
    .export-toc { break-after: page; page-break-after: always; }
    .export-toc ul { list-style: none; padding-left: 0; }
    .export-toc li { margin: .35em 0; }
    .export-toc .toc-level-2 { padding-left: 1.5em; }
    .export-toc .toc-level-3, .export-toc .toc-level-4, .export-toc .toc-level-5, .export-toc .toc-level-6 { padding-left: 3em; }
    .hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #cf222e; }
    .hljs-string, .hljs-attr, .hljs-template-tag { color: #0a3069; }
    .hljs-comment, .hljs-quote { color: #6e7781; }
    .hljs-number, .hljs-symbol { color: #0550ae; }
    .hljs-title, .hljs-name { color: #8250df; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;
}

function cleanBodyHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'input', 'del'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['class', 'id', 'data-source-line'],
      a: ['href', 'name', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'style'],
      input: ['type', 'checked', 'disabled'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'mdwork-asset', 'data'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['http', 'https', 'data', 'mdwork-asset'],
    },
    allowProtocolRelative: false,
    allowedStyles: {
      img: {
        width: [/^(?:[1-9]\d?|100)%$/, /^(?:[1-9]\d{0,2}|1\d{3}|2000)px$/],
      },
    },
  });
}

function createExportHtml(request: PdfExportRequest, options: PdfOptions): string {
  const headings = request.headings.slice(0, 500);
  const toc = options.showToc && headings.length > 0
    ? `<nav class="export-toc"><h1>目录</h1><ul>${headings.map((heading) =>
        `<li class="toc-level-${Math.min(6, Math.max(1, heading.level))}"><a href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
      ).join('')}</ul></nav>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src mdwork-asset: data: https: http:; style-src 'unsafe-inline'; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(request.title)}</title>
  <style>${exportStyles(options)}</style>
</head>
<body>
  <h1 class="export-title">${escapeHtml(request.title)}</h1>
  ${toc}
  <main>${cleanBodyHtml(request.bodyHtml)}</main>
</body>
</html>`;
}

export async function renderPdf(request: PdfExportRequest, outputPath: string): Promise<void> {
  const options = normalizedOptions(request.options);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mdwork-pdf-'));
  const htmlPath = path.join(temporaryDirectory, `${randomUUID()}.html`);
  let exporter: BrowserWindow | null = null;

  try {
    await fs.writeFile(htmlPath, createExportHtml(request, options), 'utf8');
    exporter = new BrowserWindow({
      show: false,
      width: 1000,
      height: 800,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    await exporter.loadFile(htmlPath);
    await Promise.race([
      exporter.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          });
        }));
      })()`),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PDF 资源加载超时，请检查文档图片。')), 20_000);
      }),
    ]);

    const pdf = await exporter.webContents.printToPDF({
      pageSize: options.pageSize,
      landscape: options.orientation === 'landscape',
      printBackground: options.printBackground,
      preferCSSPageSize: true,
      displayHeaderFooter: options.showPageNumbers,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#687078;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    await atomicWriteFile(outputPath, pdf);
  } finally {
    exporter?.destroy();
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function exportPdf(
  owner: BrowserWindow,
  request: PdfExportRequest,
): Promise<PdfExportResult> {
  const baseName = request.sourcePath
    ? path.basename(request.sourcePath, path.extname(request.sourcePath))
    : request.title || '未命名';
  const save = await dialog.showSaveDialog(owner, {
    defaultPath: `${baseName}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (save.canceled || !save.filePath) return { canceled: true };
  await renderPdf(request, save.filePath);
  return { canceled: false, path: save.filePath };
}
