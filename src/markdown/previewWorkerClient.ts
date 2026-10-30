import type { RenderedMarkdown } from './htmlRenderer';

interface PendingRequest {
  resolve: (result: RenderedMarkdown) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{
    requestId: number;
    result?: RenderedMarkdown;
    error?: string;
  }>) => {
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    if (event.data.result) request.resolve(event.data.result);
    else request.reject(new Error(event.data.error ?? 'Markdown 解析失败'));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Markdown 解析 Worker 运行失败');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function renderMarkdownInWorker(content: string): Promise<RenderedMarkdown> {
  const requestId = ++nextRequestId;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    try {
      getWorker().postMessage({ requestId, content });
    } catch (error) {
      pending.delete(requestId);
      reject(error instanceof Error ? error : new Error('无法启动 Markdown 解析 Worker'));
    }
  });
}
