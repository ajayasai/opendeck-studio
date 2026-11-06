import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createDeck, createElement, createSlide } from './model';
import { withParagraphs } from './richText';
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
      [{ contentRect: { width: 600, height: 500 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
function startingDeck() {
  const deck = createDeck();
  deck.title = 'Guarded work';
  const first = createSlide(deck.theme),
    second = createSlide(deck.theme);
  first.name = 'First';
  second.name = 'Second';
  const text = withParagraphs(createElement('text', deck.theme), [
    { runs: [{ text: 'Protected story', bold: true }] },
  ]);
  text.name = 'Story';
  first.elements = [text];
  deck.slides = [first, second];
  return deck;
}
beforeEach(() => {
  persistence.loadDeck.mockReset().mockResolvedValue(startingDeck());
  persistence.saveDeck.mockReset().mockResolvedValue(undefined);
  persistence.listSavedDecks.mockReset().mockResolvedValue([]);
  persistence.loadSavedDeck.mockReset().mockResolvedValue(null);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function boot() {
  render(<App />);
  await act(async () => {});
}
async function flushSave() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
}
const saved = (): Deck => persistence.saveDeck.mock.calls.at(-1)![0];
function startInline() {
  const object = screen.getByRole('button', { name: 'text: Story' });
  fireEvent.pointerDown(object, { button: 0 });
  fireEvent.pointerUp(object);
  fireEvent.doubleClick(object);
  return screen.getByRole('textbox', { name: 'Edit text on slide' }) as HTMLTextAreaElement;
}

describe('document actions protect invalid inline drafts', () => {
  it('restores keyboard focus to the rich editor opener after cancellation', async () => {
    await boot();
    const object = screen.getByRole('button', { name: 'text: Story' });
    fireEvent.pointerDown(object, { button: 0 });
    fireEvent.pointerUp(object);
    const opener = screen.getByRole('button', { name: 'Edit styles & lists' });
    opener.focus();
    fireEvent.click(opener);
    const close = await screen.findByRole(
      'button',
      { name: 'Cancel rich text editing' },
      { timeout: 10000 },
    );
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  }, 15000);
  it('blocks navigation and destructive or view-changing actions until the draft is corrected', async () => {
    await boot();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.change(screen.getByLabelText('Presentation title'), {
      target: { value: 'Guarded revision' },
    });
    const input = startInline(),
      invalid = '\n'.repeat(5000);
    fireEvent.change(input, { target: { value: invalid } });
    for (const label of [
      'Slide 2: Second',
      'Add slide',
      'Duplicate slide',
      'Delete slide',
      'Move slide down',
      'Undo (Ctrl+Z)',
      'View',
      'Present',
      'Edit styles & lists',
      'Delete selected objects',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByRole('textbox', { name: 'Edit text on slide' })).toBe(input);
      expect(input.value).toBe(invalid);
      expect(screen.getByText('Slide 1 of 2')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    for (const label of [
      'New presentation',
      'My presentations',
      'Open PPTX or OpenDeck',
      'Download OpenDeck',
      'Print / save as PDF',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: 'File' }));
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: label === 'Download OpenDeck' ? /Download OpenDeck/ : label,
          }),
        );
      });
      expect(input.value).toBe(invalid);
      expect(screen.getByRole('textbox', { name: 'Edit text on slide' })).toBe(input);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect((screen.getByLabelText('Presentation title') as HTMLInputElement).value).toBe(
        'Guarded revision',
      );
    }
    expect(screen.getByRole('alert').textContent).toContain('5,000 paragraphs');
    expect(print).not.toHaveBeenCalled();
    await flushSave();
    expect(saved().slides[0].elements[0]).toMatchObject({ text: 'Protected story' });
    fireEvent.change(input, { target: { value: 'Corrected rich story' } });
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2: Second' }));
    expect(screen.getByText('Slide 2 of 2')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Edit text on slide' })).toBeNull();
    await flushSave();
    expect(saved().slides[0].elements[0]).toMatchObject({
      text: 'Corrected rich story',
      paragraphs: [{ runs: [{ text: 'Corrected rich story', bold: true }] }],
    });
  }, 15000);

  it('blocks direct file-drop replacement and permits navigation after explicit Escape discard', async () => {
    await boot();
    const input = startInline();
    fireEvent.change(input, { target: { value: '\n'.repeat(5000) } });
    const file = new File(['{}'], 'replacement.opendeck', { type: 'application/json' });
    const read = vi.fn().mockResolvedValue(JSON.stringify(createDeck()));
    Object.defineProperty(file, 'text', { value: read });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open presentation file'), {
        target: { files: [file] },
      });
    });
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Edit text on slide' })).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2: Second' }));
    expect(screen.getByText('Slide 2 of 2')).toBeTruthy();
    await flushSave();
    expect(saved().slides[0].elements[0]).toMatchObject({ text: 'Protected story' });
  });

  it('fits the largest supported slide size inside a narrow stage', async () => {
    const deck = startingDeck();
    deck.width = 10000;
    deck.height = 10000;
    persistence.loadDeck.mockResolvedValue(deck);
    await boot();
    expect(screen.getByTestId('slide-canvas').style.transform).toBe('scale(0.05)');
  });
});

function deferredImages() {
  const pending: (() => void)[] = [];
  const src = createElement('image', startingDeck().theme).src;
  class Reader {
    result = src;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      void Promise.resolve().then(() => this.onload?.());
    }
  }
  class Image {
    src = '';
    naturalWidth = 400;
    naturalHeight = 200;
    decode() {
      return new Promise<void>((resolve) => pending.push(resolve));
    }
  }
  vi.stubGlobal('FileReader', Reader);
  vi.stubGlobal('Image', Image);
  return pending;
}
async function startImage() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Insert image file'), {
      target: { files: [new File(['raster'], 'image.png', { type: 'image/png' })] },
    });
  });
}

describe('asynchronous image insertion', () => {
  it('appends to current target elements without overwriting edits made during decoding', async () => {
    const pending = deferredImages();
    await boot();
    await startImage();
    expect(pending).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Shape' }));
    await act(async () => pending[0]());
    await flushSave();
    expect(saved().slides[0].elements.map((element) => element.type)).toEqual([
      'text',
      'shape',
      'image',
    ]);
  });

  it('inserts into the original slide without stealing the active slide or its selection', async () => {
    const pending = deferredImages();
    await boot();
    await startImage();
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2: Second' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shape' }));
    const selectedName = (screen.getByLabelText('Object name') as HTMLInputElement).value;
    await act(async () => pending[0]());
    expect(screen.getByText('Slide 2 of 2')).toBeTruthy();
    expect((screen.getByLabelText('Object name') as HTMLInputElement).value).toBe(selectedName);
    await flushSave();
    expect(saved().slides[0].elements.at(-1)?.type).toBe('image');
    expect(saved().slides[1].elements.map((element) => element.type)).toEqual(['shape']);
  });

  it.each(['deleted slide', 'new presentation'])(
    'discards a late decode after the target becomes a %s',
    async (reason) => {
      const pending = deferredImages();
      await boot();
      await startImage();
      if (reason === 'deleted slide')
        fireEvent.click(screen.getByRole('button', { name: 'Delete slide' }));
      else {
        fireEvent.click(screen.getByRole('button', { name: 'File' }));
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'New presentation' }));
        });
      }
      await act(async () => pending[0]());
      await flushSave();
      expect(
        saved()
          .slides.flatMap((slide) => slide.elements)
          .some((element) => element.type === 'image'),
      ).toBe(false);
      expect(screen.getByRole('status').textContent).toContain(
        'original presentation, slide, or group is no longer available',
      );
    },
  );
});
