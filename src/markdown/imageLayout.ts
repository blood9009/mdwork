import type { ImageInline } from './ast';

export interface ParsedImageLabel {
  label: string;
  layout?: ImageInline['layout'];
  width?: string;
}

export function normalizeImageWidth(value: string | null | undefined): string | undefined {
  const width = value?.trim() ?? '';
  if (/^(?:[1-9]\d?|100)%$/.test(width)) return width;
  if (/^(?:[1-9]\d{0,2}|1\d{3}|2000)px$/.test(width)) return width;
  return undefined;
}

export function parseImageLabel(source: string): ParsedImageLabel {
  const [first, second, ...rest] = source.split('|');
  const layout = first.trim().toLowerCase();
  if (!['left', 'right', 'center'].includes(layout)) return { label: source };

  const width = normalizeImageWidth(second);
  if (width) return { label: rest.join('|'), layout: layout as ImageInline['layout'], width };
  return {
    label: [second, ...rest].filter((part) => part !== undefined).join('|'),
    layout: layout as ImageInline['layout'],
  };
}
