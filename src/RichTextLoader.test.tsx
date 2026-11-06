import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, THEMES } from './model';
import type { RichTextEditorProps } from './RichTextEditor';
import { createRichTextLoader } from './RichTextLoader';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const element = createElement('text', THEMES[0]);
function LoadedEditor({ element, background, onSave }: RichTextEditorProps) {
  return (
    <section role="dialog" aria-label="Loaded editor" style={{ background }}>
      <p>{element.text}</p>
      <button onClick={() => onSave(element)}>Save loaded text</button>
    </section>
  );
}

describe('rich editor loading recovery', () => {
  it('keeps the workspace mounted when loading fails and closes without changing its document', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSave = vi.fn();
    const Loader = createRichTextLoader(() => Promise.reject(new Error('Chunk request failed')));
    function Workspace() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <div className="app-shell">
            <input aria-label="Workspace title" defaultValue="Unsaved title" />
          </div>
          {open && <Loader element={element} onSave={onSave} onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Workspace />);
    const title = screen.getByLabelText('Workspace title');
    expect((await screen.findByRole('alert')).textContent).toContain('presentation is unchanged');
    expect(screen.getByLabelText('Workspace title')).toBe(title);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((title as HTMLInputElement).value).toBe('Unsaved title');
    expect(title.closest('.app-shell')?.hasAttribute('inert')).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('retries with a new load attempt and passes the unchanged editor props through', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi
      .fn<() => Promise<{ default: typeof LoadedEditor }>>()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ default: LoadedEditor });
    const Loader = createRichTextLoader(load);
    const onSave = vi.fn();
    render(<Loader element={element} background="#123456" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    const editor = await screen.findByRole('dialog', { name: 'Loaded editor' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(editor.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save loaded text' }));
    expect(onSave).toHaveBeenCalledWith(element);
  });

  it('supports Escape while loading and does not reopen after a cancelled request resolves', async () => {
    let resolveLoad!: (module: { default: typeof LoadedEditor }) => void;
    const Loader = createRichTextLoader(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const onSave = vi.fn();
    function Workspace() {
      const [open, setOpen] = useState(true);
      return (
        <>{open && <Loader element={element} onSave={onSave} onClose={() => setOpen(false)} />}</>
      );
    }
    render(<Workspace />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => resolveLoad({ default: LoadedEditor }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
