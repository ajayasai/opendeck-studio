import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDeck, createElement } from './model';
import { ElementContent, SlideView } from './SlideView';
import TextDecorationView from './TextDecorationView';
import type { TextElement } from './types';

afterEach(cleanup);
function textBox(): TextElement {
  return {
    ...createElement('text', createDeck().theme),
    width: 240,
    height: 100,
    text: 'Readable text',
    decoration: {
      shape: 'roundRect',
      cornerRadius: 0.2,
      fill: { color: '#AABBCC', opacity: 0.25 },
      line: { color: '#123456', opacity: 0.75, width: 20, dash: 'solid' },
    },
  };
}

describe('text-box SVG decoration', () => {
  it('adds no decoration markup for legacy transparent text', () => {
    const element = createElement('text', createDeck().theme);
    const view = render(<ElementContent element={element} />);
    expect(view.container.querySelector('.text-decoration')).toBeNull();
    expect(view.container.querySelector('.text-frame')).not.toBeNull();
    expect(element).not.toHaveProperty('decoration');
  });

  it('draws the original box behind text, using independent paint alpha and centered strokes', () => {
    const element = textBox(),
      original = structuredClone(element);
    const view = render(<ElementContent element={element} />);
    const svg = view.container.querySelector<SVGSVGElement>('.text-decoration')!,
      rect = svg.querySelector('rect')!;
    expect(
      Array.from(view.container.children).map((node) => node.classList.contains('text-decoration')),
    ).toEqual([true, false]);
    expect(svg.getAttribute('viewBox')).toBe('0 0 240 100');
    expect(svg.getAttribute('overflow')).toBe('visible');
    expect(svg.style.pointerEvents).toBe('none');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(
      ['x', 'y', 'width', 'height', 'rx'].map((attribute) => rect.getAttribute(attribute)),
    ).toEqual(['0', '0', '240', '100', '20']);
    expect(rect.getAttribute('fill')).toBe('#AABBCC');
    expect(rect.getAttribute('fill-opacity')).toBe('0.25');
    expect(rect.getAttribute('stroke-opacity')).toBe('0.75');
    expect(rect.getAttribute('stroke-width')).toBe('20');
    expect(screen.getByText('Readable text')).toBeTruthy();
    expect(element).toEqual(original);
  });

  it.each(['ellipse', 'triangle'] as const)(
    'uses full %s bounds without insetting for a wide stroke',
    (shape) => {
      const element = textBox();
      element.decoration!.shape = shape;
      const view = render(<TextDecorationView element={element} />);
      if (shape === 'ellipse') {
        const ellipse = view.container.querySelector('ellipse')!;
        expect(
          ['cx', 'cy', 'rx', 'ry'].map((attribute) => ellipse.getAttribute(attribute)),
        ).toEqual(['120', '50', '120', '50']);
      } else
        expect(view.container.querySelector('polygon')!.getAttribute('points')).toBe(
          '120,0 240,100 0,100',
        );
    },
  );

  it.each([
    [undefined, 'butt'],
    ['flat', 'butt'],
    ['round', 'round'],
    ['square', 'square'],
  ] as const)('renders line cap %s as SVG %s without changing dash lengths', (cap, expected) => {
    const element = textBox();
    element.decoration!.line = {
      ...element.decoration!.line!,
      width: 2,
      dash: 'dot',
      ...(cap ? { cap } : {}),
    };
    const view = render(<TextDecorationView element={element} />);
    const rect = view.container.querySelector('rect')!;
    expect(rect.getAttribute('stroke-linecap')).toBe(expected);
    expect(rect.getAttribute('stroke-dasharray')).toBe('2 6');
    if (!cap) expect(element.decoration!.line).not.toHaveProperty('cap');
  });

  it.each([
    [undefined, undefined, 'round', '8'],
    ['round', 2, 'round', '2'],
    ['bevel', undefined, 'bevel', '8'],
    ['miter', 0, 'miter', '1'],
    ['miter', 0.5, 'miter', '1'],
    ['miter', 21474.83647, 'miter', '21474.83647'],
  ] as const)(
    'renders native join %s / limit %s without changing stored values',
    (join, miterLimit, expectedJoin, expectedLimit) => {
      const element = textBox();
      element.decoration!.shape = 'triangle';
      element.decoration!.line = {
        ...element.decoration!.line!,
        ...(join ? { join } : {}),
        ...(miterLimit !== undefined ? { miterLimit } : {}),
      };
      const original = structuredClone(element);
      const view = render(<TextDecorationView element={element} />);
      const shape = view.container.querySelector('polygon')!;
      expect(shape.getAttribute('stroke-linejoin')).toBe(expectedJoin);
      expect(shape.getAttribute('stroke-miterlimit')).toBe(expectedLimit);
      expect(element).toEqual(original);
    },
  );

  it('keeps whole-object, text-only and paint opacities separate', () => {
    const deck = createDeck(),
      element = textBox();
    element.opacity = 0.8;
    element.textOpacity = 0.3;
    const slide = { ...deck.slides[0], elements: [element] };
    const view = render(<SlideView deck={deck} slide={slide} />);
    const svg = view.container.querySelector<SVGSVGElement>('.text-decoration')!;
    expect((svg.parentElement as HTMLElement).style.opacity).toBe('0.8');
    expect(view.container.querySelector<HTMLElement>('.text-content')!.style.opacity).toBe('0.3');
    expect(svg.querySelector('rect')!.getAttribute('fill-opacity')).toBe('0.25');
    expect(svg.querySelector('rect')!.getAttribute('stroke-opacity')).toBe('0.75');
    expect(svg.getAttribute('opacity')).toBeNull();
  });

  it('renders painted zero-width hairlines without rewriting their stored width or transparent paint colors', () => {
    const element = textBox();
    element.decoration!.line = { color: '#123456', opacity: 0, width: 0, dash: 'sysDashDot' };
    element.decoration!.fill = null;
    const view = render(<TextDecorationView element={element} />),
      rect = view.container.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('stroke')).toBe('#123456');
    expect(rect.getAttribute('stroke-opacity')).toBe('0');
    expect(rect.getAttribute('stroke-width')).toBe('1');
    expect(rect.getAttribute('stroke-dasharray')).toBe('3 1 1 1');
    expect(element.decoration!.line.width).toBe(0);
  });
});
