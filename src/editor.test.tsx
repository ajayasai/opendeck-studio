import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import Canvas from './Canvas';
import Presenter from './Presenter';
import { createDeck, createElement, createSlide, validateDeck } from './model';
import { useEditor } from './useEditor';
import type { Deck } from './types';

const persistence = vi.hoisted(() => ({
  loadDeck: vi.fn(),
  saveDeck: vi.fn(),
  listSavedDecks: vi.fn(),
  loadSavedDeck: vi.fn(),
}));
vi.mock('./storage', () => persistence);

class TestResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe() {
    this.callback(
      [{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

const user = () => userEvent.setup();
const elapsed = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
async function flushSave() {
  await act(async () => {
    await elapsed(650);
  });
}
async function boot() {
  render(<App />);
  await act(async () => {});
  return screen.getByLabelText('Presentation title') as HTMLInputElement;
}
function storedDeck(): Deck {
  return persistence.saveDeck.mock.calls.at(-1)![0] as Deck;
}
function nativeFile(contents: string, name = 'test.opendeck'): File {
  const file = new File([contents], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => contents });
  return file;
}

beforeEach(() => {
  persistence.loadDeck.mockReset().mockResolvedValue(null);
  persistence.saveDeck.mockReset().mockResolvedValue(undefined);
  persistence.listSavedDecks.mockReset().mockResolvedValue([]);
  persistence.loadSavedDeck.mockReset().mockResolvedValue(null);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('workspace persistence and file recovery', () => {
  it('waits for startup restoration before autosaving, then saves the restored deck', async () => {
    const saved = createDeck();
    saved.title = 'Saved work';
    let restore!: (deck: Deck) => void;
    persistence.loadDeck.mockImplementation(
      () =>
        new Promise<Deck>((resolve) => {
          restore = resolve;
        }),
    );
    render(<App />);
    await flushSave();
    expect(persistence.saveDeck).not.toHaveBeenCalled();
    expect(screen.getByText('Opening your workspace…')).toBeTruthy();
    await act(async () => restore(saved));
    expect((screen.getByLabelText('Presentation title') as HTMLInputElement).value).toBe(
      'Saved work',
    );
    await flushSave();
    expect(storedDeck()).toEqual(saved);
  });

  it('debounces edits and saves a valid document containing the latest title and notes', async () => {
    const title = await boot();
    fireEvent.change(title, { target: { value: 'First draft' } });
    await act(async () => {
      await elapsed(200);
    });
    fireEvent.change(title, { target: { value: 'Final story' } });
    fireEvent.change(screen.getByLabelText(/Speaker notes/), {
      target: { value: 'Remember this point.' },
    });
    await flushSave();
    expect(persistence.saveDeck).toHaveBeenCalledTimes(1);
    expect(storedDeck().title).toBe('Final story');
    expect(storedDeck().slides[0].notes).toBe('Remember this point.');
    expect(validateDeck(storedDeck())).toEqual(storedDeck());
  });

  it('pauses autosave on corrupt recovery and keeps the existing stored copy untouched', async () => {
    persistence.loadDeck.mockRejectedValue(new Error('Invalid saved data'));
    await boot();
    expect(screen.getByRole('dialog', { name: 'Could not restore the saved deck' })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: 'Continue editing' }));
    fireEvent.change(screen.getByLabelText('Presentation title'), {
      target: { value: 'Unsaved recovery work' },
    });
    await flushSave();
    expect(persistence.saveDeck).not.toHaveBeenCalled();
    expect(screen.getByText('Recovery needed')).toBeTruthy();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('reports a save failure and keeps edits available', async () => {
    persistence.saveDeck.mockRejectedValue(
      new DOMException('Quota exceeded', 'QuotaExceededError'),
    );
    const title = await boot();
    fireEvent.change(title, { target: { value: 'Still here' } });
    await flushSave();
    expect(screen.getByText('Save failed · download a backup')).toBeTruthy();
    expect(title.value).toBe('Still here');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('rejects an invalid native file without replacing current work', async () => {
    const title = await boot();
    fireEvent.change(title, { target: { value: 'Keep this deck' } });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open presentation file'), {
        target: { files: [nativeFile('{"schemaVersion":99}')] },
      });
    });
    expect(screen.getByRole('dialog', { name: 'Could not open this file' })).toBeTruthy();
    expect(title.value).toBe('Keep this deck');
    await flushSave();
    expect(storedDeck().title).toBe('Keep this deck');
  });

  it('opens a native file and supports undo back to the previous deck', async () => {
    const title = await boot();
    const original = title.value;
    const incoming = createDeck();
    incoming.title = 'Imported backup';
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open presentation file'), {
        target: { files: [nativeFile(JSON.stringify(incoming))] },
      });
    });
    expect(title.value).toBe('Imported backup');
    await user().click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(title.value).toBe(original);
    await user().click(screen.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' }));
    expect(title.value).toBe('Imported backup');
  });
});

describe('editor workflows', () => {
  it('adds a slide, edits its name, and restores slide creation with undo/redo', async () => {
    await boot();
    await user().click(screen.getByRole('button', { name: 'Add slide' }));
    expect(screen.getByText('Slide 2 of 6')).toBeTruthy();
    const name = screen.getByLabelText('Slide name');
    fireEvent.change(name, { target: { value: 'New chapter' } });
    fireEvent.blur(name);
    expect(screen.getByRole('button', { name: 'Slide 2: New chapter' })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(screen.getByRole('button', { name: 'Slide 2: Untitled slide' })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(screen.getByText('Slide 2 of 5')).toBeTruthy();
    await user().click(screen.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' }));
    expect(screen.getByText('Slide 2 of 6')).toBeTruthy();
  });

  it('edits text, duplicates the updated object and deletes only the duplicate', async () => {
    await boot();
    await user().click(screen.getByRole('button', { name: 'Text' }));
    const editor = screen.getByLabelText('Text', { selector: 'textarea' });
    fireEvent.change(editor, { target: { value: 'A useful idea' } });
    fireEvent.blur(editor);
    await user().click(screen.getByRole('button', { name: 'Duplicate (Ctrl+D)' }));
    await flushSave();
    let matching = storedDeck().slides[0].elements.filter(
      (e) => e.type === 'text' && e.text === 'A useful idea',
    );
    expect(matching).toHaveLength(2);
    expect(matching[0].id).not.toBe(matching[1].id);
    await user().click(screen.getByRole('button', { name: 'Delete selected objects' }));
    await flushSave();
    matching = storedDeck().slides[0].elements.filter(
      (e) => e.type === 'text' && e.text === 'A useful idea',
    );
    expect(matching).toHaveLength(1);
  });

  it('Ctrl+S commits inline and inspector text drafts before downloading the backup', async () => {
    let downloaded: Blob | undefined;
    class DownloadURL extends URL {
      static createObjectURL(blob: Blob) {
        downloaded = blob;
        return 'blob:opendeck-test';
      }
      static revokeObjectURL() {}
    }
    vi.stubGlobal('URL', DownloadURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const backup = () =>
      new Promise<Deck>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(JSON.parse(String(reader.result)));
        reader.onerror = reject;
        reader.readAsText(downloaded!);
      });
    await boot();
    await user().click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'text: Your next big idea' }));
    const inline = screen.getByRole('textbox', { name: 'Edit text on slide' });
    fireEvent.change(inline, { target: { value: 'Saved from the canvas' } });
    fireEvent.keyDown(inline, { key: 's', ctrlKey: true });
    let saved = await backup();
    expect(
      saved.slides[0].elements.some((e) => e.type === 'text' && e.text === 'Saved from the canvas'),
    ).toBe(true);
    const inspector = screen.getByLabelText('Text', { selector: 'textarea' });
    await user().click(inspector);
    fireEvent.change(inspector, { target: { value: 'Saved from the inspector' } });
    fireEvent.keyDown(inspector, { key: 's', ctrlKey: true });
    saved = await backup();
    expect(
      saved.slides[0].elements.some(
        (e) => e.type === 'text' && e.text === 'Saved from the inspector',
      ),
    ).toBe(true);
  });

  it('validates pasted table rows before committing them', async () => {
    await boot();
    await user().click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.change(screen.getByLabelText('Table data'), {
      target: { value: 'Name\tValue\nOnly one' },
    });
    await user().click(screen.getByRole('button', { name: 'Apply table data' }));
    expect(screen.getByRole('alert').textContent).toContain('same number');
    fireEvent.change(screen.getByLabelText('Table data'), {
      target: { value: 'Name\tValue\nRevenue\t42' },
    });
    await user().click(screen.getByRole('button', { name: 'Apply table data' }));
    await flushSave();
    const table = storedDeck().slides[0].elements.at(-1);
    expect(table?.type === 'table' && table.rows).toEqual([
      ['Name', 'Value'],
      ['Revenue', '42'],
    ]);
  });

  it('rejects mismatched chart data and commits valid negative values for a bar chart', async () => {
    await boot();
    await user().click(screen.getByRole('button', { name: 'Chart' }));
    fireEvent.change(screen.getByLabelText('Labels'), { target: { value: 'Profit\nLoss' } });
    fireEvent.change(screen.getByLabelText('Values'), { target: { value: '10' } });
    await user().click(screen.getByRole('button', { name: 'Apply chart data' }));
    expect(screen.getByRole('alert').textContent).toContain('matching');
    fireEvent.change(screen.getByLabelText('Values'), { target: { value: '10\n-3' } });
    await user().click(screen.getByRole('button', { name: 'Apply chart data' }));
    await flushSave();
    const chart = storedDeck().slides[0].elements.at(-1);
    expect(chart?.type === 'chart' && chart.values).toEqual([10, -3]);
    expect((screen.getByRole('option', { name: 'Pie' }) as HTMLOptionElement).disabled).toBe(true);
  });
});

function canvasDeck() {
  const deck = createDeck();
  const slide = createSlide(deck.theme);
  const one = createElement('text', deck.theme);
  one.name = 'First';
  one.text = 'Original';
  one.x = 100;
  one.y = 100;
  const two = createElement('shape', deck.theme);
  two.name = 'Second';
  two.x = 500;
  two.y = 200;
  slide.elements = [one, two];
  deck.slides = [slide];
  return deck;
}
function CanvasHarness() {
  const editor = useEditor(canvasDeck);
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <button onClick={editor.undo} disabled={!editor.canUndo}>
        Undo action
      </button>
      <button onClick={editor.redo} disabled={!editor.canRedo}>
        Redo action
      </button>
      <output data-testid="document">{JSON.stringify(editor.deck)}</output>
      <output data-testid="selection">{selected.join(',')}</output>
      <Canvas
        deck={editor.deck}
        slide={editor.deck.slides[0]}
        selected={selected}
        onSelect={setSelected}
        onChange={(elements) =>
          editor.commit((d) => ({ ...d, slides: [{ ...d.slides[0], elements }] }))
        }
        zoom={0.5}
        grid={false}
      />
    </>
  );
}
const harnessDeck = (): Deck => JSON.parse(screen.getByTestId('document').textContent!);

describe('canvas gestures and history', () => {
  it('supports shift selection and commits an entire zoom-aware drag as one undo command', async () => {
    render(<CanvasHarness />);
    const first = screen.getByRole('button', { name: 'text: First' });
    const second = screen.getByRole('button', { name: 'shape: Second' });
    fireEvent.pointerDown(first, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(first);
    fireEvent.pointerDown(second, { button: 0, clientX: 250, clientY: 100, shiftKey: true });
    fireEvent.pointerUp(second);
    expect(screen.getByTestId('selection').textContent?.split(',')).toHaveLength(2);
    fireEvent.pointerDown(first, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(first, { clientX: 60, clientY: 55 });
    fireEvent.pointerMove(first, { clientX: 70, clientY: 60 });
    fireEvent.pointerUp(first);
    expect(harnessDeck().slides[0].elements.map((e) => [e.x, e.y])).toEqual([
      [140, 120],
      [540, 220],
    ]);
    await user().click(screen.getByRole('button', { name: 'Undo action' }));
    expect(harnessDeck().slides[0].elements.map((e) => [e.x, e.y])).toEqual([
      [100, 100],
      [500, 200],
    ]);
    expect(
      (screen.getByRole('button', { name: 'Undo action' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user().click(screen.getByRole('button', { name: 'Redo action' }));
    expect(harnessDeck().slides[0].elements[0].x).toBe(140);
  });

  it('commits an inline text edit once and preserves it when dragging a second object', () => {
    render(<CanvasHarness />);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'text: First' }));
    const textarea = screen.getByRole('textbox', { name: 'Edit text on slide' });
    fireEvent.change(textarea, { target: { value: 'Revised story' } });
    const second = screen.getByRole('button', { name: 'shape: Second' });
    // Browser order: pointerdown on the new object precedes blur of the textarea.
    fireEvent.pointerDown(second, { button: 0, clientX: 250, clientY: 100 });
    fireEvent.blur(textarea);
    fireEvent.pointerMove(second, { clientX: 270, clientY: 120 });
    fireEvent.pointerUp(second);
    const updated = harnessDeck().slides[0].elements[0];
    expect(updated.type === 'text' && updated.text).toBe('Revised story');
    fireEvent.click(screen.getByRole('button', { name: 'Undo action' }));
    const afterDragUndo = harnessDeck().slides[0].elements;
    expect(afterDragUndo[0].type === 'text' && afterDragUndo[0].text).toBe('Revised story');
    expect(afterDragUndo[1].x).toBe(500);
    fireEvent.click(screen.getByRole('button', { name: 'Undo action' }));
    const afterTextUndo = harnessDeck().slides[0].elements[0];
    expect(afterTextUndo.type === 'text' && afterTextUndo.text).toBe('Original');
  });

  it('cancels inline text changes on Escape', () => {
    render(<CanvasHarness />);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'text: First' }));
    const textarea = screen.getByRole('textbox', { name: 'Edit text on slide' });
    fireEvent.change(textarea, { target: { value: 'Discard this draft' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Edit text on slide' })).toBeNull();
    expect(
      within(screen.getByRole('button', { name: 'text: First' })).getByText('Original'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Undo action' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('presenter navigation', () => {
  it('skips hidden slides, navigates with arrows, blackouts, and closes with Escape', () => {
    const deck = createDeck();
    deck.slides = deck.slides.slice(0, 3);
    deck.slides[1].hidden = true;
    const close = vi.fn();
    const view = render(<Presenter deck={deck} start={0} onClose={close} />);
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next slide' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.keyDown(window, { key: 'b' });
    expect((view.container.querySelector('.presented-slide') as HTMLElement).style.visibility).toBe(
      'hidden',
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect((view.container.querySelector('.presented-slide') as HTMLElement).style.visibility).toBe(
      'visible',
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows the current speaker notes and advances the rehearsal timer', () => {
    vi.useFakeTimers();
    const deck = createDeck();
    deck.slides[0].notes = 'Remember to breathe.';
    render(<Presenter deck={deck} start={0} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(screen.getByText('Remember to breathe.')).toBeTruthy();
    expect(screen.getByText('Presenter workspace · notes visible on this screen')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('00:02')).toBeTruthy();
  });

  it('provides an exit when all slides are hidden', () => {
    const deck = createDeck();
    deck.slides.forEach((slide) => {
      slide.hidden = true;
    });
    const close = vi.fn();
    render(<Presenter deck={deck} start={0} onClose={close} />);
    expect(screen.getByText('All slides are hidden.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to editor' }));
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('modal accessibility', () => {
  it('focuses help, traps Tab, closes on Escape, and restores the launching control', async () => {
    await boot();
    const launcher = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    await user().click(launcher);
    const dialog = screen.getByRole('dialog', { name: 'Make yourself at home.' });
    const first = within(dialog).getByRole('button', { name: 'Close help' });
    const last = within(dialog).getByRole('link', { name: 'Source code & roadmap' });
    expect(document.activeElement).toBe(first);
    expect(document.querySelector('.app-shell')?.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Make yourself at home.' })).toBeNull();
    expect(document.querySelector('.app-shell')?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(launcher);
  });

  it('closes a file error report with Escape and leaves the deck intact', async () => {
    const title = await boot();
    const previous = title.value;
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open presentation file'), {
        target: { files: [nativeFile('not json')] },
      });
    });
    const close = screen.getByRole('button', { name: 'Close report' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(title.value).toBe(previous);
  });
});
