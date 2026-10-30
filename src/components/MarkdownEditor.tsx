import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { monaco } from '../editor/monaco';
import type { AppSettings } from '../settings';

interface MarkdownEditorBaseProps {
  settings: AppSettings;
  onVisibleLineChange: (line: number) => void;
}

type MarkdownEditorProps = MarkdownEditorBaseProps & ({
  documentId: string;
  model: monaco.editor.ITextModel;
  largeFile: boolean;
  onActivate: () => void;
  value?: undefined;
  onChange?: undefined;
} | {
  documentId?: undefined;
  model?: undefined;
  largeFile?: boolean;
  onActivate?: () => void;
  value: string;
  onChange: (value: string) => void;
});

export interface MarkdownEditorHandle {
  insertText: (text: string) => void;
  revealLine: (line: number) => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ documentId, model, settings, largeFile, onActivate, onChange, onVisibleLineChange, value }, forwardedRef) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const scrollRef = useRef(onVisibleLineChange);
    const activateRef = useRef(onActivate);
    const changeRef = useRef(onChange);
    const documentIdRef = useRef(documentId ?? 'single-document');
    const viewStatesRef = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
    scrollRef.current = onVisibleLineChange;
    activateRef.current = onActivate;
    changeRef.current = onChange;

    useImperativeHandle(forwardedRef, () => ({
      revealLine(line) {
        const editor = editorRef.current;
        const currentModel = editor?.getModel();
        if (!editor || !currentModel) return;
        const lineNumber = Math.min(currentModel.getLineCount(), Math.max(1, Math.floor(line)));
        editor.setPosition({ lineNumber, column: 1 });
        editor.revealLineInCenter(lineNumber);
        editor.focus();
      },
      insertText(text) {
        const editor = editorRef.current;
        const currentModel = editor?.getModel();
        const range = editor?.getSelection() ?? currentModel?.getFullModelRange();
        if (!editor || !currentModel || !range) return;
        const startLine = currentModel.getLineContent(range.startLineNumber);
        const endLine = currentModel.getLineContent(range.endLineNumber);
        const startsAtLineBeginning = range.startColumn === 1;
        const prefix = !startsAtLineBeginning && startLine[range.startColumn - 2] !== '\n' ? '\n' : '';
        const endsAtLineEnd = range.endColumn >= currentModel.getLineMaxColumn(range.endLineNumber);
        const hasFollowingLine = range.endLineNumber < currentModel.getLineCount();
        const hasTextAfterEnd = range.endColumn <= endLine.length;
        const endsNonemptyFile = endsAtLineEnd && !hasFollowingLine && endLine.length > 0;
        const suffix = hasTextAfterEnd || endsNonemptyFile ? '\n' : '';
        editor.executeEdits('insert-markdown-resource', [{
          range, text: `${prefix}${text}${suffix}`, forceMoveMarkers: true,
        }]);
        editor.focus();
      },
    }), []);

    useEffect(() => {
      if (!containerRef.current) return;
      const editor = monaco.editor.create(containerRef.current, {
        model: model ?? null,
        value: model ? undefined : value,
        language: model ? undefined : 'markdown',
        theme: settings.theme === 'dark' ? 'vs-dark' : 'vs',
        automaticLayout: true,
        largeFileOptimizations: true,
        wordWrap: 'on',
        minimap: { enabled: false },
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 12,
        padding: { top: 18, bottom: 40 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        fontLigatures: true,
        renderWhitespace: 'selection',
        renderControlCharacters: true,
        fixedOverflowWidgets: true,
        tabSize: 2,
      });
      editorRef.current = editor;
      documentIdRef.current = documentId ?? 'single-document';
      const scrollDisposable = editor.onDidScrollChange(() => {
        const line = editor.getVisibleRanges()[0]?.startLineNumber ?? 1;
        scrollRef.current(line);
      });
      const focusDisposable = editor.onDidFocusEditorText(() => activateRef.current?.());
      const changeDisposable = editor.onDidChangeModelContent(() => {
        if (!model) changeRef.current?.(editor.getValue());
      });

      return () => {
        scrollDisposable.dispose();
        focusDisposable.dispose();
        changeDisposable.dispose();
        editor.dispose();
        editorRef.current = null;
      };
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      if (!model) {
        if (value !== undefined && editor.getValue() !== value) editor.setValue(value);
        return;
      }
      if (editor.getModel() === model) return;
      viewStatesRef.current.set(documentIdRef.current, editor.saveViewState());
      documentIdRef.current = documentId ?? 'single-document';
      editor.setModel(model);
      const viewState = viewStatesRef.current.get(documentIdRef.current);
      if (viewState) editor.restoreViewState(viewState);
    }, [documentId, model, value]);

    useEffect(() => {
      editorRef.current?.updateOptions({
        fontFamily: settings.editorFont,
        fontSize: settings.editorFontSize,
        renderWhitespace: settings.showHiddenCharacters ? 'all' : 'selection',
        renderControlCharacters: true,
        wordWrap: largeFile ? 'off' : 'on',
      });
      monaco.editor.setTheme(settings.theme === 'dark' ? 'vs-dark' : 'vs');
    }, [settings.theme, settings.editorFont, settings.editorFontSize, settings.showHiddenCharacters, largeFile]);

    return <div className="monaco-container" ref={containerRef} aria-label="Markdown 编辑器"
      onPointerDown={() => activateRef.current?.()} />;
  },
);
