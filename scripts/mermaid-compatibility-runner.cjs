const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const [directory, reportPath] = process.argv.slice(-2);
  if (!directory || !reportPath) throw new Error('Missing compatibility test paths');
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    width: 1400,
    height: 1000,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await window.loadFile(path.join(directory, 'index.html'));
  const report = await window.webContents.executeJavaScript('window.runMermaidCompatibility()', true);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  const failed = report.passed !== report.caseCount || !report.staticInteraction.ok;
  window.destroy();
  app.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  app.exit(2);
});
