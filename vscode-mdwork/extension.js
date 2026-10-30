const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vscode = require('vscode');
const { renderMarkdown } = require('../src/markdown/renderMarkdown');

const panels = new Map();

function decodeAttribute(value) {
  return value.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ({
    '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>',
  })[entity]);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function imageResources(document, webview) {
  const resources = {};
  if (document.isUntitled) return resources;
  const documentDirectory = path.dirname(document.uri.fsPath);
  let realDirectory;
  try {
    realDirectory = fs.realpathSync(documentDirectory);
  } catch {
    return resources;
  }

  const html = renderMarkdown(document.getText()).html;
  for (const match of html.matchAll(/<img\s+[^>]*\bsrc="([^"]*)"[^>]*>/g)) {
    const source = decodeAttribute(match[1]);
    if (!source || /^(?:https?:|data:|mdwork-asset:|file:)/i.test(source)) continue;
    try {
      const requested = path.isAbsolute(source) ? source : path.resolve(documentDirectory, source);
      const realPath = fs.realpathSync(requested);
      if (!isInside(realDirectory, realPath) || !fs.statSync(realPath).isFile()) continue;
      resources[source] = webview.asWebviewUri(vscode.Uri.file(realPath)).toString();
    } catch {
      // Missing or inaccessible images remain broken-image placeholders.
    }
  }
  return resources;
}

function updatePanel(document, panel) {
  panel.webview.postMessage({
    type: 'update',
    text: document.getText(),
    images: imageResources(document, panel.webview),
  });
}

function resolveLocalResource(document, href) {
  if (document.isUntitled || typeof href !== 'string' || !href || href.length > 4096) {
    throw new Error('Save the document before opening relative links.');
  }
  const encodedPath = href.split(/[?#]/, 1)[0];
  const source = decodeURIComponent(encodedPath);
  const documentDirectory = path.dirname(document.uri.fsPath);
  const requested = path.isAbsolute(source) ? source : path.resolve(documentDirectory, source);
  const realDirectory = fs.realpathSync(documentDirectory);
  const realPath = fs.realpathSync(requested);
  if (!source || !isInside(realDirectory, realPath)) throw new Error('Local links must stay inside the document directory.');
  return realPath;
}

function previewHtml(webview, extensionUri) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'preview.bundle.js'));
  const baseStyle = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'preview.css'));
  const markdownStyle = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'markdown.css'));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: https: http:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} data:; object-src 'none'; base-uri 'none'; form-action 'none'">
  <link rel="stylesheet" href="${baseStyle}">
  <link rel="stylesheet" href="${markdownStyle}">
  <title>MDWork Preview</title>
</head>
<body>
  <main id="root" class="markdown-preview" aria-label="MDWork Markdown preview"></main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

function openPreview(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    void vscode.window.showInformationMessage('Open a Markdown file before starting MDWork Preview.');
    return;
  }
  const document = editor.document;
  const key = document.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside);
    updatePanel(document, existing);
    return;
  }

  const localResourceRoots = [context.extensionUri];
  if (!document.isUntitled) {
    const documentDirectory = fs.realpathSync(path.dirname(document.uri.fsPath));
    localResourceRoots.push(vscode.Uri.file(documentDirectory));
  }
  const panel = vscode.window.createWebviewPanel('mdwork.preview', `MDWork: ${path.basename(document.fileName)}`, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
  }, {
    enableScripts: true,
    localResourceRoots,
    retainContextWhenHidden: true,
  });
  panels.set(key, panel);
  panel.webview.html = previewHtml(panel.webview, context.extensionUri);
  let timer;
  const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== key) return;
    clearTimeout(timer);
    timer = setTimeout(() => updatePanel(event.document, panel), 150);
  });
  panel.webview.onDidReceiveMessage((message) => {
    if (message?.type === 'ready') updatePanel(document, panel);
    if (message?.type === 'revealLine' && Number.isInteger(message.line)) {
      const target = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === key);
      if (target) {
        const line = Math.min(target.document.lineCount - 1, Math.max(0, message.line - 1));
        const position = new vscode.Position(line, 0);
        target.selection = new vscode.Selection(position, position);
        target.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    }
    if (message?.type === 'openLocal' && typeof message.href === 'string') {
      void (async () => {
        const resource = resolveLocalResource(document, message.href);
        const uri = vscode.Uri.file(resource);
        if (fs.statSync(resource).isDirectory()) {
          await vscode.commands.executeCommand('revealFileInOS', uri);
        } else if (/\.(?:md|markdown|mdown|mkd|txt)$/i.test(resource)) {
          await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One });
        } else {
          await vscode.env.openExternal(uri);
        }
      })().catch((error) => vscode.window.showErrorMessage(`MDWork: ${error.message}`));
    }
    if (message?.type === 'open' && typeof message.href === 'string') {
      try {
        const url = new URL(message.href);
        if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          void vscode.env.openExternal(vscode.Uri.parse(url.toString()));
        }
      } catch {
        // Ignore malformed links.
      }
    }
  });
  panel.onDidDispose(() => {
    clearTimeout(timer);
    changeSubscription.dispose();
    panels.delete(key);
  });
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('mdwork.openPreview', () => openPreview(context)));
}

function deactivate() {
  panels.clear();
}

module.exports = { activate, deactivate };
