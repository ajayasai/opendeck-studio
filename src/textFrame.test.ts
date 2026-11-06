import { describe, expect, it } from 'vitest';
import { cloneElement, cloneSlide, createDeck, createElement, THEMES, validateDeck } from './model';
import { applyTextPatch, plainText, replacePlainText, withParagraphs } from './richText';
import { resolveTextFrame, textContentRect, validateTextFrame } from './textFrame';
import type { TextElement, TextFrame } from './types';

const frame = (): TextFrame => ({
  insets: { top: -12.5, right: 23.75, bottom: 8, left: -4 },
  wrap: 'none',
  horizontalOverflow: 'overflow',
  verticalOverflow: 'clip',
});

describe('text frame resolution and geometry', () => {
  it('preserves the legacy zero-inset, square-wrap, clipped behavior without mutating the source', () => {
    const legacy = createElement('text', THEMES[0]);
    const first = resolveTextFrame(legacy),
      second = resolveTextFrame(legacy);
    expect(first).toEqual({
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      wrap: 'square',
      horizontalOverflow: 'clip',
      verticalOverflow: 'clip',
    });
    expect(textContentRect(legacy)).toEqual({
      left: 0,
      top: 0,
      width: legacy.width,
      height: legacy.height,
    });
    expect(legacy).not.toHaveProperty('textFrame');
    first.insets.left = 40;
    expect(second.insets.left).toBe(0);
    expect(resolveTextFrame(legacy).insets.left).toBe(0);
  });

  it('computes signed asymmetric insets without clamping the inset origins', () => {
    expect(textContentRect({ width: 240, height: 120, textFrame: frame() })).toEqual({
      left: -4,
      top: -12.5,
      width: 220.25,
      height: 124.5,
    });
    const expanded = frame();
    expanded.insets = { left: -30, right: -40, top: -50, bottom: -60 };
    expect(textContentRect({ width: 100, height: 80, textFrame: expanded })).toEqual({
      left: -30,
      top: -50,
      width: 170,
      height: 190,
    });
  });

  it('clamps only consumed dimensions and keeps independent horizontal and vertical geometry', () => {
    const cramped = frame();
    cramped.insets = { left: 60, right: 50, top: 10, bottom: 15 };
    expect(textContentRect({ width: 100, height: 80, textFrame: cramped })).toEqual({
      left: 60,
      top: 10,
      width: 0,
      height: 55,
    });
    cramped.insets.top = 100;
    expect(textContentRect({ width: 100, height: 80, textFrame: cramped })).toEqual({
      left: 60,
      top: 100,
      width: 0,
      height: 0,
    });
  });

  it('returns a deep independent copy of an explicit frame', () => {
    const source = frame();
    const resolved = resolveTextFrame({ textFrame: source });
    resolved.insets.top = 0;
    resolved.wrap = 'square';
    expect(source.insets.top).toBe(-12.5);
    expect(source.wrap).toBe('none');
  });
});

describe('text frame native validation', () => {
  it('accepts both signed bounds and rebuilds only recognized properties', () => {
    const source = {
      ...frame(),
      insets: { top: -10000, right: 10000, bottom: 0, left: -0, unsafe: 'ignore' },
      style: 'url(https://tracking.invalid)',
    };
    const validated = validateTextFrame(source);
    expect(validated).toEqual({
      insets: { top: -10000, right: 10000, bottom: 0, left: -0 },
      wrap: 'none',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'clip',
    });
    expect(validated.insets).not.toBe(source.insets);
  });

  it.each([undefined, null, [], 'frame', 4])('rejects a malformed frame %j', (value) => {
    expect(() => validateTextFrame(value)).toThrow('Invalid text frame');
  });

  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'requires and bounds the %s inset',
    (side) => {
      for (const value of [undefined, null, '4', NaN, Infinity, -Infinity, -10000.001, 10000.001]) {
        const source = { ...frame(), insets: { ...frame().insets, [side]: value } };
        expect(() => validateTextFrame(source)).toThrow(`${side} inset`);
      }
    },
  );

  it('rejects missing or unsupported wrapping and overflow properties', () => {
    for (const property of ['wrap', 'horizontalOverflow', 'verticalOverflow'] as const) {
      for (const value of [undefined, null, 'hidden', true])
        expect(() => validateTextFrame({ ...frame(), [property]: value })).toThrow(
          'Invalid text frame',
        );
    }
    expect(() => validateTextFrame({ ...frame(), insets: [0, 0, 0, 0] })).toThrow('insets');
    expect(() =>
      validateTextFrame({ wrap: 'square', horizontalOverflow: 'clip', verticalOverflow: 'clip' }),
    ).toThrow('insets');
  });

  it('round-trips optional frames without changing v1 legacy backup shape', () => {
    const legacy = createDeck();
    expect(JSON.stringify(validateDeck(legacy))).toBe(JSON.stringify(legacy));
    const rich = createDeck(),
      element = rich.slides[0].elements.find((item) => item.type === 'text') as TextElement;
    element.textFrame = frame();
    expect(validateDeck(JSON.parse(JSON.stringify(rich)))).toEqual(rich);
    (element.textFrame as unknown as { insets: unknown }).insets = null;
    expect(() => validateDeck(rich)).toThrow('text frame insets');
  });
});

describe('text frame editing independence', () => {
  it('preserves geometry and exact rich projection through text and style edits', () => {
    const element = withParagraphs({ ...createElement('text', THEMES[0]), textFrame: frame() }, [
      {
        runs: [
          { text: 'Hello', bold: true },
          { text: ' world', italic: true },
        ],
      },
    ]);
    const edited = applyTextPatch(replacePlainText(element, 'Hello new world'), {
      color: '#223344',
    });
    expect(edited.textFrame).toEqual(frame());
    expect(edited.text).toBe(plainText(edited.paragraphs!));
    expect(edited.text).toBe('Hello new world');
  });

  it('clones nested frame values independently when duplicating objects and slides', () => {
    const deck = createDeck(),
      source = deck.slides[0].elements[0] as TextElement;
    source.textFrame = frame();
    const copied = cloneElement(source);
    const copiedSlide = cloneSlide(deck.slides[0]);
    copied.textFrame!.insets.left = 999;
    (copiedSlide.elements[0] as TextElement).textFrame!.insets.top = 888;
    expect(source.textFrame).toEqual(frame());
    expect((copiedSlide.elements[0] as TextElement).textFrame!.insets.left).toBe(-4);
  });
});
