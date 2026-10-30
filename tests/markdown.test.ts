import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/markdown/renderMarkdown';
import { parseDocument } from '../src/markdown/blockParser';

describe('Markdown renderer', () => {
  it('renders headings with stable ids and source lines', () => {
    const result = renderMarkdown('# 标题\n\n正文\n\n## 标题\n\n## 标题');
    expect(result.html).toContain('id="标题"');
    expect(result.html).toContain('id="标题-2"');
    expect(result.html).toContain('id="标题-3"');
    expect(result.html).toContain('data-source-line="3"');
    expect(result.headings).toEqual([
      { id: '标题', text: '标题', level: 1 },
      { id: '标题-2', text: '标题', level: 2 },
      { id: '标题-3', text: '标题', level: 2 },
    ]);
  });

  it('supports GFM tables, task lists and strikethrough', () => {
    const result = renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n~~removed~~');
    expect(result.html).toContain('<table data-source-line="1">');
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).toContain('checked=""');
    expect(result.html).toContain('<li class="task-list-item" data-source-line="5"><input');
    expect(result.html).toContain('<del>removed</del>');
  });

  it('parses nested emphasis, links, images and escapes', () => {
    const result = renderMarkdown('**bold *nested*** and ~~gone~~. [link](https://example.com) ![alt](image.png) \\*literal\\*');
    expect(result.html).toContain('<strong>bold <em>nested</em></strong>');
    expect(result.html).toContain('<del>gone</del>');
    expect(result.html).toContain('<a href="https://example.com">link</a>');
    expect(result.html).toContain('<img src="image.png" alt="alt">');
    expect(result.html).toContain('*literal*');
  });

  it('parses nested lists and reference links', () => {
    const result = renderMarkdown('- parent\n  - child\n\n[reference][docs]\n\n[docs]: https://example.com "Documentation"');
    expect(result.html.match(/<ul/g)).toHaveLength(2);
    expect(result.html).toContain('child');
    expect(result.html).toContain('<a href="https://example.com" title="Documentation">reference</a>');
  });

  it('parses setext headings, blockquotes, rules and ordered list starts', () => {
    const result = renderMarkdown('Title\n=====\n\n> quote with **bold**\n\n---\n\n3. third\n4. fourth');
    expect(result.html).toContain('<h1');
    expect(result.html).toContain('<blockquote data-source-line="4">');
    expect(result.html).toContain('<strong>bold</strong>');
    expect(result.html).toContain('<hr data-source-line="6">');
    expect(result.html).toContain('<ol start="3"');
  });

  it('parses code spans, automatic links, entities and hard breaks', () => {
    const result = renderMarkdown('Use `<tag>` and <https://example.com> &copy;.  \nnext');
    expect(result.html).toContain('<code>&lt;tag&gt;</code>');
    expect(result.html).toContain('<a href="https://example.com">https://example.com</a>');
    expect(result.html).toContain('©');
    expect(result.html).toContain('<br>');
  });

  it('preserves table alignment and escaped pipes', () => {
    const result = renderMarkdown('| Left | Center | Right |\n| :--- | :---: | ---: |\n| a\\|b | `c|d` | e |');
    expect(result.html).toContain('<th align="left">Left</th>');
    expect(result.html).toContain('<th align="center">Center</th>');
    expect(result.html).toContain('<th align="right">Right</th>');
    expect(result.html).toContain('a|b');
    expect(result.html).toContain('<code>c|d</code>');
  });

  it('creates Mermaid diagram nodes instead of highlighted code blocks', () => {
    const result = renderMarkdown('```mermaid\nflowchart TD\n  A[开始] --> B[完成]\n```');
    expect(result.html).toContain('class="mermaid-diagram"');
    expect(result.html).not.toContain('class="hljs"');
    const encoded = /data-mermaid-source="([^"]+)"/.exec(result.html)?.[1];
    expect(encoded).toBeDefined();
    expect(decodeURIComponent(encoded!)).toBe('flowchart TD\n  A[开始] --> B[完成]\n');
  });

  it('preserves flowchart fence directions and defaults to top-down', () => {
    const parsed = parseDocument('```flowchart LR\n  A --> B\n```');
    const block = parsed.document.children[0];
    expect(block).toMatchObject({ type: 'codeBlock', language: 'flowchart', meta: 'LR' });

    const horizontal = renderMarkdown('```flowchart LR\n  A --> B\n```').html;
    const vertical = renderMarkdown('```flowchart\n  A --> B\n```').html;
    expect(decodeURIComponent(/data-mermaid-source="([^"]+)"/.exec(horizontal)![1])).toContain('flowchart LR\n');
    expect(decodeURIComponent(/data-mermaid-source="([^"]+)"/.exec(vertical)![1])).toContain('flowchart TD\n');
  });

  it('supports role lanes, decisions and return edges in flowchart fences', () => {
    const result = renderMarkdown([
      '```flowchart LR',
      '  subgraph 销售',
      '    Start([开始]) --> Submit[提交订单]',
      '  end',
      '  subgraph 实现',
      '    Review{审核订单}',
      '  end',
      '  Submit --> Review',
      '  Review -->|通过| Done([完成])',
      '  Review -->|驳回| Submit',
      '```',
    ].join('\n'));
    const source = decodeURIComponent(/data-mermaid-source="([^"]+)"/.exec(result.html)![1]);
    expect(source).toContain('flowchart LR\n');
    expect(source).toContain('subgraph 销售');
    expect(source).toContain('Review{审核订单}');
    expect(source).toContain('Review -->|驳回| Submit');
  });

  it('supports sequence diagram shorthand with messages, self-calls and activation', () => {
    const result = renderMarkdown([
      '```sequence',
      '  actor 用户',
      '  participant 前端',
      '  participant 后台',
      '  用户->>前端: 用户操作下单',
      '  前端->>后台: 请求下单',
      '  activate 后台',
      '  后台->>后台: 保存订单',
      '  后台-->>前端: 返回跳转 URL',
      '  deactivate 后台',
      '```',
    ].join('\n'));
    const source = decodeURIComponent(/data-mermaid-source="([^"]+)"/.exec(result.html)![1]);
    expect(source).toContain('sequenceDiagram\n');
    expect(source).toContain('用户->>前端: 用户操作下单');
    expect(source).toContain('后台->>后台: 保存订单');
    expect(source).toContain('后台-->>前端: 返回跳转 URL');
  });

  it('corrects compact numeric headings and continues hierarchical numbering', () => {
    const result = renderMarkdown('#9\n##8\n##7\n###6\n##5\n#4\n##3');
    expect(result.headings.map(({ text, level }) => ({ text, level }))).toEqual([
      { text: '1', level: 1 },
      { text: '1.1', level: 2 },
      { text: '1.2', level: 2 },
      { text: '1.2.1', level: 3 },
      { text: '1.3', level: 2 },
      { text: '2', level: 1 },
      { text: '2.1', level: 2 },
    ]);
    expect(result.html).toContain('<h2 id="11" class="numbered-heading" data-source-line="2">1.1</h2>');
  });

  it('uses ordered alphabetic sequences for compact letter headings', () => {
    const upper = renderMarkdown('#Z\n##Y\n##X\n###W\n#V');
    expect(upper.headings.map((heading) => heading.text)).toEqual([
      'A', 'A.A', 'A.B', 'A.B.A', 'B',
    ]);

    const lower = renderMarkdown('#z\n#y\n##x');
    expect(lower.headings.map((heading) => heading.text)).toEqual(['a', 'b', 'b.a']);
  });

  it('keeps unordered compact headings out of the numbering sequence', () => {
    const result = renderMarkdown('#1\n#*\n#9\n##1\n##*\n##8\n###1\n#4\n##1');
    expect(result.headings.map((heading) => heading.text)).toEqual([
      '1', '•', '2', '2.1', '•', '2.2', '2.2.1', '3', '3.1',
    ]);
    expect(result.html.match(/class="compact-heading"/g)).toHaveLength(2);
    expect(result.html).toContain('>•</h1>');
    expect(result.html).toContain('>•</h2>');
  });

  it('accepts multiple ASCII digits only in compact headings without spaces', () => {
    const result = renderMarkdown('#12\n##2026');
    expect(result.headings.map((heading) => heading.text)).toEqual(['1', '1.1']);

    expect(parseDocument('# 12').document.children[0]).toMatchObject({ type: 'heading' });
    expect(parseDocument('# 12').document.children[0]).not.toHaveProperty('numbering');
    for (const source of ['#1 2', '#１２', '#ab']) {
      expect(parseDocument(source).document.children[0].type).toBe('paragraph');
    }
  });

  it('supports floating, centered and sized images without changing plain images', () => {
    const result = renderMarkdown([
      '![right|40%|右侧图片](right.png)',
      '![left|300px|左侧图片](left.png)',
      '![center|居中图片](center.png)',
      '![left|9999px|超限宽度](large.png)',
      '![普通|40%|图片](plain.png)',
    ].join('\n\n'));

    expect(result.html).toContain('<img src="right.png" alt="右侧图片" class="image-right" data-image-width="40%">');
    expect(result.html).toContain('<img src="left.png" alt="左侧图片" class="image-left" data-image-width="300px">');
    expect(result.html).toContain('<img src="center.png" alt="居中图片" class="image-center">');
    expect(result.html).toContain('<img src="large.png" alt="9999px|超限宽度" class="image-left">');
    expect(result.html).toContain('<img src="plain.png" alt="普通|40%|图片">');
  });

  it('parses ::clear as a block that ends image wrapping', () => {
    const parsed = parseDocument('![left|图片](image.png)\n\n正文\n\n::clear\n\n后续正文');
    expect(parsed.document.children.map((node) => node.type)).toEqual([
      'paragraph', 'paragraph', 'imageClear', 'paragraph',
    ]);
    expect(renderMarkdown('::clear').html).toContain('<div class="image-clear" data-source-line="1"></div>');
    expect(renderMarkdown('before ::clear after').html).toContain('before ::clear after');
  });

  it('highlights known code languages and escapes unknown ones', () => {
    const known = renderMarkdown('```ts\nconst value: number = 1;\n```');
    const unknown = renderMarkdown('```unknown-language\n<script>alert(1)</script>\n```');
    expect(known.html).toContain('hljs-keyword');
    expect(unknown.html).toContain('&lt;script&gt;');
    expect(unknown.html).not.toContain('<script>alert(1)</script>');
  });
});
