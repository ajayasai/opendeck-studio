import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createDeck, createElement, validateDeck } from './model';
import { importPptx } from './pptx';
import { prepareTextLayout } from './textFit';
import { fitTextElement, type MeasureText } from './textFitting';
import { textContentRect, textShapeInsets } from './textFrame';
import type { Deck, TextDecoration, TextElement } from './types';

function box(
  shape: TextDecoration['shape'] = 'rect',
  patch: Partial<TextElement> = {},
): TextElement {
  return {
    ...createElement('text', createDeck().theme),
    x: 100,
    y: 200,
    width: 400,
    height: 200,
    align: 'left',
    verticalAlign: 'top',
    rotation: 0,
    decoration: { shape, fill: null, line: null },
    textFrame: {
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      wrap: 'square',
      horizontalOverflow: 'clip',
      verticalOverflow: 'clip',
    },
    autoFit: { mode: 'resize' },
    ...patch,
  };
}
function deckWith(element: TextElement): Deck {
  const deck = createDeck();
  deck.slides[0].elements = [element];
  return deck;
}
function changed(deck: Deck, element: TextElement): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide, i) => (i ? slide : { ...slide, elements: [element] })),
  };
}
const closeRect = (actual: ReturnType<typeof textContentRect>, expected: number[]) => {
  for (const [i, field] of (['left', 'top', 'width', 'height'] as const).entries())
    expect(actual[field], field).toBeCloseTo(expected[i], 6);
};

describe('preset shape text rectangles', () => {
  it.each([
    ['rect', [0, 0, 400, 200]],
    ['roundRect', [9.76319526, 9.76319526, 380.47360948, 180.47360948]],
    ['ellipse', [58.5786437627, 29.2893218813, 282.8427124746, 141.4213562373]],
    ['triangle', [100, 100, 200, 100]],
  ] as const)('uses the preset %s region even without visible paint', (shape, expected) => {
    closeRect(textContentRect(box(shape)), [...expected]);
  });

  it('matches the independently COM-authored fixture geometry before any font measurement', async () => {
    const bytes = await readFile('tests/fixtures/powerpoint-text-decoration.pptx');
    const { deck } = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const texts = deck.slides
      .flatMap((slide) => slide.elements)
      .filter((element): element is TextElement => element.type === 'text');
    const find = (name: string) => {
      const element = texts.find((element) => element.name === name);
      expect(element, name).toBeDefined();
      return element!;
    };
    // Original COM fixture: rounded shapes are 380 x 140pt; preset regions are 260 x 300pt.
    // The golden local insets come from their native preset guides, not rendered glyph bounds.
    for (const [name, inset] of [
      ['Round default', 9.112315576],
      ['Round zero', 0],
      ['Round forty percent', 21.86912],
      ['Round half', 27.3364],
    ] as const) {
      const element = find(name);
      expect(element.width).toBeCloseTo(506.6666666667, 6);
      expect(element.height).toBeCloseTo(186.6666666667, 6);
      closeRect(textContentRect(element), [
        inset,
        inset,
        506.6666666667 - 2 * inset,
        186.6666666667 - 2 * inset,
      ]);
    }
    closeRect(textContentRect(find('Rectangle text region')), [0, 0, 346.6666666667, 400]);
    closeRect(
      textContentRect(find('Ellipse text region')),
      [50.7681579277, 58.5786437627, 245.1303508113, 282.8427124746],
    );
    closeRect(
      textContentRect(find('Triangle text region')),
      [86.6666666667, 200, 173.3333333333, 200],
    );
  });

  it('adds signed asymmetric body insets after shape geometry and clamps exhausted content dimensions', () => {
    const element = box('triangle');
    element.textFrame!.insets = { left: -15, right: 25, top: -30, bottom: 5 };
    closeRect(textContentRect(element), [85, 70, 190, 125]);
    expect(textShapeInsets(element)).toEqual({ left: 100, right: 100, top: 100, bottom: 0 });
    element.textFrame!.insets = { left: 10000, right: 10000, top: 10000, bottom: 10000 };
    closeRect(textContentRect(element), [10100, 10100, 0, 0]);
    expect(() => validateDeck(deckWith(element))).not.toThrow();
  });

  it('uses the smaller dimension for rounded corners and keeps legacy rectangles unchanged', () => {
    const landscape = box('roundRect', {
      decoration: { shape: 'roundRect', cornerRadius: 0.5, fill: null, line: null },
    });
    closeRect(textContentRect(landscape), [29.289, 29.289, 341.422, 141.422]);
    closeRect(
      textContentRect({ ...landscape, width: 200, height: 400 }),
      [29.289, 29.289, 141.422, 341.422],
    );
    const legacy = { ...box(), decoration: undefined, textFrame: undefined };
    closeRect(textContentRect(legacy), [0, 0, 400, 200]);
    expect(legacy.decoration).toBeUndefined();
    expect(legacy.textFrame).toBeUndefined();
  });
});

describe('shape-aware text fitting', () => {
  it.each([
    ['rect', 100, 40],
    ['ellipse', 141.43, 56.57],
    ['triangle', 200, 80],
    ['roundRect', 116.57, 56.57],
  ] as const)('inverts %s geometry for intrinsic no-wrap measurements', (shape, width, height) => {
    const source = box(shape);
    source.textFrame!.wrap = 'none';
    if (shape === 'roundRect') source.decoration!.cornerRadius = 0.5;
    const measure = vi.fn((_element: TextElement, intrinsic?: boolean) => {
      expect(intrinsic).toBe(true);
      return { width: 100, height: 40 };
    });
    const result = fitTextElement(source, measure);
    expect(result).toMatchObject({ width, height, x: 100, y: 200 });
    expect(textContentRect(result).width).toBeGreaterThanOrEqual(100);
    expect(textContentRect(result).height).toBeGreaterThanOrEqual(40);
    expect(source).toMatchObject({ width: 400, height: 200 });
  });

  it.each([
    ['ellipse', 127.28, 70.72],
    ['triangle', 180, 100],
    ['roundRect', 110.72, 70.72],
  ] as const)(
    'inverts signed body insets independently of the %s preset',
    (shape, width, height) => {
      const source = box(shape);
      source.textFrame!.wrap = 'none';
      source.textFrame!.insets = { left: -15, right: 5, top: -5, bottom: 15 };
      if (shape === 'roundRect') source.decoration!.cornerRadius = 0.5;
      const result = fitTextElement(source, () => ({ width: 100, height: 40 }));
      expect(result).toMatchObject({ width, height });
      expect(textContentRect(result).width).toBeGreaterThanOrEqual(100);
      expect(textContentRect(result).height).toBeGreaterThanOrEqual(40);
      expect(result.textFrame).toBe(source.textFrame);
    },
  );

  it.each([
    ['ellipse', 56.57, 141.4213562373],
    ['triangle', 80, 100],
    ['roundRect', 56.57, undefined],
  ] as const)(
    'keeps wrapped %s width and measures within its preset content area',
    (shape, height, contentWidth) => {
      const source = box(shape, { width: 200 });
      if (shape === 'roundRect') source.decoration!.cornerRadius = 0.5;
      const result = fitTextElement(source, (element, intrinsic) => {
        expect(intrinsic).toBe(false);
        const area = textContentRect(element);
        if (contentWidth !== undefined) expect(area.width).toBeCloseTo(contentWidth, 6);
        return { width: area.width, height: 40 };
      });
      expect(result).toMatchObject({ width: 200, height });
      expect(textContentRect(result).height).toBeGreaterThanOrEqual(40);
    },
  );

  it('grows through rounded-corner wrap discontinuities instead of keeping the first optimistic height', () => {
    const source = box('roundRect', { width: 100, height: 20 });
    source.decoration!.cornerRadius = 0.5;
    // Eight 25px words, separated by 5px, with 20px line boxes.
    const measure = vi.fn((element: TextElement) => {
      const width = textContentRect(element).width;
      const wordsPerLine = Math.max(1, Math.floor((width + 5) / 30));
      return { width, height: Math.ceil(8 / wordsPerLine) * 20 };
    });
    const result = fitTextElement(source, measure);
    expect(result).toMatchObject({ width: 100, height: 109.29 });
    expect(measure.mock.calls.some(([candidate]) => candidate.height < 100)).toBe(true);
    expect(measure.mock.calls.some(([candidate]) => candidate.height > 100)).toBe(true);
    expect(textContentRect(result).height).toBeGreaterThanOrEqual(measure(result).height);
    expect(fitTextElement(result, measure)).toBe(result);
  });

  it('uses a bounded narrowest-width fallback after many successive rounded-box line breaks', () => {
    const source = box('roundRect', { width: 1000, height: 10 });
    source.decoration!.cornerRadius = 0.5;
    // Deliberately dense stepwise wrap thresholds stress the iteration budget.
    const measure = vi.fn((element: TextElement) => {
      const width = textContentRect(element).width;
      const height = width <= 708 ? 710 : (Math.floor((1000 - width) / 0.29289) + 2) * 0.70711;
      return { width, height };
    });
    const result = fitTextElement(source, measure);
    expect(measure.mock.calls).toHaveLength(33);
    expect(measure.mock.calls.at(-1)![0].height).toBe(1000);
    expect(result).toMatchObject({ width: 1000, height: 1002.89 });
    expect(textContentRect(result).height).toBeGreaterThanOrEqual(710);
  });

  it('discards intermediate rounded sizes when the final narrowest-width fallback cannot measure', () => {
    const source = box('roundRect', { width: 1000, height: 10 });
    source.decoration!.cornerRadius = 0.5;
    const original = structuredClone(source);
    const measure = vi.fn((element: TextElement) => {
      const width = textContentRect(element).width;
      if (width <= 708) return undefined;
      return { width, height: (Math.floor((1000 - width) / 0.29289) + 2) * 0.70711 };
    });
    expect(fitTextElement(source, measure)).toBe(source);
    expect(measure).toHaveBeenCalledTimes(33);
    expect(source).toEqual(original);
  });

  it.each([
    ['rect', 1],
    ['ellipse', 0.97531],
    ['triangle', 0.68965],
  ] as const)(
    'shrinks against the actual %s content width across a word-wrap threshold',
    (shape, scale) => {
      const source = box(shape, {
        width: 200,
        height: 80,
        autoFit: { mode: 'shrink', fontScale: 0.5, lineSpacingReduction: 0 },
      });
      const measure: MeasureText = (element) => {
        const fontScale = element.autoFit?.mode === 'shrink' ? element.autoFit.fontScale : 1;
        const width = textContentRect(element).width;
        const perLine = Math.max(1, Math.floor((width + 5 * fontScale) / (25 * fontScale)));
        return { width, height: Math.ceil(12 / perLine) * 20 * fontScale };
      };
      const result = fitTextElement(source, measure);
      expect(result.autoFit).toMatchObject({ fontScale: scale });
      expect([result.width, result.height]).toEqual([200, 80]);
      expect(measure(result)!.height).toBeLessThanOrEqual(textContentRect(result).height + 0.25);
      if (scale < 1) {
        const next = {
          ...result,
          autoFit: { mode: 'shrink' as const, fontScale: scale + 0.00001, lineSpacingReduction: 0 },
        };
        expect(measure(next)!.height).toBeGreaterThan(textContentRect(next).height + 0.25);
      }
    },
  );

  it.each([
    [0, 200, 320],
    [30, 150, 260],
    [360, 150, 260],
  ] as const)('retains native anchors during triangle resize at rotation %s', (rotation, x, y) => {
    const source = box('triangle', {
      width: 300,
      height: 200,
      align: 'right',
      verticalAlign: 'bottom',
      rotation,
    });
    source.textFrame!.wrap = 'none';
    expect(fitTextElement(source, () => ({ width: 100, height: 40 }))).toMatchObject({
      width: 200,
      height: 80,
      x,
      y,
      rotation,
    });
  });

  it.each(['rect', 'roundRect', 'ellipse', 'triangle'] as const)(
    'keeps resized %s geometry within native persistence limits',
    (shape) => {
      const source = box(shape, { x: -99999, y: -99999, align: 'right', verticalAlign: 'bottom' });
      source.textFrame!.wrap = 'none';
      const grown = fitTextElement(source, () => ({ width: 1e8, height: 1e8 }));
      expect(grown).toMatchObject({ width: 100000, height: 100000, x: -100000, y: -100000 });
      expect(() => validateDeck(deckWith(grown))).not.toThrow();
      source.textFrame!.insets = { top: -10000, right: -10000, bottom: -10000, left: -10000 };
      const small = fitTextElement(source, () => ({ width: 0, height: 0 }));
      expect(small).toMatchObject({ width: 0.01, height: 0.01 });
      expect(() => validateDeck(deckWith(small))).not.toThrow();
    },
  );

  it.each([
    undefined,
    { width: NaN, height: 50 },
    { width: 50, height: Infinity },
    { width: 50, height: -1 },
  ])('retains the original rounded geometry when a later measurement is invalid: %j', (invalid) => {
    const source = box('roundRect');
    const original = structuredClone(source);
    let calls = 0;
    const measure = vi.fn(() => (++calls === 1 ? { width: 100, height: 80 } : invalid));
    expect(fitTextElement(source, measure)).toBe(source);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(source).toEqual(original);
  });
});

describe('shape geometry fitting invalidation', () => {
  it('preserves saved fitting for paint-only edits but recalculates changed preset regions', () => {
    const source = box('roundRect', {
      autoFit: { mode: 'shrink', fontScale: 0.65, lineSpacingReduction: 0.1 },
    });
    const before = deckWith(source);
    const fit = vi.fn((element: TextElement) => element);
    const paint = {
      ...source,
      textOpacity: 0.2,
      decoration: {
        ...source.decoration!,
        fill: { color: '#123456', opacity: 0.3 },
        line: {
          color: '#FFFFFF',
          opacity: 0.7,
          width: 99,
          dash: 'dash' as const,
          cap: 'round' as const,
          join: 'miter' as const,
          miterLimit: 20,
        },
      },
    };
    const next = changed(before, paint);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(fit).not.toHaveBeenCalled();
    for (const decoration of [
      { ...paint.decoration, shape: 'ellipse' as const },
      { ...paint.decoration, cornerRadius: 0.4 },
    ]) {
      const candidate = { ...source, decoration };
      prepareTextLayout(before, changed(before, candidate), fit);
      expect(fit).toHaveBeenLastCalledWith(candidate);
    }
    expect(fit).toHaveBeenCalledTimes(2);
    expect(source.autoFit).toMatchObject({ fontScale: 0.65 });
  });

  it('recognizes equivalent default rectangles and rounded ratios without unnecessary fitting', () => {
    for (const [source, decoration] of [
      [
        { ...box(), decoration: undefined },
        { shape: 'rect', fill: null, line: null },
      ],
      [box('roundRect'), { shape: 'roundRect', cornerRadius: 0.16667, fill: null, line: null }],
      [box('ellipse'), { shape: 'ellipse', cornerRadius: 0.5, fill: null, line: null }],
    ] as const) {
      const before = deckWith(source),
        fit = vi.fn((element: TextElement) => element);
      prepareTextLayout(before, changed(before, { ...source, decoration }), fit);
      expect(fit).not.toHaveBeenCalled();
    }
  });
});
