const { app, BrowserWindow, dialog } = require('electron');
const {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} = require('docx');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { createHash } = require('node:crypto');
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const outputDirectory = mkdtempSync(path.join(tmpdir(), 'mdwork-document-import-smoke-'));
const wordPath = path.join(outputDirectory, 'report.docx');
const pdfPath = path.join(outputDirectory, 'guide.pdf');
const scannedPdfPath = path.join(outputDirectory, 'scanned.pdf');
const wordMarkdownPath = path.join(outputDirectory, 'word-result.md');
const pdfMarkdownPath = path.join(outputDirectory, 'pdf-result.md');
const canceledMarkdownPath = path.join(outputDirectory, 'canceled.md');
const openDialogResults = [];
const saveDialogResults = [];
const checks = [];
const consoleErrors = [];

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

async function createFixtures() {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const word = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('桌面导入报告')] }),
    new Paragraph({ children: [
      new TextRun({ text: '重要', bold: true }),
      new TextRun('内容，访问 '),
      new ExternalHyperlink({
        link: 'https://github.com/blood9009/mdwork',
        children: [new TextRun({ text: 'MDWork', style: 'Hyperlink' })],
      }),
    ] }),
    new Paragraph({ children: [new TextRun('第一项')], bullet: { level: 0 } }),
    new Paragraph({ children: [new TextRun('第二项')], bullet: { level: 0 } }),
    new Table({ rows: [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph('名称')] }),
        new TableCell({ children: [new Paragraph('状态')] }),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph('导入')] }),
        new TableCell({ children: [new Paragraph('完成')] }),
      ] }),
    ] }),
    new Paragraph({ children: [new ImageRun({
      type: 'png',
      data: pixel,
      transformation: { width: 1, height: 1 },
      altText: { name: 'pixel', description: '示例图片', title: '示例图片' },
    })] }),
  ] }] });
  writeFileSync(wordPath, await Packer.toBuffer(word));

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Desktop Import Guide', { x: 72, y: 730, size: 24, font });
  page.drawText('This paragraph is extracted from a real PDF', { x: 72, y: 680, size: 12, font });
  page.drawText('and joined across two lines.', { x: 72, y: 664, size: 12, font });
  page.drawText('- First item', { x: 72, y: 620, size: 12, font });
  page.drawText('- Second item', { x: 72, y: 604, size: 12, font });
  writeFileSync(pdfPath, await pdf.save());

  const scanned = await PDFDocument.create();
  scanned.addPage([612, 792]);
  writeFileSync(scannedPdfPath, await scanned.save());
}

async function run() {
  await createFixtures();
  const originalWordDigest = digest(wordPath);
  const originalPdfDigest = digest(pdfPath);
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
  await evaluate(`(() => {
    window.__importStatusMessages = [];
    const status = document.querySelector('.status-bar');
    new MutationObserver(() => {
      window.__importStatusMessages.push(status.textContent);
    }).observe(status, { childList: true, subtree: true, characterData: true });
  })()`);
  await evaluate(`document.querySelector('.document-tab-close')?.click()`);

  openDialogResults.push({ canceled: false, filePaths: [wordPath] });
  saveDialogResults.push({ canceled: false, filePath: wordMarkdownPath });
  check('click Import Word', await clickButton('导入 Word'));
  await waitFor(`document.querySelector('.editor-group.active .document-tab.active')?.textContent.includes('word-result.md')`, 60_000);
  const wordMarkdown = readFileSync(wordMarkdownPath, 'utf8');
  check('Word headings and formatting saved', wordMarkdown.includes('# 桌面导入报告') && wordMarkdown.includes('**重要**'));
  check('Word links saved', wordMarkdown.includes('[MDWork](https://github.com/blood9009/mdwork)'));
  check('Word lists saved', wordMarkdown.includes('- 第一项\n- 第二项'), wordMarkdown);
  check('Word table converted to GFM', wordMarkdown.includes('| 名称 | 状态 |\n| --- | --- |\n| 导入 | 完成 |') && !wordMarkdown.includes('<table>'), wordMarkdown);
  const assets = readdirSync(path.join(outputDirectory, 'assets'));
  check('Word image extracted through IPC', assets.length === 1 && assets[0].endsWith('.png'), assets.join(', '));
  check('Word image Markdown uses local asset', wordMarkdown.includes(`![示例图片](assets/${assets[0]})`), wordMarkdown);
  check('Word source unchanged', digest(wordPath) === originalWordDigest);
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview h1')?.textContent === '桌面导入报告'`);
  await waitFor(`(() => {
    const image = document.querySelector('.editor-group.active .markdown-preview img');
    return image?.complete && image.naturalWidth === 1;
  })()`);
  check('Word preview renders table and extracted image', await evaluate(`(() => {
    const preview = document.querySelector('.editor-group.active .markdown-preview');
    return preview?.querySelectorAll('table').length === 1 && preview.querySelector('img')?.naturalWidth === 1;
  })()`));
  const wordScreenshot = path.join(outputDirectory, 'word-import.png');
  writeFileSync(wordScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));

  const beforeConflict = readFileSync(wordMarkdownPath, 'utf8');
  openDialogResults.push({ canceled: false, filePaths: [wordPath] });
  saveDialogResults.push({ canceled: false, filePath: wordMarkdownPath });
  check('retry Word import for open-target conflict', await clickButton('导入 Word'));
  await waitFor(`window.__importStatusMessages.some((message) => message.includes('目标 Markdown 已在编辑器中打开'))`, 60_000);
  check('open target is not overwritten', readFileSync(wordMarkdownPath, 'utf8') === beforeConflict);

  openDialogResults.push({ canceled: false, filePaths: [wordPath] });
  saveDialogResults.push({ canceled: true, filePath: canceledMarkdownPath });
  check('retry Word import for cancellation', await clickButton('导入 Word'));
  await waitFor(`window.__importStatusMessages.some((message) => message.includes('已取消 Word 导入'))`, 60_000);
  check('canceling save writes no Markdown', !existsSync(canceledMarkdownPath));

  openDialogResults.push({ canceled: false, filePaths: [pdfPath] });
  saveDialogResults.push({ canceled: false, filePath: pdfMarkdownPath });
  check('click Import PDF', await clickButton('导入 PDF'));
  await waitFor(`document.querySelector('.editor-group.active .document-tab.active')?.textContent.includes('pdf-result.md')`, 60_000);
  const pdfMarkdown = readFileSync(pdfMarkdownPath, 'utf8');
  check('PDF heading and paragraph extracted', pdfMarkdown.includes('# Desktop Import Guide')
    && pdfMarkdown.includes('This paragraph is extracted from a real PDF and joined across two lines.'), pdfMarkdown);
  check('PDF list extracted', pdfMarkdown.includes('- First item\n- Second item'), pdfMarkdown);
  check('PDF source unchanged', digest(pdfPath) === originalPdfDigest);
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview h1')?.textContent === 'Desktop Import Guide'`);
  const pdfScreenshot = path.join(outputDirectory, 'pdf-import.png');
  writeFileSync(pdfScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));

  openDialogResults.push({ canceled: false, filePaths: [scannedPdfPath] });
  check('click scanned PDF import', await clickButton('导入 PDF'));
  await waitFor(`window.__importStatusMessages.some((message) => message.includes('OCR'))`, 60_000);
  check('scanned PDF produces no Markdown', !existsSync(path.join(outputDirectory, 'scanned.md')));
  check('no unexpected dialogs remain', openDialogResults.length === 0 && saveDialogResults.length === 0);
  check('no renderer conversion errors', consoleErrors.length === 0, consoleErrors.join('\n'));

  const report = {
    outputDirectory,
    checks,
    consoleErrors,
    wordPath,
    wordMarkdownPath,
    wordScreenshot,
    pdfPath,
    pdfMarkdownPath,
    pdfScreenshot,
    wordMarkdownBytes: statSync(wordMarkdownPath).size,
    pdfMarkdownBytes: statSync(pdfMarkdownPath).size,
  };
  writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(0);
}

run().catch(async (error) => {
  console.error(error);
  const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.isDestroyed());
  let failureScreenshot = null;
  let status = null;
  let statusMessages = [];
  if (window) {
    failureScreenshot = path.join(outputDirectory, 'failure.png');
    writeFileSync(failureScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));
    status = await window.webContents.executeJavaScript(`document.querySelector('.status-bar')?.textContent`, true);
    statusMessages = await window.webContents.executeJavaScript(`window.__importStatusMessages ?? []`, true);
  }
  console.error(JSON.stringify({ outputDirectory, checks, consoleErrors, failureScreenshot, status, statusMessages }, null, 2));
  app.exit(1);
});
