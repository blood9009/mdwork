import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
} from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUniversalApp } from '@electron/universal';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const electronManifest = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8'));
const electronVersion = electronManifest.version;
const productName = manifest.build.productName;
const version = manifest.version;
const releaseVersion = manifest.releaseVersion ?? version;
const cacheDir = path.resolve(process.env.MDWORK_ELECTRON_CACHE
  ?? path.join(releaseDir, '.electron-cache'));
const builderCli = path.join(root, 'node_modules/electron-builder/out/cli/cli.js');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const arguments_ = new Set(process.argv.slice(2));
const targetFlags = ['--mac-universal', '--mac-arm64', '--win', '--vscode'];
const supportedFlags = new Set([...targetFlags, '--skip-tests', '--help']);
for (const argument of arguments_) {
  if (!supportedFlags.has(argument)) throw new Error(`未知参数：${argument}`);
}
if (arguments_.has('--help')) {
  console.log(`用法：npm run release -- [选项]\n\n${targetFlags.join('\n')}\n--skip-tests  跳过单元测试（仍执行类型检查和生产构建）\n\n不指定目标时生成全部发布文件。`);
  process.exit(0);
}
const selectedTargets = targetFlags.filter((flag) => arguments_.has(flag));
const allTargets = selectedTargets.length === 0;
const targets = {
  macUniversal: allTargets || arguments_.has('--mac-universal'),
  macArm64: allTargets || arguments_.has('--mac-arm64'),
  win: allTargets || arguments_.has('--win'),
  vscode: allTargets || arguments_.has('--vscode'),
};
if ((targets.macUniversal || targets.macArm64) && process.platform !== 'darwin') {
  throw new Error('macOS App 和 DMG 只能在 macOS 上构建');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 失败（${signal ?? `退出码 ${code}`}）`));
    });
  });
}

function output(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} 失败：${stderr || stdout}`));
    });
  });
}

async function download(url, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.download-${process.pid}`;
  await rm(temporary, { force: true });
  try {
    await run('curl', [
      '-fL', '--retry', '5', '--retry-all-errors', '--connect-timeout', '30',
      '--continue-at', '-', url, '-o', temporary,
    ]);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function ensureElectronArchive(platform, arch) {
  const filename = `electron-v${electronVersion}-${platform}-${arch}.zip`;
  const archive = path.join(cacheDir, filename);
  const checksums = path.join(cacheDir, 'SHASUMS256.txt');
  const baseUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}`;
  if (!existsSync(archive)) await download(`${baseUrl}/${filename}`, archive);
  if (!existsSync(checksums)) await download(`${baseUrl}/SHASUMS256.txt`, checksums);
  const checksumText = await readFile(checksums, 'utf8');
  const expected = checksumText.split('\n')
    .map((line) => line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/))
    .find((match) => match?.[2] === filename)?.[1];
  if (!expected) throw new Error(`官方 SHASUMS256.txt 中没有 ${filename}`);
  const actual = await sha256(archive);
  if (actual !== expected) {
    throw new Error(`${filename} 校验失败：期望 ${expected}，实际 ${actual}。删除该缓存文件后重试。`);
  }
  console.log(`✓ Electron ${platform}-${arch} 官方归档校验通过`);
  return archive;
}

async function ensureElectronDist(platform, arch) {
  const localDist = path.join(root, 'node_modules/electron/dist');
  const localExecutable = platform === 'darwin'
    ? path.join(localDist, 'Electron.app/Contents/MacOS/Electron')
    : path.join(localDist, 'electron.exe');
  if (process.platform === platform && process.arch === arch && existsSync(localExecutable)) {
    return localDist;
  }
  const archive = await ensureElectronArchive(platform, arch);
  const distribution = path.join(cacheDir, `electron-v${electronVersion}-${platform}-${arch}`);
  const executable = platform === 'darwin'
    ? path.join(distribution, 'Electron.app/Contents/MacOS/Electron')
    : path.join(distribution, 'electron.exe');
  if (existsSync(executable)) return distribution;
  const temporary = await mkdtemp(path.join(cacheDir, '.extract-'));
  try {
    if (process.platform === 'darwin') {
      await run('ditto', ['-x', '-k', archive, temporary]);
    } else {
      await run('tar', ['-xf', archive, '-C', temporary]);
    }
    if (!existsSync(path.join(temporary, path.relative(distribution, executable)))) {
      throw new Error(`${platform}-${arch} Electron 归档结构不完整`);
    }
    await rename(temporary, distribution);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return distribution;
}

async function buildElectron(target, arch, electronDist, disableAutoSigning = false) {
  const [platform, format] = target.split('-');
  await run(process.execPath, [
    builderCli, `--${platform}`, format, `--${arch}`, '--publish', 'never',
    `--config.electronDist=${electronDist}`,
  ], {
    env: disableAutoSigning
      ? { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
      : process.env,
  });
}

function appPath(archDirectory) {
  return path.join(releaseDir, archDirectory, `${productName}.app`);
}

async function signingIdentity() {
  if (process.env.MDWORK_SIGN_IDENTITY) return process.env.MDWORK_SIGN_IDENTITY;
  const identities = await output('security', ['find-identity', '-v', '-p', 'codesigning']);
  const matches = [...identities.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  return matches.find((identity) => identity.startsWith('Developer ID Application:'))
    ?? matches.find((identity) => identity.startsWith('Apple Development:'))
    ?? '-';
}

async function signApplication(application) {
  const identity = await signingIdentity();
  console.log(`App 签名：${identity === '-' ? 'ad hoc' : identity}`);
  await run('codesign', ['--deep', '--force', '--sign', identity, application]);
}

async function verifyUniversalApp(application) {
  const binaries = [
    path.join(application, `Contents/MacOS/${productName}`),
    path.join(application, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'),
  ];
  for (const binary of binaries) {
    const architectures = await output('lipo', ['-info', binary]);
    if (!architectures.includes('arm64') || !architectures.includes('x86_64')) {
      throw new Error(`不是完整的 Universal 二进制：${binary}\n${architectures}`);
    }
    console.log(`✓ ${path.basename(binary)}: arm64 + x86_64`);
  }
  await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', application]);
}

async function createDmg(application, architecture) {
  const destination = path.join(releaseDir, `${productName}-${releaseVersion}-macos-${architecture}.dmg`);
  const staging = await mkdtemp(path.join(tmpdir(), 'mdwork-dmg-'));
  try {
    await run('ditto', [application, path.join(staging, `${productName}.app`)]);
    await symlink('/Applications', path.join(staging, 'Applications'));
    await run('hdiutil', [
      'create', '-fs', 'HFS+', '-format', 'UDZO', '-ov', '-volname', productName,
      '-srcfolder', staging, destination,
    ]);
    await run('hdiutil', ['verify', destination]);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function writeChecksums() {
  const filenames = [
    `${productName}-${releaseVersion}-macos-universal.dmg`,
    `${productName}-${releaseVersion}-macos-arm64.dmg`,
    `${productName}-${releaseVersion}-win.zip`,
    `${productName}-vscode-${releaseVersion}.vsix`,
  ].filter((filename) => existsSync(path.join(releaseDir, filename)));
  const lines = [];
  for (const filename of filenames) {
    lines.push(`${await sha256(path.join(releaseDir, filename))}  ${filename}`);
  }
  await writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  console.log('\n发布文件：');
  for (const filename of filenames) {
    const size = (await stat(path.join(releaseDir, filename))).size;
    console.log(`  ${filename}  ${(size / 1024 / 1024).toFixed(1)} MiB`);
  }
  console.log('  SHA256SUMS.txt');
}

await mkdir(releaseDir, { recursive: true });
await mkdir(cacheDir, { recursive: true });
if (!arguments_.has('--skip-tests')) await run(npm, ['test']);
await run(npm, ['run', 'build']);

// Per-architecture CodeResources differ, so sign only after the Universal merge.
let arm64App;
if (targets.macUniversal || targets.macArm64) {
  const arm64Dist = await ensureElectronDist('darwin', 'arm64');
  await buildElectron('mac-dir', 'arm64', arm64Dist, true);
  arm64App = appPath('mac-arm64');
}
if (targets.macUniversal) {
  const x64Dist = await ensureElectronDist('darwin', 'x64');
  await buildElectron('mac-dir', 'x64', x64Dist, true);
  const universalApp = appPath('mac-universal');
  await makeUniversalApp({
    arm64AppPath: arm64App,
    x64AppPath: appPath('mac'),
    outAppPath: universalApp,
    force: true,
    mergeASARs: true,
  });
  await signApplication(universalApp);
  await verifyUniversalApp(universalApp);
  await createDmg(universalApp, 'universal');
}
if (targets.macArm64) {
  await signApplication(arm64App);
  await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', arm64App]);
  await createDmg(arm64App, 'arm64');
}
if (targets.win) {
  const winDist = await ensureElectronDist('win32', 'x64');
  await buildElectron('win-zip', 'x64', winDist);
  if (releaseVersion !== version) {
    await rename(
      path.join(releaseDir, `${productName}-${version}-win.zip`),
      path.join(releaseDir, `${productName}-${releaseVersion}-win.zip`),
    );
  }
}
if (targets.vscode) {
  if (!existsSync(path.join(root, 'vscode-mdwork/node_modules/.bin/vsce'))) {
    await run(npm, ['--prefix', 'vscode-mdwork', 'install', '--ignore-scripts']);
  }
  await run(npm, ['run', 'dist:vscode']);
  if (releaseVersion !== version) {
    await rename(
      path.join(releaseDir, `${productName}-vscode-${version}.vsix`),
      path.join(releaseDir, `${productName}-vscode-${releaseVersion}.vsix`),
    );
  }
}
await writeChecksums();
