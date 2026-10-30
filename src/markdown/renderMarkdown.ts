import { parseDocument } from './blockParser';
import { renderDocument } from './htmlRenderer';
import type { RenderedMarkdown } from './htmlRenderer';

export type { RenderedMarkdown } from './htmlRenderer';

/**
 * MDWork's Markdown pipeline: source -> block/inline AST -> safe-ready HTML.
 * HTML sanitization is deliberately a separate step in sanitizeMarkdown.ts.
 */
export function renderMarkdown(source: string): RenderedMarkdown {
  const { document } = parseDocument(source);
  return renderDocument(document);
}
