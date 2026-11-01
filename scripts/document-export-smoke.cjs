const { app, BrowserWindow, dialog } = require('electron');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { strFromU8, unzipSync } = require('fflate');
const mammoth = require('mammoth');

const outputDirectory = mkdtempSync(path.join(tmpdir(), 'mdwork-document-export-smoke-'));
const assetsDirectory = path.join(outputDirectory, 'assets');
mkdirSync(assetsDirectory);
const sourcePath = path.join(outputDirectory, 'export-source.md');
const docxPath = path.join(outputDirectory, 'export-result.docx');
const canceledPath = path.join(outputDirectory, 'canceled.docx');
const openDialogResults = [];
const saveDialogResults = [];
const checks = [];
const consoleErrors = [];

const markdown = `# DOCX 导出报告

这是一段 **粗体**、*斜体*、<u>下划线</u>、~~删除线~~ 和 [MDWork](https://github.com/blood9009/mdwork)。

<span style="font-family: PingFang SC; font-size: 18pt; color: #c2272d">彩色文字</span>

- 第一项
- 第二项

1. 有序一
2. 有序二

| 名称 | 状态 |
| --- | --- |
| DOCX | 完成 |

\`\`\`ts
const format = 'docx';
\`\`\`

![示例图片](assets/pixel.png)

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[DOCX]
\`\`\`
`;
writeFileSync(sourcePath, markdown);
writeFileSync(path.join(assetsDirectory, 'pixel.png'), Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

app.setPath('userData', path.join(outputDirectory, 'user-data'));
dialog.showOpenDialog = async () => {
  const result = openDialogResults.shift();
  if (!result) throw new Error('Unexpected open dialog');
  return result;
};
dialog.showSaveDialog = async () => {
  const result = saveDialogResults.shift();
  if (!result) throw new Error('Unexpected save dialog');
  return result;
};

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail || 'failed'}`);
}

function digest(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run() {
  const originalDigest = digest(sourcePath);
  delete process.env.VITE_DEV_SERVER_URL;
  require(path.join(__dirname, '../dist/electron/main.js'));
  await app.whenReady();
  await delay(500);
  const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.isDestroyed());
  if (!window) throw new Error('Main application window was not created');
  window.webContents.on('console-message', (_event, level, message) => {
    console.log(`Renderer console (${level}): ${message}`);
    if (level >= 3) consoleErrors.push(message);
  });
  const evaluate = (script) => window.webContents.executeJavaScript(script, true);
  const waitFor = async (script, timeout = 30_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await evaluate(script);
      if (value) return value;
      await delay(150);
    }
    throw new Error(`Timed out: ${script}`);
  };
  const clickButton = (text) => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);

  await waitFor(`!!document.querySelector('.monaco-container textarea')`);
  openDialogResults.push({ canceled: false, filePaths: [sourcePath] });
  check('open export fixture', await clickButton('打开'));
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview h1')?.textContent === 'DOCX 导出报告'`);
  check('grouped formatting toolbars visible', await evaluate(`document.querySelectorAll('.format-toolbar-row').length === 2
    && document.querySelectorAll('.format-group').length >= 4
    && !!document.querySelector('.format-font-select')
    && !!document.querySelector('.format-color input')`));

  saveDialogResults.push({ canceled: false, filePath: docxPath });
  check('open DOCX export dialog', await clickButton('导出 DOCX'));
  await waitFor(`document.querySelector('.modal-header')?.textContent.includes('DOCX')`);
  check('DOCX format selected', await evaluate(`document.querySelector('.modal select')?.value === 'docx'`));
  check('start DOCX export', await clickButton('选择位置并导出'));
  await waitFor(`!document.querySelector('.modal')`, 90_000);
  check('real DOCX file generated', statSync(docxPath).size > 5000, `${statSync(docxPath).size} bytes`);
  check('source Markdown unchanged', digest(sourcePath) === originalDigest);

  const archive = unzipSync(readFileSync(docxPath));
  const documentXml = strFromU8(archive['word/document.xml']);
  const relationships = strFromU8(archive['word/_rels/document.xml.rels']);
  const media = Object.keys(archive).filter((name) => name.startsWith('word/media/'));
  check('DOCX package contains document and styles', Boolean(archive['word/styles.xml'] && archive['[Content_Types].xml']));
  check('DOCX preserves headings and text formatting', documentXml.includes('DOCX 导出报告')
    && documentXml.includes('粗体') && documentXml.includes('<w:b')
    && documentXml.includes('<w:i') && documentXml.includes('<w:u') && documentXml.includes('<w:strike'));
  check('DOCX preserves font size and color', documentXml.includes('w:sz w:val="36"') && documentXml.includes('w:color w:val="C2272D"'));
  check('DOCX preserves table and code', documentXml.includes('<w:tbl>') && documentXml.includes('const format'));
  check('DOCX preserves hyperlink', relationships.includes('https://github.com/blood9009/mdwork'));
  check('DOCX embeds local and Mermaid images as PNG', media.length >= 2 && media.every((name) => name.endsWith('.png')), media.join(', '));
  check('DOCX ordered list numbering exists', Boolean(archive['word/numbering.xml'])
    && strFromU8(archive['word/numbering.xml']).includes('<w:numFmt w:val="decimal"/>')
    && /<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="2"\/><\/w:numPr>/.test(documentXml));

  const roundTrip = await mammoth.convertToHtml({ path: docxPath });
  check('Mammoth can read generated Word document', roundTrip.value.includes('DOCX 导出报告')
    && roundTrip.value.includes('<table>') && roundTrip.value.includes('<img')
    && roundTrip.value.includes('data:image/png;base64,'));
  check('Word hyperlink survives independent parser', roundTrip.value.includes('href="https://github.com/blood9009/mdwork"'));

  saveDialogResults.push({ canceled: true, filePath: canceledPath });
  check('retry DOCX export for cancellation', await clickButton('导出 DOCX'));
  await clickButton('选择位置并导出');
  const cancellationStart = Date.now();
  while (saveDialogResults.length && Date.now() - cancellationStart < 90_000) await delay(150);
  check('canceling DOCX save reaches system dialog', saveDialogResults.length === 0);
  check('canceling DOCX save writes no file', !existsSync(canceledPath));
  await clickButton('取消');
  await waitFor(`!document.querySelector('.modal')`);

  check('click bold formatting tool', await evaluate(`(() => {
    const button = document.querySelector('.format-bold');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`));
  await waitFor(`[...document.querySelectorAll('.editor-group.active .markdown-preview strong')].some((item) => item.textContent === '粗体文本')`);
  const shortcutModifier = process.platform === 'darwin' ? 'meta' : 'control';
  await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'B', modifiers: [shortcutModifier] });
  await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'B', modifiers: [shortcutModifier] });
  await waitFor(`![...document.querySelectorAll('.editor-group.active .markdown-preview strong')].some((item) => item.textContent === '粗体文本')`);
  check('Cmd/Ctrl+B keyboard shortcut toggles bold', true);
  check('apply underline to current selection', await evaluate(`(() => {
    const button = [...document.querySelectorAll('.format-toolbar button')].find((item) => item.getAttribute('aria-label')?.startsWith('下划线（'));
    if (!button) return false;
    button.click();
    return true;
  })()`));
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview u')?.textContent === '粗体文本'`);
  check('font size tool applies inline style', await evaluate(`(() => {
    const select = document.querySelector('.format-size-select');
    select.value = '18';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`));
  await waitFor(`[...document.querySelectorAll('.editor-group.active .markdown-preview span')].some((item) => item.style.fontSize === '18pt' && item.textContent === '粗体文本')`);
  check('font family tool applies inline style', await evaluate(`(() => {
    const select = document.querySelector('.format-font-select');
    const option = [...select.options].find((item) => item.value && item.value !== select.value);
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`));
  await waitFor(`[...document.querySelectorAll('.editor-group.active .markdown-preview span')].some((item) => item.style.fontFamily && item.textContent === '粗体文本')`);
  check('color tool applies inline style', await evaluate(`(() => {
    const input = document.querySelector('.format-color input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#316dca');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`));
  await waitFor(`[...document.querySelectorAll('.editor-group.active .markdown-preview span')].some((item) => item.style.color === 'rgb(49, 109, 202)' && item.textContent === '粗体文本')`);
  await waitFor(`!!document.querySelector('.editor-group.active .markdown-preview .mermaid-diagram svg')`);
  const screenshot = path.join(outputDirectory, 'formatting-toolbar.png');
  writeFileSync(screenshot, await window.webContents.capturePage().then((image) => image.toPNG()));
  check('toolbar editing does not save over source', digest(sourcePath) === originalDigest);

  const clickFormatButton = (label) => evaluate(`(() => {
    const button = [...document.querySelectorAll('.format-toolbar button')]
      .find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  const createEmptyDocument = async () => {
    check('create empty formatting fixture', await clickButton('新建'));
    await waitFor(`document.querySelector('.editor-group.active .document-tab.active')?.textContent.includes('未命名')
      && !document.querySelector('.editor-group.active .view-lines')?.innerText.trim()`);
  };
  await createEmptyDocument();
  check('heading tool inserts marker on empty line', await clickFormatButton('一级标题'));
  await waitFor(`document.querySelector('.editor-group.active .view-lines')?.innerText.trim() === '#'`);
  await createEmptyDocument();
  check('list tool inserts marker on empty line', await clickFormatButton('无序列表'));
  await waitFor(`document.querySelector('.editor-group.active .view-lines')?.innerText.trim() === '-'`);
  await createEmptyDocument();
  check('table tool inserts a real table', await clickFormatButton('插入三列表格'));
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview table thead')?.textContent.includes('列 1')`);
  await createEmptyDocument();
  check('code block tool inserts a code block', await clickFormatButton('代码块'));
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview pre code')?.textContent.trim() === '代码'`);
  await createEmptyDocument();
  check('thematic break tool inserts a divider', await clickFormatButton('插入水平分割线'));
  await waitFor(`!!document.querySelector('.editor-group.active .markdown-preview hr')`);
  check('block tools do not save over source', digest(sourcePath) === originalDigest);
  check('no unexpected dialogs remain', openDialogResults.length === 0 && saveDialogResults.length === 0);
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes('Canceled: Canceled'));
  check('no unexpected renderer errors', unexpectedConsoleErrors.length === 0, unexpectedConsoleErrors.join('\n'));

  const report = {
    outputDirectory, checks, consoleErrors, sourcePath, docxPath, screenshot,
    docxBytes: statSync(docxPath).size, media,
  };
  writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(0);
}

run().catch(async (error) => {
  console.error(error);
  const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.isDestroyed());
  let failureScreenshot = null;
  let debug = null;
  if (window) {
    failureScreenshot = path.join(outputDirectory, 'failure.png');
    writeFileSync(failureScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));
    debug = await window.webContents.executeJavaScript(`({
      status: document.querySelector('.status-bar')?.textContent,
      modal: document.querySelector('.modal')?.textContent,
      preview: document.querySelector('.editor-group.active .markdown-preview')?.textContent.slice(0, 1000),
    })`, true).catch(() => null);
  }
  console.error(JSON.stringify({ outputDirectory, checks, consoleErrors, failureScreenshot, debug }, null, 2));
  app.exit(1);
});
