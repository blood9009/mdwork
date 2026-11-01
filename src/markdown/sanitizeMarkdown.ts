import DOMPurify from 'dompurify';
import { normalizeImageWidth } from './imageLayout';

export function sanitizeMarkdown(html: string, sourcePath: string | null): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['data-source-line', 'data-mermaid-source', 'data-image-width'],
    FORBID_TAGS: ['style', 'form'],
  });
  const document = new DOMParser().parseFromString(sanitized, 'text/html');

  document.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (element.tagName !== 'SPAN') {
      element.removeAttribute('style');
      return;
    }
    const declarations = (element.getAttribute('style') ?? '').split(';');
    const safe: string[] = [];
    for (const declaration of declarations) {
      const match = /^\s*(font-family|font-size|color)\s*:\s*(.*?)\s*$/i.exec(declaration);
      if (!match) continue;
      const property = match[1].toLowerCase();
      const value = match[2];
      if (property === 'font-family' && value.length <= 120
        && /^[\p{L}\p{N} _-]+$/u.test(value)) safe.push(`font-family: ${value}`);
      if (property === 'font-size' && /^(?:[1-9]|[1-6]\d|7[0-2])(?:\.\d+)?pt$/.test(value)) {
        safe.push(`font-size: ${value}`);
      }
      if (property === 'color' && /^#[\da-fA-F]{6}$/.test(value)) safe.push(`color: ${value}`);
    }
    if (safe.length) element.setAttribute('style', safe.join('; '));
    else element.removeAttribute('style');
  });

  document.querySelectorAll('img[data-image-width]').forEach((image) => {
    const width = normalizeImageWidth(image.getAttribute('data-image-width'));
    if (width) image.setAttribute('style', `width: ${width}`);
    image.removeAttribute('data-image-width');
  });

  document.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (/^(https?:|mailto:)/i.test(href)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noreferrer noopener');
    }
  });

  if (sourcePath) {
    document.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('src');
      if (!source || /^(https?:|data:|mdwork-asset:)/i.test(source)) return;
      const query = new URLSearchParams({ base: sourcePath, src: source });
      image.setAttribute('src', `mdwork-asset://image?${query.toString()}`);
      image.setAttribute('loading', 'lazy');
    });
  }

  return document.body.innerHTML;
}
