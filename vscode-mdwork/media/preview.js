import { renderMarkdown } from '../../src/markdown/renderMarkdown';
import { sanitizeMarkdown } from '../../src/markdown/sanitizeMarkdown';
import { renderMermaidDiagrams } from '../../src/markdown/renderMermaidDiagrams';
import { navigatePreviewFragment } from '../../src/markdown/previewNavigation';

const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
let revision = 0;

async function update(message) {
  const current = ++revision;
  const rendered = renderMarkdown(message.text);
  const sanitized = sanitizeMarkdown(rendered.html, null);
  const theme = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
    ? 'dark' : 'light';
  const html = await renderMermaidDiagrams(sanitized, theme);
  if (current !== revision) return;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('img').forEach((image) => {
    const source = image.getAttribute('src') ?? '';
    if (message.images[source]) image.setAttribute('src', message.images[source]);
  });
  root.innerHTML = parsed.body.innerHTML;
}

window.addEventListener('message', (event) => {
  if (event.data?.type === 'update') void update(event.data);
});

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('#')) {
    event.preventDefault();
    const result = navigatePreviewFragment(root, href);
    if (result.kind === 'line' && result.line) vscode.postMessage({ type: 'revealLine', line: result.line });
    return;
  }
  event.preventDefault();
  if (/^(?:https?:|mailto:)/i.test(href)) {
    vscode.postMessage({ type: 'open', href });
  } else if (href && !href.startsWith('//')
    && (!/^[a-z][a-z\d+.-]*:/i.test(href) || /^[a-z]:[\\/]/i.test(href))) {
    vscode.postMessage({ type: 'openLocal', href });
  }
});

vscode.postMessage({ type: 'ready' });
