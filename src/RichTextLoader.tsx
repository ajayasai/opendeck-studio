import { Component, lazy, Suspense, useId, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { RichTextEditorProps } from './RichTextEditor';
import { useDialog } from './useDialog';

type EditorModule = { default: ComponentType<RichTextEditorProps> };

function LoadDialog({
  failed = false,
  onClose,
  onRetry,
}: {
  failed?: boolean;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const titleId = useId();
  useDialog(true, onClose);
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{failed ? 'Text editor could not load' : 'Loading text editor…'}</h2>
        <p role={failed ? 'alert' : 'status'}>
          {failed
            ? 'Your presentation is unchanged. Check your connection and try again, or close this dialog to keep working.'
            : 'Your presentation is ready. You can cancel while the text editor loads.'}
        </p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            {failed ? 'Close' : 'Cancel'}
          </button>
          {failed && (
            <button className="primary-button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

class EditorLoadBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A fresh lazy component lets a failed module request be retried without replacing the deck. */
export function createRichTextLoader(loadEditor: () => Promise<EditorModule>) {
  return function RichTextLoader(props: RichTextEditorProps) {
    const [{ Editor, attempt }, setAttempt] = useState(() => ({
      Editor: lazy(loadEditor),
      attempt: 0,
    }));
    function retry() {
      setAttempt(({ attempt }) => ({ Editor: lazy(loadEditor), attempt: attempt + 1 }));
    }
    return (
      <EditorLoadBoundary
        key={attempt}
        fallback={<LoadDialog failed onClose={props.onClose} onRetry={retry} />}
      >
        <Suspense fallback={<LoadDialog onClose={props.onClose} />}>
          <Editor {...props} />
        </Suspense>
      </EditorLoadBoundary>
    );
  };
}

export default createRichTextLoader(() => import('./RichTextEditor'));
