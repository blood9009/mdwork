export type LayerTone = 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'purple';
export type LayerLinkDirection = 'forward' | 'backward' | 'both';

export interface LayerItem {
  text: string;
  span: number;
}

export interface LayerGroup {
  title: string;
  columns: number;
  items: LayerItem[];
}

export interface LayerLink {
  source: string;
  target: string;
  direction: LayerLinkDirection;
  label: string;
}

export interface DiagramLayer {
  label: string;
  title: string;
  tone: LayerTone;
  columns: number;
  items: LayerItem[];
  groups: LayerGroup[];
  links: LayerLink[];
}

const tones: LayerTone[] = ['green', 'yellow', 'orange', 'red', 'blue', 'purple'];

function fail(line: number, message: string): never {
  throw new Error(`第 ${line} 行：${message}`);
}

function requiredValue(value: string | undefined, line: number, command: string): string {
  const result = value?.trim() ?? '';
  if (!result) fail(line, `${command} 后需要填写内容`);
  return result;
}

export function parseLayeredDiagram(source: string): DiagramLayer[] {
  const layers: DiagramLayer[] = [];
  let layer: DiagramLayer | null = null;
  let group: LayerGroup | null = null;

  for (const [index, rawLine] of source.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = index + 1;
    const text = rawLine.trim();
    if (!text || text.startsWith('#')) continue;
    const match = /^([A-Za-z]+)(?:[ \t]+(.*))?$/.exec(text);
    if (!match) fail(line, '无法识别语法，请使用 layer、title、columns、span、item、group、end、link 或 color');
    const command = match[1].toLowerCase();
    const value = match[2];

    if (command === 'layer') {
      if (group) fail(line, `分组“${group.title}”尚未使用 end 关闭`);
      layer = {
        label: requiredValue(value, line, command), title: '',
        tone: tones[layers.length % tones.length], columns: 1,
        items: [], groups: [], links: [],
      };
      layers.push(layer);
      continue;
    }
    if (!layer) fail(line, `${command} 必须放在 layer 之后`);

    switch (command) {
      case 'title':
        if (group) fail(line, '分组标题请直接写在 group 后，层内 title 不能放在分组中');
        layer.title = requiredValue(value, line, command);
        break;
      case 'color': {
        const tone = requiredValue(value, line, command).toLowerCase() as LayerTone;
        if (!tones.includes(tone)) fail(line, `不支持配色“${tone}”，可选 ${tones.join('、')}`);
        layer.tone = tone;
        break;
      }
      case 'columns': {
        const columns = Number(requiredValue(value, line, command));
        if (!Number.isInteger(columns) || columns < 1 || columns > 4) {
          fail(line, 'columns 必须是 1 到 4 的整数');
        }
        if (group) group.columns = columns;
        else layer.columns = columns;
        break;
      }
      case 'span': {
        const span = Number(requiredValue(value, line, command));
        const items = group ? group.items : layer.items;
        const columns = group ? group.columns : layer.columns;
        if (items.length === 0) fail(line, 'span 必须用在当前层或分组的 item 之后');
        if (!Number.isInteger(span) || span < 1 || span > columns) {
          fail(line, `span 必须是 1 到当前 columns（${columns}）的整数`);
        }
        items[items.length - 1].span = span;
        break;
      }
      case 'item': {
        const item = requiredValue(value, line, command);
        if (group) group.items.push({ text: item, span: 1 });
        else {
          if (layer.groups.length > 0) fail(line, '同一层不能混用独立 item 和 group');
          layer.items.push({ text: item, span: 1 });
        }
        break;
      }
      case 'group': {
        if (group) fail(line, '分组不能嵌套，请先使用 end 关闭当前分组');
        if (layer.items.length > 0) fail(line, '同一层不能混用独立 item 和 group');
        const title = requiredValue(value, line, command);
        group = { title, columns: 1, items: [] };
        layer.groups.push(group);
        break;
      }
      case 'end':
        if (!group) fail(line, 'end 没有对应的 group');
        group = null;
        break;
      case 'link': {
        if (group) fail(line, '请先使用 end 关闭分组，再声明 link');
        const relation = /^(.+?)\s+(->|<-|<>)\s+(.+?)(?:\s+\|\s+(.*))?$/.exec(
          requiredValue(value, line, command),
        );
        if (!relation) fail(line, 'link 格式应为：link 来源 -> 目标 | 可选说明');
        const sourceGroup = relation[1].trim();
        const targetGroup = relation[3].trim();
        for (const name of [sourceGroup, targetGroup]) {
          const matches = layer.groups.filter((candidate) => candidate.title === name);
          if (matches.length === 0) fail(line, `link 引用了不存在的分组“${name}”`);
          if (matches.length > 1) fail(line, `link 引用了重复分组“${name}”，请先改成唯一名称`);
        }
        layer.links.push({
          source: sourceGroup,
          target: targetGroup,
          direction: relation[2] === '->' ? 'forward' : relation[2] === '<-' ? 'backward' : 'both',
          label: relation[4]?.trim() ?? '',
        });
        break;
      }
      default:
        fail(line, `未知命令“${command}”`);
    }
  }

  if (group) throw new Error(`分组“${group.title}”尚未使用 end 关闭`);
  if (layers.length === 0) throw new Error('请至少使用 layer 定义一层');
  for (const candidate of layers) {
    if (candidate.items.length === 0 && candidate.groups.length === 0) {
      throw new Error(`层“${candidate.label}”没有 item 或 group 内容`);
    }
  }
  return layers;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function renderItems(items: LayerItem[], columns: number): string {
  return `<div class="layer-items layer-columns-${columns}">${items.map((item) => {
    const span = item.span > 1 ? ` layer-item-span-${item.span}` : '';
    return `<div class="layer-item${span}">${escapeHtml(item.text)}</div>`;
  }).join('')}</div>`;
}

function renderLink(link: LayerLink): string {
  const label = link.label ? `<span class="layer-link-label">${escapeHtml(link.label)}</span>` : '';
  return `<div class="layer-link"><span class="layer-link-source">${escapeHtml(link.source)}</span>` +
    `<span class="layer-link-relation">${label}<span class="layer-link-line layer-link-${link.direction}"></span></span>` +
    `<span class="layer-link-target">${escapeHtml(link.target)}</span></div>`;
}

function renderLayer(layer: DiagramLayer, isLast: boolean): string {
  const title = layer.title ? `<div class="layer-title">${escapeHtml(layer.title)}</div>` : '';
  const content = layer.groups.length > 0
    ? `<div class="layer-groups layer-columns-${layer.columns}">${layer.groups.map((group) =>
        `<div class="layer-group"><div class="layer-group-title">${escapeHtml(group.title)}</div>${renderItems(group.items, group.columns)}</div>`).join('')}</div>`
    : renderItems(layer.items, layer.columns);
  const links = layer.links.length > 0
    ? `<div class="layer-links">${layer.links.map(renderLink).join('')}</div>`
    : '';
  const connector = isLast ? '' : '<div class="layer-connector" aria-hidden="true"></div>';
  return `<section class="layer-row layer-tone-${layer.tone}"><div class="layer-label">${escapeHtml(layer.label)}</div>` +
    '<div class="layer-side-arrow" aria-hidden="true"></div>' +
    `<div class="layer-panel">${title}${content}${links}</div></section>${connector}`;
}

export function renderLayeredDiagram(source: string, sourceLine: number): string {
  try {
    const layers = parseLayeredDiagram(source);
    return `<div class="layer-diagram" data-source-line="${sourceLine}">${layers.map((layer, index) =>
      renderLayer(layer, index === layers.length - 1)).join('')}</div>`;
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法解析分层图';
    return `<pre class="layer-diagram-error" data-source-line="${sourceLine}">${escapeHtml(`分层图解析失败：${message}\n\n${source}`)}</pre>`;
  }
}
