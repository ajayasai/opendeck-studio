import { describe, expect, it, vi } from 'vitest';
import { cloneElement, cloneSlide, createDeck, createElement, validateDeck } from './model';
import { applyTextPatch } from './richText';
import { prepareTextLayout } from './textFit';
import {
  resolveTextDecoration,
  TEXT_LINE_DASHES,
  textLineDashArray,
  textPreviewBackground,
  validateTextDecoration,
} from './textDecoration';
import type { TextDecoration, TextElement } from './types';

const decoration = (): TextDecoration => ({
  shape: 'roundRect',
  cornerRadius: 0.25,
  fill: { color: '#AaBBcc', opacity: 0.4 },
  line: { color: '#123456', opacity: 0.7, width: 3.5, dash: 'dashDot' },
});

describe('native text decoration validation', () => {
  it('preserves legacy backup structure and resolves a fresh transparent rectangle', () => {
    const deck = createDeck(),
      element = createElement('text', deck.theme);
    expect(JSON.stringify(validateDeck(deck))).toBe(JSON.stringify(deck));
    expect(resolveTextDecoration(element)).toEqual({ shape: 'rect', fill: null, line: null });
    expect(resolveTextDecoration(element)).not.toBe(resolveTextDecoration(element));
    expect(element).not.toHaveProperty('decoration');
    expect(element).not.toHaveProperty('textOpacity');
  });

  it('reconstructs known paint fields, preserves authored colors/zero values, and accepts all dash modes', () => {
    const original = decoration();
    const validated = validateTextDecoration({
      ...original,
      unsafe: 'url(https://example.com)',
      fill: { ...original.fill, style: 'ignored' },
      line: { ...original.line, width: 0, opacity: 0, extra: true },
    });
    expect(validated).toEqual({ ...original, line: { ...original.line, width: 0, opacity: 0 } });
    expect(validated.fill).not.toBe(original.fill);
    expect(validated.fill!.color).toBe('#AaBBcc');
    for (const dash of TEXT_LINE_DASHES)
      expect(
        validateTextDecoration({ ...original, line: { ...original.line, dash } }).line!.dash,
      ).toBe(dash);
    expect(validateTextDecoration({ shape: 'rect', fill: null, line: null })).toEqual({
      shape: 'rect',
      fill: null,
      line: null,
    });
    expect(
      validateTextDecoration({
        ...original,
        cornerRadius: 0.5,
        line: { ...original.line, width: 100, opacity: 1 },
      }),
    ).toMatchObject({ cornerRadius: 0.5, line: { width: 100, opacity: 1 } });
  });

  it.each([
    null,
    [],
    'paint',
    {},
    { shape: 'line', fill: null, line: null },
    { shape: 'rect', line: null },
    { shape: 'rect', fill: null },
  ])('rejects malformed decoration %j', (value) => {
    expect(() => validateTextDecoration(value)).toThrow('Invalid text decoration');
  });

  it('rejects unsafe colors, missing opacity, and invalid finite bounds without coercion', () => {
    for (const color of [
      'red',
      '#abc',
      'transparent',
      'url(https://example.com)',
      '#12345678',
      123,
    ])
      expect(() =>
        validateTextDecoration({ ...decoration(), fill: { color, opacity: 1 } }),
      ).toThrow('fill color');
    for (const opacity of [undefined, null, '0.5', NaN, Infinity, -0.1, 1.01]) {
      expect(() =>
        validateTextDecoration({ ...decoration(), fill: { color: '#123456', opacity } }),
      ).toThrow('fill opacity');
      expect(() =>
        validateTextDecoration({ ...decoration(), line: { ...decoration().line, opacity } }),
      ).toThrow('line opacity');
    }
    for (const width of [undefined, null, '1', NaN, Infinity, -1, 100.01])
      expect(() =>
        validateTextDecoration({ ...decoration(), line: { ...decoration().line, width } }),
      ).toThrow('line width');
    for (const cornerRadius of [null, '0.2', NaN, Infinity, -0.01, 0.50001])
      expect(() => validateTextDecoration({ ...decoration(), cornerRadius })).toThrow(
        'corner radius',
      );
    expect(() =>
      validateTextDecoration({
        ...decoration(),
        line: { ...decoration().line, dash: 'arbitrary' },
      }),
    ).toThrow('dash');
  });

  it('preserves optional line caps without adding a legacy default and rejects unsupported values', () => {
    expect(validateTextDecoration(decoration()).line).not.toHaveProperty('cap');
    for (const cap of ['flat', 'round', 'square'])
      expect(
        validateTextDecoration({ ...decoration(), line: { ...decoration().line, cap } }).line!.cap,
      ).toBe(cap);
    for (const cap of [null, '', 'butt', 'rnd', 1, {}])
      expect(() =>
        validateTextDecoration({ ...decoration(), line: { ...decoration().line, cap } }),
      ).toThrow('line cap');
  });

  it('preserves optional native joins and miter ratios without synthesizing absent fields', () => {
    const legacy = validateTextDecoration(decoration()).line;
    expect(legacy).not.toHaveProperty('join');
    expect(legacy).not.toHaveProperty('miterLimit');
    for (const join of ['round', 'bevel', 'miter'])
      for (const miterLimit of [0, 0.5, 8, 21474.83647])
        expect(
          validateTextDecoration({
            ...decoration(),
            line: { ...decoration().line, join, miterLimit },
          }).line,
        ).toMatchObject({ join, miterLimit });
    for (const join of [null, '', 'sharp', 0, {}])
      expect(() =>
        validateTextDecoration({ ...decoration(), line: { ...decoration().line, join } }),
      ).toThrow('line join');
    for (const miterLimit of [null, '8', NaN, Infinity, -0.01, 21474.83648])
      expect(() =>
        validateTextDecoration({ ...decoration(), line: { ...decoration().line, miterLimit } }),
      ).toThrow('miter limit');
  });

  it('round-trips decoration and text-only opacity while keeping duplicate geometry/paint independent', () => {
    const deck = createDeck(),
      source = deck.slides[0].elements[0] as TextElement;
    source.decoration = decoration();
    source.textOpacity = 0.3;
    source.opacity = 0.8;
    expect(validateDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    const elementCopy = cloneElement(source),
      slideCopy = cloneSlide(deck.slides[0]);
    elementCopy.decoration!.fill!.color = '#FFFFFF';
    (slideCopy.elements[0] as TextElement).decoration!.line!.width = 50;
    expect(source.decoration).toEqual(decoration());
    expect(elementCopy.textOpacity).toBe(0.3);
    expect((slideCopy.elements[0] as TextElement).opacity).toBe(0.8);
    for (const value of [null, '0.5', NaN, Infinity, -0.1, 1.1]) {
      const invalid = JSON.parse(JSON.stringify(deck));
      invalid.slides[0].elements[0].textOpacity = value;
      expect(() => validateDeck(invalid)).toThrow('text opacity');
    }
    source.textOpacity = 0;
    expect((validateDeck(deck).slides[0].elements[0] as TextElement).textOpacity).toBe(0);
  });
});

describe('decorated text authoring backdrop', () => {
  it('samples the gradient backdrop and multiplies stop, paint and object alpha once', () => {
    const element = {
      color: '#ffffff',
      opacity: 0.5,
      decoration: {
        shape: 'rect' as const,
        line: null,
        fill: {
          color: '#ff0000',
          opacity: 0.5,
          gradient: {
            kind: 'linear' as const,
            stops: [
              { position: 0, color: '#000000', opacity: 0.5 },
              { position: 1, color: '#000000', opacity: 0.5 },
            ],
          },
        },
      },
    };
    const original = structuredClone(element);
    expect(textPreviewBackground(element, '#ffffff')).toBe('#dfdfdf');
    expect(element).toEqual(original);
  });

  it('composites fill alpha and whole-object alpha over the slide color', () => {
    const element = {
      color: '#ffffff',
      opacity: 0.5,
      decoration: {
        shape: 'ellipse' as const,
        fill: { color: '#000000', opacity: 0.5 },
        line: null,
      },
    };
    const original = structuredClone(element);
    expect(textPreviewBackground(element, '#ffffff')).toBe('#bfbfbf');
    expect(element).toEqual(original);
    element.decoration.fill = { color: '#80a0c0', opacity: 1 };
    expect(textPreviewBackground(element, '#102030')).toBe('#486078');
    expect(original.decoration.fill).toEqual({ color: '#000000', opacity: 0.5 });
    expect(element.opacity).toBe(0.5);
  });

  it('keeps the slide backdrop for no fill or transparent paints, and legacy contrast fallbacks', () => {
    const element = { color: '#ffffff', opacity: 1 };
    expect(textPreviewBackground(element, '#123456')).toBe('#123456');
    expect(textPreviewBackground(element)).toBe('#1e3029');
    expect(textPreviewBackground({ ...element, color: '#000000' })).toBe('#ffffff');
    const decorated = {
      ...element,
      decoration: { shape: 'rect' as const, fill: { color: '#000000', opacity: 0 }, line: null },
    };
    expect(textPreviewBackground(decorated, '#abcdef')).toBe('#abcdef');
    expect(
      textPreviewBackground(
        {
          ...decorated,
          opacity: 0,
          decoration: { ...decorated.decoration, fill: { color: '#000000', opacity: 1 } },
        },
        '#abcdef',
      ),
    ).toBe('#abcdef');
  });
});

describe('decoration independence from text layout', () => {
  it('preserves rich content and saved fitting when only paint or glyph opacity changes', () => {
    const before = createDeck(),
      element = before.slides[0].elements[0] as TextElement;
    element.autoFit = { mode: 'shrink', fontScale: 0.6, lineSpacingReduction: 0.1 };
    element.decoration = { shape: 'roundRect', cornerRadius: 0.25, fill: null, line: null };
    const nextText = applyTextPatch(element, { decoration: decoration(), textOpacity: 0.2 });
    const next = {
      ...before,
      slides: before.slides.map((slide, i) =>
        i
          ? slide
          : {
              ...slide,
              elements: slide.elements.map((entry) => (entry === element ? nextText : entry)),
            },
      ),
    };
    const fit = vi.fn((text: TextElement) => text);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(fit).not.toHaveBeenCalled();
    expect(nextText.text).toBe(element.text);
    expect(nextText.autoFit).toEqual(element.autoFit);
  });

  it('uses width-scaled dash lengths and a one-pixel approximation for stored hairlines', () => {
    const line = { color: '#123456', opacity: 1, width: 2, dash: 'dashDot' as const };
    expect(textLineDashArray(line)).toBe('8 6 2 6');
    expect(textLineDashArray({ ...line, width: 0 })).toBe('4 3 1 3');
    expect(textLineDashArray({ ...line, dash: 'solid' })).toBeUndefined();
    expect(line.width).toBe(2);
  });
});
