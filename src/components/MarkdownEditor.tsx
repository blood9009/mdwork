import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { monaco } from '../editor/monaco';
import { findInvisibleCharacters } from '../editor/invisibleCharacters';
import { applyFormatEdit, type EditorFormatCommand } from '../editor/formatting';
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
  format: (command: EditorFormatCommand) => void;
  revealLine: (line: number) => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ documentId, model, settings, largeFile, onActivate, onChange, onVisibleLineChange, value }, forwardedRef) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const scrollRef = useRef(onVisibleLineChange);
    const activateRef = useRef(onActivate);
    const changeRef = useRef(onChange);
    const showHiddenCharactersRef = useRef(settings.showHiddenCharacters);
    const refreshHiddenCharactersRef = useRef<() => void>(() => {});
    const documentIdRef = useRef(documentId ?? 'single-document');
    const viewStatesRef = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
    scrollRef.current = onVisibleLineChange;
    activateRef.current = onActivate;
    changeRef.current = onChange;
    showHiddenCharactersRef.current = settings.showHiddenCharacters;

    useImperativeHandle(forwardedRef, () => ({
      format(command) {
        const editor = editorRef.current;
        if (editor) applyFormatEdit(editor, command);
      },
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
        renderControlCharacters: false,
        fixedOverflowWidgets: true,
        tabSize: 2,
      });
      editorRef.current = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
        applyFormatEdit(editor, { type: 'inline', format: 'bold' });
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
        applyFormatEdit(editor, { type: 'inline', format: 'italic' });
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => {
        applyFormatEdit(editor, { type: 'inline', format: 'underline' });
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyX, () => {
        applyFormatEdit(editor, { type: 'inline', format: 'strikethrough' });
      });
      documentIdRef.current = documentId ?? 'single-document';
      const hiddenDecorations = editor.createDecorationsCollection();
      let hiddenFrame: number | null = null;
      const refreshHiddenCharacters = () => {
        if (hiddenFrame !== null) return;
        hiddenFrame = window.requestAnimationFrame(() => {
          hiddenFrame = null;
          const currentModel = editor.getModel();
          if (!showHiddenCharactersRef.current || !currentModel) {
            hiddenDecorations.clear();
            return;
          }
          const decorations: monaco.editor.IModelDeltaDecoration[] = [];
          const seen = new Set<string>();
          for (const visibleRange of editor.getVisibleRanges()) {
            for (let lineNumber = visibleRange.startLineNumber; lineNumber <= visibleRange.endLineNumber; lineNumber += 1) {
              const line = currentModel.getLineContent(lineNumber);
              const start = lineNumber === visibleRange.startLineNumber ? visibleRange.startColumn - 1 : 0;
              const end = lineNumber === visibleRange.endLineNumber
                ? Math.min(line.length, visibleRange.endColumn - 1) : line.length;
              for (const character of findInvisibleCharacters(line, start, end)) {
                const key = `${lineNumber}:${character.index}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const column = character.index + 1;
                decorations.push({
                  range: { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column + character.length },
                  options: {
                    inlineClassName: 'mdwork-invisible-source',
                    inlineClassNameAffectsLetterSpacing: true,
                    after: {
                      content: character.label,
                      inlineClassName: 'mdwork-invisible-character',
                      inlineClassNameAffectsLetterSpacing: true,
                      cursorStops: monaco.editor.InjectedTextCursorStops.None,
                    },
                  },
                });
              }
            }
          }
          hiddenDecorations.set(decorations);
        });
      };
      refreshHiddenCharactersRef.current = refreshHiddenCharacters;
      const scrollDisposable = editor.onDidScrollChange(() => {
        const line = editor.getVisibleRanges()[0]?.startLineNumber ?? 1;
        scrollRef.current(line);
        refreshHiddenCharacters();
      });
      const layoutDisposable = editor.onDidLayoutChange(refreshHiddenCharacters);
      const modelDisposable = editor.onDidChangeModel(refreshHiddenCharacters);
      const focusDisposable = editor.onDidFocusEditorText(() => activateRef.current?.());
      const changeDisposable = editor.onDidChangeModelContent(() => {
        if (!model) changeRef.current?.(editor.getValue());
        refreshHiddenCharacters();
      });
      refreshHiddenCharacters();

      return () => {
        if (hiddenFrame !== null) window.cancelAnimationFrame(hiddenFrame);
        refreshHiddenCharactersRef.current = () => {};
        hiddenDecorations.clear();
        scrollDisposable.dispose();
        layoutDisposable.dispose();
        modelDisposable.dispose();
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
        renderControlCharacters: false,
        wordWrap: largeFile ? 'off' : 'on',
      });
      refreshHiddenCharactersRef.current();
      monaco.editor.setTheme(settings.theme === 'dark' ? 'vs-dark' : 'vs');
    }, [settings.theme, settings.editorFont, settings.editorFontSize, settings.showHiddenCharacters, largeFile]);

    return <div className="monaco-container" ref={containerRef} aria-label="Markdown 编辑器"
      onPointerDown={() => activateRef.current?.()} />;
  },
);
