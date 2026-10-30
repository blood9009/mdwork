import { mermaidCompatibilityCases } from '../mermaidCompatibilityCases';
import { renderMarkdown } from '../../src/markdown/renderMarkdown';
import { sanitizeMarkdown } from '../../src/markdown/sanitizeMarkdown';
import { renderMermaidDiagrams } from '../../src/markdown/renderMermaidDiagrams';

interface CaseResult {
  id: string;
  title: string;
  ok: boolean;
  errors: string[];
  inline?: { viewBox: string; width: number; height: number };
  image?: { width: number; height: number; naturalWidth: number; naturalHeight: number };
}

interface CompatibilityReport {
  caseCount: number;
  passed: number;
  results: CaseResult[];
  staticInteraction: { ok: boolean; errors: string[] };
}

declare global {
  interface Window {
    runMermaidCompatibility: () => Promise<CompatibilityReport>;
  }
}

function documentFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function assertSafeSvg(svg: Element): string[] {
  const errors: string[] = [];
  if (svg.querySelector('script, foreignObject, iframe, object, embed')) {
    errors.push('SVG contains a forbidden active-content element');
  }
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name)) errors.push(`SVG contains event attribute ${attribute.name}`);
      if ((attribute.name === 'href' || attribute.name.endsWith(':href'))
        && /^\s*javascript:/i.test(attribute.value)) {
        errors.push('SVG contains a JavaScript URL');
      }
    }
  }
  return errors;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function verifyInline(html: string, sink: HTMLElement): Promise<CaseResult['inline']> {
  const document = documentFromHtml(html);
  if (document.querySelector('.mermaid-error')) {
    throw new Error(document.querySelector('.mermaid-error')?.textContent ?? 'Mermaid rendering failed');
  }
  const container = document.querySelector('.mermaid-diagram');
  const svg = container?.querySelector(':scope > svg');
  if (!container || !svg || container.querySelectorAll(':scope > svg').length !== 1) {
    throw new Error(`Expected exactly one root inline Mermaid SVG: ${container?.innerHTML.slice(0, 600) ?? '(missing container)'}`);
  }
  const securityErrors = assertSafeSvg(svg);
  if (securityErrors.length) throw new Error(securityErrors.join('; '));
  const viewBox = svg.getAttribute('viewBox') ?? '';
  const values = viewBox.trim().split(/[ ,]+/).map(Number);
  const hasViewBox = values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0;
  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (!hasViewBox && !(width > 0 && height > 0)) {
    throw new Error(`Invalid SVG dimensions: viewBox=${viewBox || '(missing)'}, width=${width}, height=${height}`);
  }
  sink.replaceChildren(document.importNode(container, true));
  await nextFrame();
  const liveSvg = sink.querySelector('svg')!;
  const box = liveSvg.getBBox();
  if (!(box.width > 0 && box.height > 0)) throw new Error('Inline SVG has an empty rendered bounding box');
  return { viewBox: viewBox || `${width} × ${height}`, width: box.width, height: box.height };
}

async function verifyImage(html: string, sink: HTMLElement): Promise<CaseResult['image']> {
  const document = documentFromHtml(html);
  if (document.querySelector('.mermaid-error')) {
    throw new Error(document.querySelector('.mermaid-error')?.textContent ?? 'Mermaid image rendering failed');
  }
  const container = document.querySelector('.mermaid-diagram');
  const sourceImage = container?.querySelector('img.mermaid-svg');
  if (!container || !sourceImage || container.querySelectorAll('img').length !== 1) {
    throw new Error('Expected exactly one SVG image for PDF output');
  }
  const src = sourceImage.getAttribute('src') ?? '';
  if (!src.startsWith('data:image/svg+xml;charset=utf-8,')) throw new Error('PDF image is not an SVG data URL');
  const encodedSvg = src.slice(src.indexOf(',') + 1);
  const svgDocument = new DOMParser().parseFromString(decodeURIComponent(encodedSvg), 'image/svg+xml');
  if (svgDocument.querySelector('parsererror')) throw new Error('PDF image contains malformed SVG');
  if (svgDocument.documentElement.localName !== 'svg') throw new Error('PDF image root is not SVG');
  const securityErrors = assertSafeSvg(svgDocument.documentElement);
  if (securityErrors.length) throw new Error(securityErrors.join('; '));
  const width = Number(sourceImage.getAttribute('width'));
  const height = Number(sourceImage.getAttribute('height'));
  if (!(width > 0 && height > 0)) throw new Error(`Invalid PDF image dimensions: ${width} × ${height}`);

  const image = document.createElement('img');
  image.src = src;
  sink.replaceChildren(image);
  await image.decode();
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('PDF SVG image did not decode');
  return { width, height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
}

async function verifyStaticInteraction(sink: HTMLElement): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const source = `flowchart LR
  A[静态节点] --> B[预览]
  click A "javascript:window.__mdworkMermaidInteraction = true"`;
  const markdown = renderMarkdown(`\`\`\`mermaid\n${source}\n\`\`\``).html;
  const html = await renderMermaidDiagrams(sanitizeMarkdown(markdown, null), 'light');
  const document = documentFromHtml(html);
  if (document.querySelector('.mermaid-error')) errors.push('Strict mode rejected the click test instead of rendering it statically');
  if (document.querySelector('a[href^="javascript:"], [onclick]')) errors.push('Interactive click output survived sanitization');
  const container = document.querySelector('.mermaid-diagram');
  if (container) sink.replaceChildren(document.importNode(container, true));
  await nextFrame();
  if ((window as Window & { __mdworkMermaidInteraction?: boolean }).__mdworkMermaidInteraction) {
    errors.push('Mermaid click callback executed');
  }
  sink.replaceChildren();
  return { ok: errors.length === 0, errors };
}

window.runMermaidCompatibility = async () => {
  const sink = document.getElementById('render-sink')!;
  const results: CaseResult[] = [];
  for (const testCase of mermaidCompatibilityCases) {
    const errors: string[] = [];
    let inline: CaseResult['inline'];
    let image: CaseResult['image'];
    try {
      const rendered = renderMarkdown(`\`\`\`${testCase.fence ?? 'mermaid'}\n${testCase.source}\n\`\`\``).html;
      const sanitized = sanitizeMarkdown(rendered, null);
      try {
        inline = await verifyInline(await renderMermaidDiagrams(sanitized, 'light', 'inline'), sink);
      } catch (error) {
        errors.push(`inline: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        image = await verifyImage(await renderMermaidDiagrams(sanitized, 'light', 'image'), sink);
      } catch (error) {
        errors.push(`image: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      errors.push(`markdown: ${error instanceof Error ? error.message : String(error)}`);
    }
    results.push({ id: testCase.id, title: testCase.title, ok: errors.length === 0, errors, inline, image });
    sink.replaceChildren();
  }
  let staticInteraction: CompatibilityReport['staticInteraction'];
  try {
    staticInteraction = await verifyStaticInteraction(sink);
  } catch (error) {
    staticInteraction = { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  return {
    caseCount: results.length,
    passed: results.filter((result) => result.ok).length,
    results,
    staticInteraction,
  };
};
