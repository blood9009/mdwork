import DOMPurify from 'dompurify';

function getSvgDimensions(svg: Element): { width: number; height: number } | null {
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: Math.ceil(viewBox[2]), height: Math.ceil(viewBox[3]) };
  }
  const widthText = svg.getAttribute('width') ?? '';
  const heightText = svg.getAttribute('height') ?? '';
  if (!/^\d+(?:\.\d+)?(?:px)?$/i.test(widthText) || !/^\d+(?:\.\d+)?(?:px)?$/i.test(heightText)) return null;
  const width = Number.parseFloat(widthText);
  const height = Number.parseFloat(heightText);
  return width > 0 && height > 0 ? { width: Math.ceil(width), height: Math.ceil(height) } : null;
}

function completeSvgDimensions(safeSvg: string): { svg: string; dimensions: { width: number; height: number } | null } {
  const svgElement = new DOMParser().parseFromString(safeSvg, 'image/svg+xml').documentElement;
  const existing = getSvgDimensions(svgElement);
  if (existing) return { svg: safeSvg, dimensions: existing };

  // A few built-in diagrams (notably info) omit height and viewBox. Measure
  // their sanitized SVG once so both preview and PDF have intrinsic dimensions.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  const liveSvg = document.importNode(svgElement, true) as unknown as SVGSVGElement;
  host.append(liveSvg);
  document.body.append(host);
  try {
    const box = liveSvg.getBBox();
    if (!(box.width > 0 && box.height > 0)) return { svg: safeSvg, dimensions: null };
    if (!liveSvg.getAttribute('viewBox')) {
      liveSvg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    }
    liveSvg.setAttribute('width', String(Math.ceil(box.width)));
    liveSvg.setAttribute('height', String(Math.ceil(box.height)));
    return {
      svg: new XMLSerializer().serializeToString(liveSvg),
      dimensions: { width: Math.ceil(box.width), height: Math.ceil(box.height) },
    };
  } finally {
    host.remove();
  }
}

function showError(container: Element, source: string, error: unknown): void {
  const message = error instanceof Error ? error.message : '无法解析图表';
  const pre = document.createElement('pre');
  pre.className = 'mermaid-error';
  pre.textContent = `图表解析失败：${message}\n\n${source}`;
  container.replaceChildren(pre);
}

/**
 * Mermaid performs diagram parsing/layout. Markdown itself is still handled by
 * our own parser. SVG is sanitized separately before it enters the document or
 * the PDF export payload.
 */
let latestBatchId = 0;
let renderingQueue: Promise<void> = Promise.resolve();

export function renderMermaidDiagrams(
  html: string,
  theme: 'light' | 'dark',
  output: 'inline' | 'image' = 'inline',
): Promise<string> {
  if (!html.includes('data-mermaid-source')) return Promise.resolve(html);
  const result = renderingQueue.then(() => renderBatch(html, theme, output));
  renderingQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function renderBatch(
  html: string,
  theme: 'light' | 'dark',
  output: 'inline' | 'image',
): Promise<string> {
  const batchId = ++latestBatchId;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const containers = [...parsed.querySelectorAll<HTMLElement>('[data-mermaid-source]')];
  if (containers.length === 0) return html;

  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    suppressErrorRendering: true,
    htmlLabels: false,
  });

  for (const [index, container] of containers.entries()) {
    const encoded = container.dataset.mermaidSource ?? '';
    let source = '';
    try {
      source = decodeURIComponent(encoded);
      const { svg } = await mermaid.render(`mdwork-diagram-${batchId}-${index}`, source);
      const safeSvg = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'object', 'embed'],
      });
      const completed = completeSvgDimensions(safeSvg);
      if (output === 'image') {
        const image = parsed.createElement('img');
        image.className = 'mermaid-svg';
        image.alt = 'Mermaid 图表';
        if (completed.dimensions) {
          image.setAttribute('width', String(completed.dimensions.width));
          image.setAttribute('height', String(completed.dimensions.height));
        }
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(completed.svg)}`;
        container.replaceChildren(image);
      } else {
        container.innerHTML = completed.svg;
      }
    } catch (error) {
      showError(container, source || encoded, error);
    }
  }

  return parsed.body.innerHTML;
}
