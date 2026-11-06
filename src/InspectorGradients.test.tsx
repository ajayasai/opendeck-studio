import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Inspector from './Inspector';
import { createDeck, createElement, validateDeck } from './model';
import type { Deck, GradientFill, ShapeElement, TextElement } from './types';

afterEach(cleanup);
const gradient = (): GradientFill => ({
  kind: 'linear',
  angle: 32.12345,
  stops: [
    { position: 0, color: '#ff0000', opacity: 0.4 },
    { position: 1, color: '#0000ff', opacity: 0.8 },
  ],
  flip: 'x',
  tileRect: { left: -0.1 },
});

function setup(kind: 'text' | 'shape' | 'background', fill?: GradientFill, locked = false) {
  const source = createDeck();
  const element = createElement(kind === 'shape' ? 'shape' : 'text', source.theme);
  element.locked = locked;
  if (element.type === 'text')
    element.decoration = {
      shape: 'ellipse',
      fill: { color: '#123456', opacity: 0.6, ...(fill ? { gradient: fill } : {}) },
      line: { color: '#654321', opacity: 0.9, width: 4, dash: 'dash' },
    };
  if (element.type === 'shape') element.fillGradient = fill;
  source.slides = [
    {
      ...source.slides[0],
      elements: [element],
      ...(kind === 'background' && fill ? { backgroundGradient: fill } : {}),
    },
  ];
  const onPatch = vi.fn();
  function Harness() {
    const [deck, setDeck] = useState(source);
    const slide = deck.slides[0];
    return (
      <>
        <output data-testid="gradient-deck">{JSON.stringify(deck)}</output>
        <Inspector
          deck={deck}
          slide={slide}
          selected={kind === 'background' ? [] : slide.elements}
          onElementPatch={(patch) => {
            onPatch(patch);
            setDeck({
              ...deck,
              slides: [
                { ...slide, elements: [{ ...slide.elements[0], ...patch } as typeof element] },
              ],
            });
          }}
          onSlidePatch={(patch) => {
            onPatch(patch);
            setDeck({ ...deck, slides: [{ ...slide, ...patch }] });
          }}
          onTheme={vi.fn()}
          onSelect={vi.fn()}
          onLayer={vi.fn()}
        />
      </>
    );
  }
  render(<Harness />);
  return { source, element, onPatch };
}
const current = (): Deck => JSON.parse(screen.getByTestId('gradient-deck').textContent!);
const text = (): TextElement => current().slides[0].elements[0] as TextElement;
function change(label: string, value: string) {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe('gradient authoring controls', () => {
  it('preserves imported metadata when viewing and focusing controls', () => {
    const { source, onPatch } = setup('text', gradient());
    expect(
      (screen.getByLabelText('Scale text box fill angle with the box') as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.focus(screen.getByLabelText('Text box fill gradient angle (°)'));
    fireEvent.blur(screen.getByLabelText('Text box fill gradient angle (°)'));
    expect(current()).toEqual(source);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('edits a stop through the keyboard without altering companion paint or typography', async () => {
    const { source } = setup('text', gradient());
    const user = userEvent.setup();
    const color = screen.getByRole('textbox', { name: 'Text box fill stop color hex' });
    await user.clear(color);
    await user.type(color, '#00ff88');
    await user.tab();
    change('Text box fill stop opacity (%)', '25');
    change('Text box fill gradient angle (°)', '90');
    expect(text().decoration!.fill!.gradient).toEqual({
      ...gradient(),
      angle: 90,
      stops: [{ position: 0, color: '#00ff88', opacity: 0.25 }, gradient().stops[1]],
    });
    const original = source.slides[0].elements[0] as TextElement;
    expect(text().decoration!.line).toEqual(original.decoration!.line);
    expect(text().decoration!.fill!.opacity).toBe(0.6);
    expect(text().fontSize).toBe(original.fontSize);
    expect(text().text).toBe(original.text);
    expect(() => validateDeck(current())).not.toThrow();
  });

  it('keeps the selected stop after positions reorder and supports add/remove', () => {
    const imported = gradient();
    imported.stops.splice(1, 0, { position: 0.5, color: '#00ff00', opacity: 1 });
    setup('text', imported);
    change('Text box fill stop position (%)', '75');
    expect(text().decoration!.fill!.gradient!.stops.map((stop) => stop.position)).toEqual([
      0.5, 0.75, 1,
    ]);
    expect((screen.getByLabelText('Text box fill gradient stop') as HTMLSelectElement).value).toBe(
      '1',
    );
    change('Text box fill stop opacity (%)', '30');
    expect(text().decoration!.fill!.gradient!.stops[1].opacity).toBe(0.3);
    fireEvent.click(screen.getByRole('button', { name: 'Add text box fill stop' }));
    expect(text().decoration!.fill!.gradient!.stops.map((stop) => stop.position)).toEqual([
      0.25, 0.5, 0.75, 1,
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove text box fill stop' }));
    expect(text().decoration!.fill!.gradient!.stops.map((stop) => stop.position)).toEqual([
      0.5, 0.75, 1,
    ]);
  });

  it('switches gradient geometry while retaining stops and supports inherited geometry defaults', () => {
    setup('text', gradient());
    fireEvent.change(screen.getByLabelText('Text box fill type'), { target: { value: 'circle' } });
    const paint = text().decoration!.fill!;
    expect(paint.gradient?.stops).toEqual(gradient().stops);
    expect(paint.gradient?.kind).toBe('path');
    expect(paint.gradient?.path).toBe('circle');
    expect(paint.gradient?.fillToRect).toEqual({ left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 });
    change('Text box fill focus left (%)', '25');
    expect(text().decoration!.fill!.gradient!.fillToRect!.left).toBe(0.25);
    fireEvent.click(screen.getByRole('button', { name: 'Reset text box fill focus' }));
    expect(text().decoration!.fill!.gradient).not.toHaveProperty('fillToRect');
    expect((screen.getByLabelText('Text box fill focus left (%)') as HTMLInputElement).value).toBe(
      '50',
    );
    change('Text box fill focus right (%)', '75');
    expect(text().decoration!.fill!.gradient!.fillToRect).toEqual({
      left: 0.5,
      top: 0.5,
      right: 0.75,
      bottom: 0.5,
    });
    expect(text().decoration!.fill!.gradient?.tileRect).toEqual({ left: -0.1 });
  });

  it('recovers empty imported stop lists and bounds stop counts', () => {
    setup('text', { kind: 'linear', stops: [] });
    expect(screen.getByRole('option', { name: 'No color stops' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add text box fill stop' }));
    expect(text().decoration!.fill!.gradient!.stops).toHaveLength(1);
    expect(
      (screen.getByRole('button', { name: 'Remove text box fill stop' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();
    setup('text', {
      kind: 'linear',
      stops: Array.from({ length: 256 }, (_, index) => ({
        position: index / 255,
        color: '#112233',
        opacity: 1,
      })),
    });
    expect(
      (screen.getByRole('button', { name: 'Add text box fill stop' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('offers gradients and independent paint alpha on ordinary shapes', () => {
    setup('shape');
    fireEvent.change(screen.getByLabelText('Fill type'), { target: { value: 'linear' } });
    change('Fill opacity (%)', '45');
    fireEvent.change(screen.getByLabelText('Stroke type'), { target: { value: 'rect' } });
    change('Stroke opacity (%)', '70');
    const shape = current().slides[0].elements[0] as ShapeElement;
    expect(shape.fillGradient?.kind).toBe('linear');
    expect(shape.fillOpacity).toBe(0.45);
    expect(shape.strokeGradient?.path).toBe('rect');
    expect(shape.strokeOpacity).toBe(0.7);
    expect(shape.opacity).toBe(1);
    expect(() => validateDeck(current())).not.toThrow();
  });

  it('edits slide background gradients and can return to a solid background', () => {
    setup('background');
    fireEvent.change(screen.getByLabelText('Background type'), { target: { value: 'shape' } });
    change('Background stop opacity (%)', '35');
    change('Background opacity (%)', '60');
    expect(current().slides[0].backgroundGradient!.stops[0].opacity).toBe(0.35);
    expect(current().slides[0].backgroundOpacity).toBe(0.6);
    fireEvent.change(screen.getByLabelText('Background type'), { target: { value: 'solid' } });
    expect(current().slides[0]).not.toHaveProperty('backgroundGradient');
    expect(screen.getByLabelText('Background hex')).toBeTruthy();
    expect(() => validateDeck(current())).not.toThrow();
  });

  it('prevents gradient mutation on locked objects', async () => {
    const { onPatch } = setup('text', gradient(), true);
    expect(screen.getByLabelText('Text box fill type').matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Text box fill stop color hex').matches(':disabled')).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add text box fill stop' }));
    expect(onPatch).not.toHaveBeenCalled();
  });
});
