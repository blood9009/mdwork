import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'mdwork-mermaid-compatibility-'));
const reportPath = path.join(temporaryDirectory, 'report.json');

try {
  await build({
    entryPoints: [path.join(root, 'tests/browser/mermaid-compatibility.ts')],
    outfile: path.join(temporaryDirectory, 'compatibility.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'warning',
  });
  await writeFile(path.join(temporaryDirectory, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'">
  <title>Mermaid compatibility</title>
</head>
<body>
  <div id="render-sink" style="position:fixed;left:0;top:0;width:1200px;min-height:800px;pointer-events:none;opacity:0.01"></div>
  <script src="./compatibility.js"></script>
</body>
</html>`, 'utf8');

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath, [
    path.join(root, 'scripts/mermaid-compatibility-runner.cjs'), temporaryDirectory, reportPath,
  ], { cwd: root, env, stdio: 'inherit' });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, 240_000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  clearTimeout(timeout);
  if (timedOut) throw new Error('Mermaid browser compatibility test timed out');

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  for (const result of report.results) {
    if (result.ok) {
      console.log(`✓ ${result.id}: inline SVG + PDF image`);
    } else {
      console.error(`✗ ${result.id} (${result.title})`);
      for (const error of result.errors) console.error(`  ${error}`);
    }
  }
  if (report.staticInteraction.ok) console.log('✓ strict mode: Mermaid click JavaScript remains disabled');
  else for (const error of report.staticInteraction.errors) console.error(`✗ static interaction: ${error}`);
  console.log(`\n${report.passed}/${report.caseCount} built-in diagram cases passed real Chromium rendering.`);
  if (exitCode !== 0 || report.passed !== report.caseCount || !report.staticInteraction.ok) process.exitCode = 1;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
