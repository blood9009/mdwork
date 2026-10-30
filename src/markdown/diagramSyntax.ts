import { convertMindmapDirection } from './mindmapDirection';

const shorthandHeaders: Record<string, string> = {
  sequence: 'sequenceDiagram',
  class: 'classDiagram',
  state: 'stateDiagram-v2',
  er: 'erDiagram',
  gantt: 'gantt',
  pie: 'pie',
  gitgraph: 'gitGraph',
  journey: 'journey',
  timeline: 'timeline',
  kanban: 'kanban',
  quadrant: 'quadrantChart',
  xychart: 'xychart-beta',
  sankey: 'sankey-beta',
  packet: 'packet-beta',
  block: 'block-beta',
  radar: 'radar-beta',
  treemap: 'treemap-beta',
  venn: 'venn-beta',
  ishikawa: 'ishikawa-beta',
  wardley: 'wardley-beta',
  cynefin: 'cynefin-beta',
  architecture: 'architecture-beta',
};

/**
 * Converts MDWork fence shorthand to a complete Mermaid program. Standard
 * mermaid fences are passed through unchanged so every built-in diagram keeps
 * the engine's native syntax.
 */
export function normalizeDiagramSource(language: string, meta: string, value: string): string | null {
  const normalizedLanguage = language.toLowerCase();
  if (normalizedLanguage === 'mermaid') return value;
  if (normalizedLanguage === 'mindmap') {
    const direction = meta.trim().toLowerCase();
    if (!direction) return `mindmap\n${value}`;
    if (['lr', 'horizontal', 'h'].includes(direction)) return convertMindmapDirection(value, 'LR');
    if (['td', 'tb', 'vertical', 'v'].includes(direction)) return convertMindmapDirection(value, 'TD');
    return `mindmap ${meta.trim()}\n${value}`;
  }
  if (normalizedLanguage === 'flowchart') {
    const direction = (meta.trim() || 'TD').toUpperCase();
    return `flowchart ${direction}\n${value}`;
  }
  const header = shorthandHeaders[normalizedLanguage];
  if (!header) return null;
  const suffix = meta.trim() ? ` ${meta.trim()}` : '';
  return `${header}${suffix}\n${value}`;
}
