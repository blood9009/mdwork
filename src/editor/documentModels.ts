import { monaco } from './monaco';

export interface DocumentModelStats {
  revision: number;
  dirty: boolean;
  lineCount: number;
  characterCount: number;
}

export interface DocumentSnapshot {
  content: string;
  version: number;
}

interface DocumentEntry {
  model: monaco.editor.ITextModel;
  savedVersion: number;
  revision: number;
  listeners: Set<(stats: DocumentModelStats) => void>;
}

export class DocumentModelRegistry {
  private entries = new Map<string, DocumentEntry>();

  create(documentId: string, content: string): monaco.editor.ITextModel {
    if (this.entries.has(documentId)) throw new Error(`文档模型已存在：${documentId}`);
    const model = monaco.editor.createModel(content, 'markdown');
    const entry: DocumentEntry = {
      model,
      savedVersion: model.getAlternativeVersionId(),
      revision: 0,
      listeners: new Set(),
    };
    this.entries.set(documentId, entry);
    model.onDidChangeContent(() => {
      entry.revision += 1;
      const stats = this.stats(documentId);
      for (const listener of entry.listeners) listener(stats);
    });
    return model;
  }

  get(documentId: string): monaco.editor.ITextModel {
    const model = this.entries.get(documentId)?.model;
    if (!model) throw new Error(`文档模型不存在：${documentId}`);
    return model;
  }

  stats(documentId: string): DocumentModelStats {
    const entry = this.entries.get(documentId);
    if (!entry) throw new Error(`文档模型不存在：${documentId}`);
    return {
      revision: entry.revision,
      dirty: entry.model.getAlternativeVersionId() !== entry.savedVersion,
      lineCount: entry.model.getLineCount(),
      characterCount: entry.model.getValueLength(),
    };
  }

  subscribe(documentId: string, listener: (stats: DocumentModelStats) => void): () => void {
    const entry = this.entries.get(documentId);
    if (!entry) throw new Error(`文档模型不存在：${documentId}`);
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }

  snapshot(documentId: string): DocumentSnapshot {
    const entry = this.entries.get(documentId);
    if (!entry) throw new Error(`文档模型不存在：${documentId}`);
    return { content: entry.model.getValue(), version: entry.model.getAlternativeVersionId() };
  }

  markSaved(documentId: string, version: number): DocumentModelStats {
    const entry = this.entries.get(documentId);
    if (!entry) throw new Error(`文档模型不存在：${documentId}`);
    entry.savedVersion = version;
    return this.stats(documentId);
  }

  appendText(documentId: string, text: string): void {
    const model = this.get(documentId);
    const lineNumber = model.getLineCount();
    const lastLine = model.getLineContent(lineNumber);
    const prefix = lastLine ? '\n' : '';
    model.pushEditOperations([], [{
      range: {
        startLineNumber: lineNumber,
        startColumn: model.getLineMaxColumn(lineNumber),
        endLineNumber: lineNumber,
        endColumn: model.getLineMaxColumn(lineNumber),
      },
      text: `${prefix}${text}`,
      forceMoveMarkers: true,
    }], () => null);
  }

  dispose(documentId: string): void {
    const entry = this.entries.get(documentId);
    if (!entry) return;
    entry.listeners.clear();
    entry.model.dispose();
    this.entries.delete(documentId);
  }
}
