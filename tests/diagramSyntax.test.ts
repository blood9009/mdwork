import { describe, expect, it } from 'vitest';
import { normalizeDiagramSource } from '../src/markdown/diagramSyntax';
import { renderMarkdown } from '../src/markdown/renderMarkdown';

describe('Mermaid fence shorthand', () => {
  it('passes standard Mermaid programs through unchanged', () => {
    const source = 'classDiagram\n  Animal <|-- Duck\n';
    expect(normalizeDiagramSource('mermaid', '', source)).toBe(source);
    expect(normalizeDiagramSource('mermaid', 'ignored', source)).toBe(source);
    expect(normalizeDiagramSource('typescript', '', source)).toBeNull();
  });

  it('normalizes flowchart direction case and preserves invalid directions for diagnostics', () => {
    expect(normalizeDiagramSource('flowchart', 'lr', 'A --> B\n')).toBe('flowchart LR\nA --> B\n');
    expect(normalizeDiagramSource('flowchart', '', 'A --> B\n')).toBe('flowchart TD\nA --> B\n');
    expect(normalizeDiagramSource('flowchart', 'sideways', 'A --> B\n')).toBe('flowchart SIDEWAYS\nA --> B\n');
  });

  it.each([
    ['sequence', 'sequenceDiagram'],
    ['mindmap', 'mindmap'],
    ['class', 'classDiagram'],
    ['state', 'stateDiagram-v2'],
    ['er', 'erDiagram'],
    ['gantt', 'gantt'],
    ['pie', 'pie'],
    ['gitgraph', 'gitGraph'],
    ['journey', 'journey'],
    ['timeline', 'timeline'],
    ['kanban', 'kanban'],
    ['quadrant', 'quadrantChart'],
    ['xychart', 'xychart-beta'],
    ['sankey', 'sankey-beta'],
    ['packet', 'packet-beta'],
    ['block', 'block-beta'],
    ['radar', 'radar-beta'],
    ['treemap', 'treemap-beta'],
    ['venn', 'venn-beta'],
    ['ishikawa', 'ishikawa-beta'],
    ['wardley', 'wardley-beta'],
    ['cynefin', 'cynefin-beta'],
    ['architecture', 'architecture-beta'],
  ])('expands %s fences', (language, header) => {
    expect(normalizeDiagramSource(language, '', 'body\n')).toBe(`${header}\nbody\n`);
  });

  it('converts directional mindmaps into static one-way trees', () => {
    const source = 'root((产品))\n  编辑[Monaco]\n    空格\n      :::important\n  导出(PDF)\n';
    const vertical = normalizeDiagramSource('mindmap', 'TD', source)!;
    expect(vertical).toContain('flowchart TD');
    expect(vertical).toContain('MindmapNode0 --- MindmapNode1');
    expect(vertical).toContain('MindmapNode1 --- MindmapNode2');
    expect(vertical).toContain('class MindmapNode2 important;');
    expect(vertical).toContain('classDef mdworkMindmapPlain');
    expect(normalizeDiagramSource('mindmap', 'horizontal', source)).toContain('flowchart LR');
    expect(normalizeDiagramSource('mindmap', '', source)).toBe(`mindmap\n${source}`);
    const invalid = renderMarkdown('```mindmap TD\nroot((一))\nroot((二))\n```').html;
    expect(invalid).toContain('只能有一个根节点');
    expect(invalid).toContain('class="mermaid-error"');
  });

  it('preserves shorthand metadata and recognizes Mermaid fences case-insensitively', () => {
    expect(normalizeDiagramSource('Pie', 'showData', '"A" : 1\n')).toBe('pie showData\n"A" : 1\n');
    const html = renderMarkdown('```MINDMAP\n  root((产品))\n    编辑\n    预览\n```').html;
    const source = decodeURIComponent(/data-mermaid-source="([^"]+)"/.exec(html)![1]);
    expect(source).toBe('mindmap\n  root((产品))\n    编辑\n    预览\n');
  });
});
