/// <reference lib="webworker" />

import { renderMarkdown } from './renderMarkdown';

interface ParseRequest {
  requestId: number;
  content: string;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { requestId, content } = event.data;
  try {
    const result = renderMarkdown(content);
    workerScope.postMessage({ requestId, result });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      error: error instanceof Error ? error.message : 'Markdown 解析失败',
    });
  }
};
