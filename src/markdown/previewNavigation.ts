export type PreviewNavigationResult = {
  kind: 'heading' | 'text' | 'line' | 'missing';
  found: boolean;
  line?: number;
};

export function scrollPreviewToLine(article: HTMLElement, line: number): void {
  const elements = Array.from(article.querySelectorAll<HTMLElement>('[data-source-line]'));
  if (elements.length === 0) {
    const maximum = article.scrollHeight - article.clientHeight;
    article.scrollTop = maximum * Math.min(1, Math.max(0, line / 1000));
    return;
  }

  let low = 0;
  let high = elements.length - 1;
  let match = elements[0];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const element = elements[middle];
    const elementLine = Number(element.dataset.sourceLine);
    if (elementLine <= line) {
      match = element;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const top = match.getBoundingClientRect().top
    - article.getBoundingClientRect().top
    + article.scrollTop - 20;
  article.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

function scrollPreviewToText(article: HTMLElement, text: string): boolean {
  const walker = article.ownerDocument.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const index = node.nodeValue?.indexOf(text) ?? -1;
    if (parent && !parent.closest('svg, mark.mdwork-search-target') && index >= 0) {
      const range = article.ownerDocument.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const mark = article.ownerDocument.createElement('mark');
      mark.className = 'mdwork-search-target';
      range.surroundContents(mark);
      mark.scrollIntoView({ block: 'center', behavior: 'auto' });
      article.ownerDocument.defaultView?.setTimeout(() => {
        if (!mark.isConnected) return;
        const container = mark.parentNode;
        mark.replaceWith(article.ownerDocument.createTextNode(mark.textContent ?? ''));
        container?.normalize();
      }, 2200);
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

export function navigatePreviewFragment(article: HTMLElement, href: string): PreviewNavigationResult {
  let fragment: string;
  try {
    fragment = decodeURIComponent(href.slice(1));
  } catch {
    return { kind: 'missing', found: false };
  }

  const line = /^line=([1-9]\d{0,6})$/.exec(fragment);
  if (line) {
    const value = Number(line[1]);
    scrollPreviewToLine(article, value);
    return { kind: 'line', found: true, line: value };
  }

  if (fragment.startsWith('text=')) {
    const text = fragment.slice(5);
    const found = text.length > 0 && scrollPreviewToText(article, text);
    return { kind: found ? 'text' : 'missing', found };
  }

  const target = article.querySelector(`#${CSS.escape(fragment)}`);
  target?.scrollIntoView({ block: 'start', behavior: 'auto' });
  return target ? { kind: 'heading', found: true } : { kind: 'missing', found: false };
}
