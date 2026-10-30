const { app, BrowserWindow, dialog } = require('electron');
const { mkdtempSync, writeFileSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const outputDirectory = mkdtempSync(path.join(tmpdir(), 'mdwork-editor-smoke-'));
const alphaPath = path.join(outputDirectory, 'alpha.md');
const betaPath = path.join(outputDirectory, 'beta.md');
const largePath = path.join(outputDirectory, 'large.md');
const pdfPath = path.join(outputDirectory, 'smoke.pdf');
app.setPath('userData', path.join(outputDirectory, 'user-data'));
writeFileSync(alphaPath, '# Alpha\n\nspace  space\n\tTabbed\n\n**worker preview**\n', 'utf8');
writeFileSync(betaPath, '# Beta\n\n```mermaid\nflowchart LR\n  A[Beta] --> B[PDF]\n```\n', 'utf8');
writeFileSync(largePath, `# Large\n\n${'x'.repeat(1_020_000)}\n`, 'utf8');
const openPaths = [alphaPath, betaPath, largePath];
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPaths.shift()] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdfPath });
delete process.env.VITE_DEV_SERVER_URL;
require(path.join(__dirname, '../dist/electron/main.js'));

const checks = [];
const consoleErrors = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail || 'failed'}`);
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run() {
  await app.whenReady();
  await delay(500);
  const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.isDestroyed());
  if (!window) throw new Error('Main application window was not created');
  window.webContents.on('console-message', (_event, level, message) => {
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
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`);

  await waitFor(`document.querySelectorAll('.editor-group').length === 1 && !!document.querySelector('.monaco-container textarea')`);
  check('production renderer loaded', true, window.webContents.getURL());
  await evaluate(`document.querySelector('.document-tab-close').click()`);

  for (const expected of ['alpha.md', 'beta.md', 'large.md']) {
    check(`click Open ${expected}`, await clickButton('打开'));
    await waitFor(`[...document.querySelectorAll('.editor-group.active .document-tab')].some((tab) => tab.textContent.includes(${JSON.stringify(expected)}))`);
  }
  check('three loaded document tabs', await evaluate(`document.querySelectorAll('.editor-group.active .document-tab').length === 3`));

  await evaluate(`[...document.querySelectorAll('.editor-group.active .document-tab-select')].find((tab) => tab.textContent.includes('alpha.md')).click()`);
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview h1')?.textContent === 'Alpha'`);
  check('Markdown worker preview', true);
  check('hidden character toggle', await clickButton('¶ 隐藏字符'));
  await waitFor(`document.querySelector('.workspace-toolbar .active-tool')?.textContent.includes('隐藏字符')`);
  await waitFor(`(() => {
    const editor = document.querySelector('.editor-group.active .monaco-editor');
    if (!editor) return false;
    const circles = editor.querySelectorAll('.view-overlays svg circle');
    const arrows = editor.querySelectorAll('.view-overlays svg path');
    return circles.length >= 4 && arrows.length >= 1
      && [...circles, ...arrows].every((marker) => marker.getBoundingClientRect().width > 0);
  })()`);
  const whitespaceMarkers = await evaluate(`(() => {
    const editor = document.querySelector('.editor-group.active .monaco-editor');
    return { spaces: editor.querySelectorAll('.view-overlays svg circle').length,
      tabs: editor.querySelectorAll('.view-overlays svg path').length };
  })()`);
  check('Monaco renders visible space and tab markers', true, JSON.stringify(whitespaceMarkers));
  const whitespaceScreenshot = path.join(outputDirectory, 'whitespace.png');
  writeFileSync(whitespaceScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));

  await evaluate(`[...document.querySelectorAll('.editor-group.active .document-tab-select')].find((tab) => tab.textContent.includes('large.md')).click()`);
  await waitFor(`document.querySelector('.large-file-badge')?.textContent.includes('大文件')`);
  await waitFor(`document.querySelector('.editor-group.active .preview-notice')?.textContent.includes('实时预览已暂停')`);
  check('large file starts with paused preview', true, `${statSync(largePath).size} bytes`);
  check('manual large preview refresh', await evaluate(`(() => { const button = document.querySelector('.editor-group.active .preview-notice button'); if (!button) return false; button.click(); return true; })()`));
  await waitFor(`document.querySelector('.editor-group.active .markdown-preview h1')?.textContent === 'Large'`, 60_000);
  check('large file manual preview rendered', true);

  for (const label of ['向右分栏', '向下分栏', '向右分栏', '向右分栏', '向下分栏']) {
    check(`click ${label}`, await clickButton(label));
    await delay(100);
  }
  check('4 × 3 editor grid', await evaluate(`document.querySelectorAll('.editor-group').length === 12`));
  check('split limits disable controls', await evaluate(`[...document.querySelectorAll('.workspace-toolbar button')].filter((button) => ['向右分栏', '向下分栏'].includes(button.textContent.trim())).every((button) => button.disabled)`));

  await evaluate(`(() => {
    const group = document.querySelectorAll('.editor-group')[0];
    [...group.querySelectorAll('.document-tab-select')].find((tab) => tab.textContent.includes('alpha.md')).click();
  })()`);
  await evaluate(`(() => {
    const group = document.querySelectorAll('.editor-group')[1];
    [...group.querySelectorAll('.document-tab-select')].find((tab) => tab.textContent.includes('beta.md')).click();
  })()`);
  await delay(400);
  check('groups show different documents', await evaluate(`(() => {
    const groups = document.querySelectorAll('.editor-group');
    return groups[0].querySelector('.document-tab.active').textContent.includes('alpha.md')
      && groups[1].querySelector('.document-tab.active').textContent.includes('beta.md');
  })()`));
  const gridScreenshot = path.join(outputDirectory, 'editor-grid.png');
  writeFileSync(gridScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));

  await evaluate(`(() => {
    const group = document.querySelectorAll('.editor-group')[1];
    [...group.querySelectorAll('.document-tab-select')].find((tab) => tab.textContent.includes('alpha.md')).click();
  })()`);
  await waitFor(`(() => {
    const groups = document.querySelectorAll('.editor-group');
    return groups[0].querySelector('.document-tab.active').textContent.includes('alpha.md')
      && groups[1].querySelector('.document-tab.active').textContent.includes('alpha.md');
  })()`);
  await evaluate(`document.querySelectorAll('.editor-group')[0].querySelector('.monaco-container textarea').focus()`);
  window.webContents.insertText('\nSHARED_SPLIT_SYNC');
  await waitFor(`(() => {
    const groups = document.querySelectorAll('.editor-group');
    return groups[0].querySelector('.view-lines').textContent.includes('SHARED_SPLIT_SYNC')
      && groups[1].querySelector('.view-lines').textContent.includes('SHARED_SPLIT_SYNC');
  })()`);
  check('same file edits synchronize across groups', true);

  await evaluate(`(() => {
    const group = document.querySelectorAll('.editor-group')[0];
    const tab = [...group.querySelectorAll('.document-tab')].find((item) => item.textContent.includes('alpha.md'));
    tab.querySelector('.document-tab-close').click();
  })()`);
  await waitFor(`(() => {
    const groups = document.querySelectorAll('.editor-group');
    return groups.length === 12
      && groups[0].querySelector('.document-tab.active').textContent.includes('beta.md')
      && ![...groups[0].querySelectorAll('.document-tab')].some((tab) => tab.textContent.includes('alpha.md'))
      && groups[1].querySelector('.document-tab.active').textContent.includes('alpha.md')
      && groups[1].querySelector('.view-lines').textContent.includes('SHARED_SPLIT_SYNC');
  })()`);
  check('close removes only the current group view and selects adjacent tab', true);

  const removedGroupId = await evaluate(`document.querySelectorAll('.editor-group')[11].dataset.groupId`);
  for (let index = 0; index < 3; index += 1) {
    await evaluate(`(() => {
      const groups = document.querySelectorAll('.editor-group');
      groups[groups.length - 1].querySelector('.document-tab-close').click();
    })()`);
    await delay(200);
  }
  await waitFor(`document.querySelectorAll('.editor-group').length === 11`);
  check('empty split is removed automatically', await evaluate(`(() => {
    return ![...document.querySelectorAll('.editor-group')].some((group) => group.dataset.groupId === ${JSON.stringify(removedGroupId)})
      && !!document.querySelector('.editor-group.active')
      && !document.querySelector('.empty-editor-group');
  })()`));

  check('reset to one group', await clickButton('单栏'));
  await waitFor(`document.querySelectorAll('.editor-group').length === 1`);
  await evaluate(`[...document.querySelectorAll('.editor-group.active .document-tab-select')].find((tab) => tab.textContent.includes('beta.md')).click()`);
  await waitFor(`document.querySelector('.editor-group.active .mermaid-diagram svg')`);
  check('open PDF export dialog', await clickButton('导出 PDF'));
  await waitFor(`!!document.querySelector('.modal')`);
  check('start PDF export', await clickButton('选择位置并导出'));
  await waitFor(`!document.querySelector('.modal')`, 60_000);
  const pdfSize = statSync(pdfPath).size;
  check('real PDF file generated', pdfSize > 1000, `${pdfSize} bytes`);
  check('no disposed model errors', !consoleErrors.some((message) => /disposed|文档模型不存在/i.test(message)), consoleErrors.join('\n'));

  const report = { outputDirectory, checks, consoleErrors, whitespaceScreenshot, gridScreenshot, pdfPath, pdfSize };
  writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(0);
}

run().catch(async (error) => {
  console.error(error);
  const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.isDestroyed());
  let failureScreenshot = null;
  if (window) {
    failureScreenshot = path.join(outputDirectory, 'failure.png');
    writeFileSync(failureScreenshot, await window.webContents.capturePage().then((image) => image.toPNG()));
  }
  const debug = window ? await window.webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('.editor-group.active .monaco-editor');
    return {
      activeGroup: document.querySelector('.editor-group.active')?.dataset.groupId,
      activeTab: document.querySelector('.editor-group.active .document-tab.active')?.textContent,
      notice: document.querySelector('.editor-group.active .preview-notice')?.textContent,
      status: document.querySelector('.statusbar')?.textContent,
      diagramCount: document.querySelectorAll('.editor-group.active .mermaid-diagram svg').length,
      whitespaceMarkers: {
        spaces: editor?.querySelectorAll('.view-overlays svg circle').length ?? 0,
        tabs: editor?.querySelectorAll('.view-overlays svg path').length ?? 0,
      },
      overlaysHtml: document.querySelector('.editor-group.active .view-overlays')?.innerHTML.slice(0, 1500),
    };
  })()`, true) : null;
  console.error(JSON.stringify({ outputDirectory, checks, consoleErrors, failureScreenshot, debug }, null, 2));
  app.exit(1);
});
