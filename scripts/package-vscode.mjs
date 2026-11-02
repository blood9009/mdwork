import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDirectory = path.join(root, 'vscode-mdwork');
const manifest = JSON.parse(await readFile(path.join(extensionDirectory, 'package.json'), 'utf8'));
const vsce = path.join(extensionDirectory, 'node_modules', '@vscode', 'vsce', 'vsce');
const output = path.join(root, 'release', `MDWork-vscode-${manifest.version}.vsix`);

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [vsce, 'package', '--out', output], {
    cwd: extensionDirectory,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`VS Code 扩展打包失败（${signal ?? `退出码 ${code}`}）`));
  });
});
