import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Canvas from './Canvas';
import { createDeck, createElement, createSlide } from './model';
import { withParagraphs } from './richText';

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

function setup() {
  const deck = createDeck(),
    slide = createSlide(deck.theme);
  const text = withParagraphs(createElement('text', deck.theme), [
    { runs: [{ text: 'Original story', bold: true }] },
  ]);
  text.name = 'Story';
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
