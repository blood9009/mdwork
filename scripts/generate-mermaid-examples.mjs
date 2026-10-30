import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  entryPoints: [path.join(root, 'tests/mermaidCompatibilityCases.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  write: false,
});
const source = Buffer.from(bundle.outputFiles[0].contents).toString('base64');
const { mermaidCompatibilityCases } = await import(`data:text/javascript;base64,${source}`);

const lines = [
  '# Mermaid 全图型示例库',
  '',
  '> 本文件由 `npm run examples:generate` 根据 `tests/mermaidCompatibilityCases.ts` 生成。',
  '> 这些案例同时用于真实 Electron/Chromium 的内联 SVG 与 PDF 图片渲染测试。',
  '',
  '在 MDWork 桌面版中打开本文件即可逐个查看。详细语法、简写和安全边界见',
  '[Mermaid 与图表详细教程](../mermaid-guide.zh-CN.md)。',
  '',
  `当前共 ${mermaidCompatibilityCases.length} 个案例，基线为 Mermaid 11.17.2。`,
  '',
];

for (const [index, item] of mermaidCompatibilityCases.entries()) {
  lines.push(`## ${index + 1}. ${item.title}`, '');
  lines.push(`案例 ID：\`${item.id}\`；围栏：\`${item.fence ?? 'mermaid'}\`。`, '');
  lines.push(`\`\`\`${item.fence ?? 'mermaid'}`, item.source, '```', '');
}

lines.push('---', '', '所有图型均为静态输出，不包含 Mermaid 点击事件或 JavaScript 回调。', '');
const outputDirectory = path.join(root, 'docs/examples');
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'mermaid-gallery.md');
await writeFile(outputPath, lines.join('\n'), 'utf8');
console.log(`Generated ${mermaidCompatibilityCases.length} examples: ${path.relative(root, outputPath)}`);
