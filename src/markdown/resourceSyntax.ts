export type ResourceInsertMode = 'image' | 'link';

export interface ResourceInsert {
  url: string;
  label: string;
  mode: ResourceInsertMode;
}

function escapeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
    .replace(/[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/g, '\\$&');
}

function safeDestination(value: string): string {
  return value.replace(/[\r\n]/g, '').replace(/>/g, '%3E');
}

export function resourceMarkdown({ url, label, mode }: ResourceInsert): string {
  const fallback = mode === 'image' ? '图片' : url;
  const text = escapeLabel(label || fallback);
  const destination = `<${safeDestination(url.trim())}>`;
  return `${mode === 'image' ? '!' : ''}[${text}](${destination})`;
}
