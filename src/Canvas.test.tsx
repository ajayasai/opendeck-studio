import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Canvas from './Canvas';
import { createDeck, createElement, createSlide } from './model';
import { withParagraphs } from './richText';
import type { SlideElement, TextFrame } from './types';

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
beforeEach(() => {
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

function setup(textFrame?: TextFrame, value = 'Original story') {
  const deck = createDeck(),
    slide = createSlide(deck.theme);
  const text = withParagraphs(createElement('text', deck.theme), [
    { runs: [{ text: value, bold: true }] },
  ]);
  text.name = 'Story';
  if (textFrame) text.textFrame = textFrame;
  const shape = createElement('shape', deck.theme);
  shape.name = 'Block';
  shape.x = 500;
  shape.y = 200;
  slide.elements = [text, shape];
  deck.slides = [slide];
  const onChange = vi.fn(),
    onSelect = vi.fn();
  render(
    <Canvas
      deck={deck}
      slide={slide}
      selected={[text.id]}
      onChange={onChange}
      onSelect={onSelect}
      zoom={1}
      grid={false}
    />,
  );
  fireEvent.doubleClick(screen.getByRole('button', { name: 'text: Story' }));
  return {
    slide,
    onChange,
    onSelect,
    input: screen.getByRole('textbox', { name: 'Edit text on slide' }) as HTMLTextAreaElement,
  };
}

describe('canvas rich text validation recovery', () => {
  it('keeps an invalid draft available, reports its limit, and commits a corrected draft once', () => {
    const { slide, input, onChange } = setup();
    const draft = '\n'.repeat(5000);
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect((slide.elements[0] as { text: string }).text).toBe('Original story');
    expect(input.value).toBe(draft);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(screen.getByRole('alert').textContent).toContain('5,000 paragraphs');
    fireEvent.change(input, { target: { value: 'Corrected story' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      text: 'Corrected story',
      paragraphs: [{ runs: [{ text: 'Corrected story', bold: true }] }],
    });
    expect(screen.queryByRole('textbox', { name: 'Edit text on slide' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('aborts a drag if the pending text is invalid, and supports explicit discard before moving another object', () => {
    const { input, onChange, onSelect } = setup();
    fireEvent.change(input, { target: { value: '\n'.repeat(5000) } });
    onSelect.mockClear();
    const block = screen.getByRole('button', { name: 'shape: Block' });
    fireEvent.pointerDown(block, { button: 0, clientX: 500, clientY: 200 });
    fireEvent.pointerMove(block, { clientX: 560, clientY: 220 });
    fireEvent.pointerUp(block);
    expect(onChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Your draft is still in the text box');
    expect(screen.getByRole('textbox', { name: 'Edit text on slide' })).toBe(input);
    const pendingUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pendingUnload);
    expect(pendingUnload.defaultPrevented).toBe(true);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('alert')).toBeNull();
    const discardedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(discardedUnload);
    expect(discardedUnload.defaultPrevented).toBe(false);
    fireEvent.pointerDown(block, { button: 0, clientX: 500, clientY: 200 });
    fireEvent.pointerMove(block, { clientX: 560, clientY: 220 });
    fireEvent.pointerUp(block);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0].text).toBe('Original story');
    expect(onChange.mock.calls[0][0][1]).toMatchObject({ x: 560, y: 220 });
  });

  it('does not reset a pending draft when the user double-clicks inside the text editor', () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    fireEvent.doubleClick(input);
    expect(input.value).toBe('Keep this draft');
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0][0].text).toBe('Keep this draft');
  });
});

describe('canvas inline text geometry', () => {
  it('flushes a focused Inspector field and snapshots its accepted fitting geometry before a drag', () => {
    const deck = createDeck(),
      slide = createSlide(deck.theme);
    const text = createElement('text', deck.theme);
    Object.assign(text, { name: 'Inspector fitted text', x: 100, y: 80, height: 40 });
    text.autoFit = { mode: 'resize' };
    slide.elements = [text];
    deck.slides = [slide];
    let latest = slide.elements;
    const blur = vi.fn(() => {
      latest = latest.map((element) =>
        element.id === text.id ? { ...text, fontSize: 48, height: 180, y: 10 } : element,
      );
    });
    const onChange = vi.fn((elements: SlideElement[]) => {
      latest = elements;
      return latest;
    });
    render(
      <>
        <input aria-label="Pending inspector size" defaultValue="48" onBlur={blur} />
        <Canvas
          deck={deck}
          slide={slide}
          selected={[text.id]}
          onSelect={vi.fn()}
          onChange={onChange}
          getElements={() => latest}
          zoom={1}
          grid={false}
        />
      </>,
    );
    const input = screen.getByLabelText('Pending inspector size');
    input.focus();
    expect(document.activeElement).toBe(input);
    const target = screen.getByRole('button', { name: 'text: Inspector fitted text' });
    fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 80 });
    expect(blur).toHaveBeenCalledOnce();
    fireEvent.pointerMove(target, { clientX: 130, clientY: 100 });
    fireEvent.pointerUp(target);
    expect(onChange).toHaveBeenCalledOnce();
    expect(latest[0]).toMatchObject({
      x: 130,
      y: 30,
      height: 180,
      fontSize: 48,
      autoFit: { mode: 'resize' },
    });
    expect(text).toMatchObject({ x: 100, y: 80, height: 40, fontSize: 32 });
  });

  it.each(['move', 'resize'] as const)(
    'preserves concurrent edits and inserted objects when committing a %s gesture',
    (kind) => {
      const deck = createDeck(),
        slide = createSlide(deck.theme);
      const text = createElement('text', deck.theme);
      Object.assign(text, { name: 'Concurrent text', x: 100, y: 80, height: 40 });
      slide.elements = [text];
      deck.slides = [slide];
      let latest = slide.elements;
      const onChange = vi.fn((elements: SlideElement[]) => {
        latest = elements;
        return latest;
      });
      render(
        <Canvas
          deck={deck}
          slide={slide}
          selected={[text.id]}
          onSelect={vi.fn()}
          onChange={onChange}
          getElements={() => latest}
          zoom={1}
          grid={false}
        />,
      );
      const target = screen.getByRole('button', {
        name: kind === 'move' ? 'text: Concurrent text' : 'Resize Concurrent text',
      });
      fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 80 });
      fireEvent.pointerMove(target, { clientX: 130, clientY: 100 });
      const inserted = createElement('shape', deck.theme);
      const concurrentlyEdited = {
        ...text,
        text: 'Saved during drag',
        fontSize: 48,
        color: '#AABBCC',
        ...(kind === 'move' ? { width: 680, height: 180 } : { x: 650, y: 320 }),
      };
      latest = [concurrentlyEdited, inserted];
      fireEvent.pointerUp(target);
      expect(onChange).toHaveBeenCalledOnce();
      expect(latest).toHaveLength(2);
      expect(latest[1]).toBe(inserted);
      expect(latest[0]).toMatchObject({
        text: 'Saved during drag',
        fontSize: 48,
        color: '#AABBCC',
        ...(kind === 'move'
          ? { x: 130, y: 100, width: 680, height: 180 }
          : { x: 650, y: 320, width: text.width + 30, height: 60 }),
      });
      expect(concurrentlyEdited.text).toBe('Saved during drag');
    },
  );

  it('starts a same-event group move from the synchronously accepted text-fit result', () => {
    const deck = createDeck(),
      slide = createSlide(deck.theme);
    const text = createElement('text', deck.theme),
      shape = createElement('shape', deck.theme);
    text.name = 'Fitted story';
    text.x = 100;
    text.y = 80;
    text.height = 40;
    text.autoFit = { mode: 'resize' };
    shape.name = 'Drag target';
    shape.x = 500;
    shape.y = 200;
    slide.elements = [text, shape];
    deck.slides = [slide];
    let latest = slide.elements;
    const onChange = vi
      .fn<(elements: SlideElement[]) => SlideElement[] | void>()
      .mockImplementation((elements) => {
        latest = elements;
        return latest;
      })
      .mockImplementationOnce((elements) => {
        latest = elements.map((element) =>
          element.id === text.id ? { ...element, y: 20, height: 200 } : element,
        );
        return latest;
      });
    render(
      <Canvas
        deck={deck}
        slide={slide}
        selected={[text.id, shape.id]}
        onSelect={vi.fn()}
        onChange={onChange}
        getElements={() => latest}
        zoom={1}
        grid={false}
      />,
    );
    fireEvent.doubleClick(screen.getByRole('button', { name: 'text: Fitted story' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit text on slide' }), {
      target: { value: 'More text requires a taller box' },
    });
    const target = screen.getByRole('button', { name: 'shape: Drag target' });
    fireEvent.pointerDown(target, { button: 0, clientX: 500, clientY: 200 });
    fireEvent.pointerMove(target, { clientX: 530, clientY: 220 });
    fireEvent.pointerUp(target);
    expect(onChange).toHaveBeenCalledTimes(2);
    const moved = onChange.mock.calls[1][0];
    expect(moved[0]).toMatchObject({
      text: 'More text requires a taller box',
      x: 130,
      y: 40,
      height: 200,
      autoFit: { mode: 'resize' },
    });
    expect(moved[1]).toMatchObject({ x: 530, y: 220 });
    expect(text).toMatchObject({ x: 100, y: 80, height: 40 });
  });

  it('keeps the legacy editor aligned to the full box and enables soft wrapping', () => {
    const { input, slide } = setup();
    const element = slide.elements[0];
    expect([input.style.left, input.style.top]).toEqual(['0px', '0px']);
    expect([input.style.width, input.style.height]).toEqual([
      `${element.width}px`,
      `${element.height}px`,
    ]);
    expect(input.getAttribute('wrap')).toBe('soft');
    expect(input.style.whiteSpace).toBe('pre-wrap');
  });

  it('uses signed insets and preserves hard breaks without soft wrapping or losing frame metadata on commit', () => {
    const frame: TextFrame = {
      insets: { top: -10, right: 30, bottom: 4, left: -20 },
      wrap: 'none',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'clip',
    };
    const { input, slide, onChange } = setup(frame, 'First line\nSecond line');
    const element = slide.elements[0];
    expect([input.style.left, input.style.top, input.style.width, input.style.height]).toEqual([
      '-20px',
      '-10px',
      `${element.width - 10}px`,
      `${element.height + 6}px`,
    ]);
    expect(input.getAttribute('wrap')).toBe('off');
    expect(input.style.whiteSpace).toBe('pre');
    expect(input.style.overflowWrap).toBe('normal');
    expect(input.value).toBe('First line\nSecond line');
    fireEvent.change(input, { target: { value: 'First line\nSecond line!' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      text: 'First line\nSecond line!',
      textFrame: frame,
    });
  });
});
