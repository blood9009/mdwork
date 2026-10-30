import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  mode: 'split' | 'edit' | 'preview';
}

export function SplitPane({ left, right, mode }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(50);

  function resize(event: PointerEvent<HTMLDivElement>) {
    if (!containerRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const percentage = ((event.clientX - bounds.left) / bounds.width) * 100;
    setRatio(Math.min(75, Math.max(25, percentage)));
  }

  return (
    <div className={`split-pane view-${mode}`} ref={containerRef}>
      <section className="editor-pane" style={mode === 'split' ? { width: `calc(${ratio}% - 3px)` } : undefined}>
        {left}
      </section>
      {mode === 'split' && (
        <div
          className="pane-divider"
          role="separator"
          aria-label="调整编辑与预览宽度"
          aria-orientation="vertical"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={resize}
          onDoubleClick={() => setRatio(50)}
        />
      )}
      <section className="preview-pane">
        {right}
      </section>
    </div>
  );
}
