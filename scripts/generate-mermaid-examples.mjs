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
  '> 每个案例包含预览和“完整 Markdown”代码块。复制时使用“完整 Markdown”代码块，内容已包含围栏，可直接粘贴到 MDWork。',
  '',
  '在 MDWork 桌面版中打开本文件即可逐个查看。详细语法、简写和安全边界见',
  '[Mermaid 与图表详细教程](../mermaid-guide.zh-CN.md)。',
  '',
  'GitHub Wiki 可以预览标准 `mermaid` 图型；MDWork 专用围栏需要复制到 MDWork 查看。',
  '',
  `当前共 ${mermaidCompatibilityCases.length} 个案例，基线为 Mermaid 11.17.2。`,
  '',
];

for (const [index, item] of mermaidCompatibilityCases.entries()) {
  const fence = item.fence ?? 'mermaid';
  lines.push(`## ${index + 1}. ${item.title}`, '');
  lines.push(`案例 ID：\`${item.id}\`；围栏：\`${fence}\`。`, '');
  lines.push('预览：', '');
  lines.push(`\`\`\`${fence}`, item.source, '```', '');
  lines.push('完整 Markdown（使用此代码块的复制按钮）：', '');
  lines.push('````markdown', `\`\`\`${fence}`, item.source, '```', '````', '');
}

lines.push('---', '', '所有图型均为静态输出，不包含 Mermaid 点击事件或 JavaScript 回调。', '');
const outputDirectory = path.join(root, 'docs/examples');
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'mermaid-gallery.md');
await writeFile(outputPath, lines.join('\n'), 'utf8');
console.log(`Generated ${mermaidCompatibilityCases.length} examples: ${path.relative(root, outputPath)}`);
