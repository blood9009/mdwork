import { describe, expect, it } from 'vitest';
import { parseLayeredDiagram } from '../src/markdown/layeredDiagram';
import { renderMarkdown } from '../src/markdown/renderMarkdown';

const jpgLikeDiagram = [
  'layer 第一层呀',
  'title 用户角色',
  'columns 3',
  'item 赚钱',
  'item 赚钱',
  'item 赚钱',
  'layer 第二层呀',
  'columns 2',
  'group 前端',
  'item 赚钱赚钱赚钱',
  'end',
  'group 后端',
  'item 赚钱赚钱',
  'end',
  'link 前端 -> 后端 | 赚钱赚钱',
  'link 后端 -> 前端 | 赚钱赚钱赚钱',
  'layer 第三层呀',
  'columns 3',
  'group 店长功能',
  'item 赚钱赚钱',
  'item 赚钱',
  'item 赚钱赚钱赚钱',
  'end',
  'group 仓库员工功能',
  'item 赚钱赚钱',
  'item 赚钱赚钱',
  'item 赚钱赚钱赚钱',
  'end',
  'group 管理员功能',
  'columns 2',
  'item 赚钱',
  'item 赚钱',
  'item 赚钱',
  'item 赚钱',
  'item 赚钱',
  'item 赚钱',
  'item 赚钱赚钱赚钱',
  'span 2',
  'end',
  'layer 第四层呀',
  'columns 2',
  'group 钱赚',
  'item 赚钱赚钱赚钱赚钱赚钱',
  'end',
  'group 钱赚',
  'item 赚钱赚钱赚钱赚钱赚钱',
  'end',
].join('\n');

describe('Layered diagram parser', () => {
  it('parses the JPG structure into editable layers, groups, columns and links', () => {
    const layers = parseLayeredDiagram(jpgLikeDiagram);
    expect(layers).toHaveLength(4);
    expect(layers[0]).toMatchObject({ label: '第一层呀', title: '用户角色', tone: 'green', columns: 3 });
    expect(layers[0].items).toHaveLength(3);
    expect(layers[1].groups.map((group) => group.title)).toEqual(['前端', '后端']);
    expect(layers[1].links).toEqual([
      { source: '前端', target: '后端', direction: 'forward', label: '赚钱赚钱' },
      { source: '后端', target: '前端', direction: 'forward', label: '赚钱赚钱赚钱' },
    ]);
    expect(layers[2].groups).toHaveLength(3);
    expect(layers[2].groups[2]).toMatchObject({ title: '管理员功能', columns: 2 });
    expect(layers[2].groups[2].items).toHaveLength(7);
    expect(layers[2].groups[2].items[6]).toEqual({ text: '赚钱赚钱赚钱', span: 2 });
    expect(layers[3].tone).toBe('red');
  });

  it('renders the JPG-like diagram instead of a highlighted code block', () => {
    const result = renderMarkdown(`\`\`\`layers\n${jpgLikeDiagram}\n\`\`\``).html;
    expect(result.match(/class="layer-row /g)).toHaveLength(4);
    expect(result.match(/class="layer-connector"/g)).toHaveLength(3);
    expect(result).toContain('class="layer-groups layer-columns-3"');
    expect(result).toContain('class="layer-items layer-columns-2"');
    expect(result).toContain('class="layer-item layer-item-span-2"');
    expect(result).toContain('class="layer-link-line layer-link-forward"');
    expect(result).toContain('data-source-line="1"');
    expect(result).not.toContain('class="hljs"');
  });

  it('supports backward and bidirectional links and custom tones', () => {
    const source = [
      'layer 服务层',
      'color blue',
      'columns 2',
      'group A',
      'item 前端',
      'end',
      'group B',
      'item 后端',
      'end',
      'link A <- B | 返回',
      'link A <> B | 双向',
    ].join('\n');
    const html = renderMarkdown(`\`\`\`layers\n${source}\n\`\`\``).html;
    expect(html).toContain('layer-tone-blue');
    expect(html).toContain('layer-link-backward');
    expect(html).toContain('layer-link-both');
  });

  it('escapes diagram text and reports source lines for invalid syntax', () => {
    const escaped = renderMarkdown('```layers\nlayer 安全\nitem <img src=x onerror=alert(1)>\n```').html;
    expect(escaped).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(escaped).not.toContain('<img src=x');

    expect(() => parseLayeredDiagram('layer 第二层\ngroup 前端\nend\nlink 前端 -> 后端')).toThrow('第 4 行');
    expect(() => parseLayeredDiagram('layer 第一层\ngroup 前端')).toThrow('尚未使用 end 关闭');
    expect(() => parseLayeredDiagram('layer 第一层\nitem 条目\nspan 2')).toThrow('当前 columns（1）');
    const invalid = renderMarkdown('```layers\ntitle 缺少层\n```').html;
    expect(invalid).toContain('分层图解析失败：第 1 行');
    expect(invalid).toContain('class="layer-diagram-error"');
  });
});
