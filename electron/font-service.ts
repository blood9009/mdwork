import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let fontCache: Promise<string[]> | null = null;

const fallbackFonts = [
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'Menlo',
  'Consolas',
  'monospace',
];

function run(command: string, args: string[]): Promise<string> {
  return execFileAsync(command, args, {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  }).then(({ stdout }) => stdout);
}

async function fontsOnMac(): Promise<string[]> {
  const output = await run('/usr/sbin/system_profiler', ['SPFontsDataType', '-json']);
  const data = JSON.parse(output) as {
    SPFontsDataType?: Array<{
      _name?: string;
      family?: string;
      typefaces?: Array<{ family?: string }>;
    }>;
  };

  return (data.SPFontsDataType ?? []).flatMap((font) => [
    font.family ?? '',
    font._name ?? '',
    ...(font.typefaces ?? []).map((typeface) => typeface.family ?? ''),
  ]);
}

async function fontsOnWindows(): Promise<string[]> {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$fonts = @((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name })",
    "ConvertTo-Json -Compress -InputObject $fonts",
  ].join('; ');
  const output = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]);
  const parsed: unknown = JSON.parse(output);
  return Array.isArray(parsed) ? parsed.filter((font): font is string => typeof font === 'string') : [String(parsed)];
}

async function detectFonts(): Promise<string[]> {
  try {
    const fonts = process.platform === 'darwin'
      ? await fontsOnMac()
      : process.platform === 'win32'
        ? await fontsOnWindows()
        : [];

    return [...new Set([...fonts, ...fallbackFonts])]
      .map((font) => font.trim())
      .filter((font) => font.length > 0 && !font.startsWith('.'))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error('Unable to enumerate system fonts:', error);
    return fallbackFonts;
  }
}

export function listSystemFonts(): Promise<string[]> {
  fontCache ??= detectFonts();
  return fontCache;
}
