import DOMPurify from 'dompurify';
import { normalizeImageWidth } from './imageLayout';

export function sanitizeMarkdown(html: string, sourcePath: string | null): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['data-source-line', 'data-mermaid-source', 'data-image-width'],
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['style'],
  });
  const document = new DOMParser().parseFromString(sanitized, 'text/html');

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
