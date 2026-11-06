import { describe, expect, it, vi } from 'vitest';
import { createDeck, validateDeck } from './model';
import { fitTextElement, solveShrinkScale, type MeasureText } from './textFitting';
import {
  paragraphContentStyle,
  paragraphLineHeight,
  paragraphMarkerStyle,
  textParagraphStyle,
  textRunStyle,
} from './textLayout';
import type { TextElement, TextParagraph } from './types';

function element(patch: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text',
    name: 'Fitting sample',
    type: 'text',
    x: 100,
    y: 200,
    width: 240,
    height: 120,
    rotation: 0,
    opacity: 1,
    locked: false,
    animation: 'none',
    text: 'A large line',
    fontSize: 40,
    fontFamily: 'Arial',
    color: '#172E29',
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    verticalAlign: 'top',
    autoFit: { mode: 'shrink', fontScale: 0.72, lineSpacingReduction: 0.15 },
    textFrame: {
      insets: { top: 20, right: 8, bottom: 20, left: 32 },
      wrap: 'square',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'overflow',
    },
    paragraphs: [
      {
        runs: [
          { text: 'A large ', fontSize: 40, bold: true },
          { text: 'line', fontSize: 20 },
        ],
        lineSpacing: 1.5,
      },
    ],
    ...patch,
  };
}

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

describe('bounded shrink solving', () => {
  it.each([
    [0.01, 0.01],
    [0.01789, 0.01789],
    [0.8123456, 0.81234],
    [0.9999999, 0.99999],
    [1, 1],
  ])('selects the greatest representable scale at threshold %s', (threshold, expected) => {
    const fits = vi.fn((scale: number) => scale <= threshold);
    const result = solveShrinkScale(fits);
    expect(result).toBe(expected);
    expect(result * 100000).toBeCloseTo(Math.round(result * 100000), 8);
    expect(result).toBeGreaterThanOrEqual(0.01);
    expect(result).toBeLessThanOrEqual(1);
    expect(fits(result)).toBe(true);
    if (result < 1) expect(fits((Math.round(result * 100000) + 1) / 100000)).toBe(false);
    // At most 19 search reads, plus the two assertions above.
    expect(fits.mock.calls.length).toBeLessThanOrEqual(21);
  });

  it('handles a discontinuous extra wrapped line without overshooting the fit boundary', () => {
    const height = (scale: number) => (scale > 0.625 ? 3 : 2) * 40 * scale;
    const result = solveShrinkScale((scale) => height(scale) <= 60);
    expect(result).toBe(0.625);
    expect(height(result)).toBeLessThanOrEqual(60);
    expect(height(result + 0.00001)).toBeGreaterThan(60);
  });

  it('uses the minimum permitted scale when even that minimum cannot fit', () => {
    const fits = vi.fn(() => false);
    expect(solveShrinkScale(fits)).toBe(0.01);
    expect(fits).toHaveBeenCalledTimes(2);
  });
});

describe('shrink measurement integration', () => {
  it('fits the inset content area and updates only saved scale without mutating rich text', () => {
    const source = frozen(element());
    const measure = vi.fn((candidate: TextElement) => {
      if (candidate.autoFit?.mode !== 'shrink') throw new Error('Expected shrink candidate');
      expect(candidate.autoFit.lineSpacingReduction).toBe(0.15);
      expect(candidate.fontSize).toBe(40);
      expect(candidate.paragraphs).toBe(source.paragraphs);
      expect(candidate.paragraphs?.[0].runs.map((run) => run.fontSize)).toEqual([40, 20]);
      return {
        width: 200 * candidate.autoFit.fontScale,
        height: 160.5 * candidate.autoFit.fontScale,
      };
    });
    const result = fitTextElement(source, measure);
    expect(result).toEqual({
      ...source,
      autoFit: { mode: 'shrink', fontScale: 0.5, lineSpacingReduction: 0.15 },
    });
    expect(result).not.toBe(source);
    expect(source.autoFit).toEqual({ mode: 'shrink', fontScale: 0.72, lineSpacingReduction: 0.15 });
    expect(result.paragraphs).toBe(source.paragraphs);
    expect(result.textFrame).toBe(source.textFrame);
    expect(measure.mock.calls.length).toBeLessThanOrEqual(19);
  });

  it('keeps object identity when the measured maximum already equals the saved scale', () => {
    const source = element();
    const measure: MeasureText = (candidate) => ({
      width: 50,
      height:
        candidate.autoFit?.mode === 'shrink' && candidate.autoFit.fontScale <= 0.72 ? 40 : 200,
    });
    expect(fitTextElement(source, measure)).toBe(source);
  });

  it('keeps a non-fitting zero content area bounded at the minimum without changing box dimensions', () => {
    const source = element({
      textFrame: {
        insets: { top: 100, bottom: 100, left: 200, right: 200 },
        wrap: 'square',
        horizontalOverflow: 'clip',
        verticalOverflow: 'clip',
      },
    });
    const result = fitTextElement(source, (candidate) => {
      const scale = candidate.autoFit?.mode === 'shrink' ? candidate.autoFit.fontScale : 1;
      return { width: 20 * scale, height: 40 * scale };
    });
    expect(result.autoFit).toMatchObject({ mode: 'shrink', fontScale: 0.01 });
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('allows empty text to use full scale even when its content area is zero', () => {
    const source = element({ text: '', paragraphs: [{ runs: [] }], width: 12, height: 12 });
    expect(fitTextElement(source, () => ({ width: 0, height: 0 })).autoFit).toMatchObject({
      mode: 'shrink',
      fontScale: 1,
    });
  });

  it.each([undefined, { mode: 'none' as const }])(
    'never measures disabled fitting %j',
    (autoFit) => {
      const source = element({ autoFit });
      const measure = vi.fn(() => ({ width: 1000, height: 1000 }));
      expect(fitTextElement(source, measure)).toBe(source);
      expect(measure).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    { width: NaN, height: 10 },
    { width: 10, height: Infinity },
    { width: -1, height: 10 },
    { width: 10, height: -1 },
  ])('preserves saved scale when measurement is unavailable or nonfinite: %j', (measurement) => {
    const source = element();
    expect(fitTextElement(source, () => measurement)).toBe(source);
  });

  it('preserves the saved result if a later bounded-search measurement becomes unavailable', () => {
    const source = element();
    let calls = 0;
    const measure: MeasureText = (candidate) => {
      if (++calls === 3) return undefined;
      const scale = candidate.autoFit?.mode === 'shrink' ? candidate.autoFit.fontScale : 1;
      return { width: 100 * scale, height: 200 * scale };
    };
    expect(fitTextElement(source, measure)).toBe(source);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('preserves saved values and cleans up its hidden tree in a layout-free environment', () => {
    const source = element();
    const childrenBefore = Array.from(document.body.children);
    expect(fitTextElement(source)).toBe(source);
    expect(Array.from(document.body.children)).toEqual(childrenBefore);
  });
});

describe('shape resize geometry', () => {
  const resize = (patch: Partial<TextElement> = {}) =>
    element({
      autoFit: { mode: 'resize' },
      width: 200,
      height: 100,
      textFrame: {
        insets: { left: 0, top: 0, right: 0, bottom: 0 },
        wrap: 'none',
        horizontalOverflow: 'overflow',
        verticalOverflow: 'overflow',
      },
      paragraphs: undefined,
      ...patch,
    });

  it('requests intrinsic width for no-wrap text and adds signed insets before rounding upward', () => {
    const source = frozen(
      resize({
        textFrame: {
          insets: { left: 10, right: 20, top: 5, bottom: -2 },
          wrap: 'none',
          horizontalOverflow: 'overflow',
          verticalOverflow: 'overflow',
        },
      }),
    );
    const measure = vi.fn(() => ({ width: 120.001, height: 30.001 }));
    const result = fitTextElement(source, measure);
    expect(measure).toHaveBeenCalledExactlyOnceWith(source, true);
    expect(result).toMatchObject({
      x: source.x,
      y: source.y,
      width: 150.01,
      height: 33.01,
      autoFit: { mode: 'resize' },
    });
    expect(source.width).toBe(200);
    expect(source.height).toBe(100);
  });

  it('keeps wrapped width fixed while resizing height to content plus insets', () => {
    const source = resize({
      textFrame: {
        insets: { left: 10, right: 20, top: 5, bottom: 15 },
        wrap: 'square',
        horizontalOverflow: 'overflow',
        verticalOverflow: 'overflow',
      },
    });
    const measure = vi.fn(() => ({ width: 1000, height: 50 }));
    const result = fitTextElement(source, measure);
    expect(measure).toHaveBeenCalledExactlyOnceWith(source, false);
    expect(result.width).toBe(200);
    expect(result.height).toBe(70);
  });

  it.each([
    ['left', 'top', 100, 200],
    ['center', 'top', 50, 200],
    ['right', 'top', 0, 200],
    ['left', 'middle', 100, 150],
    ['center', 'middle', 50, 150],
    ['right', 'middle', 0, 150],
    ['left', 'bottom', 100, 100],
    ['center', 'bottom', 50, 100],
    ['right', 'bottom', 0, 100],
  ] as const)(
    'anchors unrotated resize at horizontal %s and vertical %s',
    (align, verticalAlign, x, y) => {
      const source = resize({ align, verticalAlign });
      expect(fitTextElement(source, () => ({ width: 300, height: 200 }))).toMatchObject({
        x,
        y,
        width: 300,
        height: 200,
      });
    },
  );

  it('uses the first paragraph alignment when it overrides the box default', () => {
    const source = resize({
      align: 'left',
      paragraphs: [{ align: 'right', runs: [{ text: 'A large line' }] }],
    });
    expect(fitTextElement(source, () => ({ width: 300, height: 100 })).x).toBe(0);
  });

  it.each([30, -30, 360, -360, 720])(
    'preserves the stored geometric center at rotation %s, including exact turns',
    (rotation) => {
      const source = resize({ rotation, align: 'right', verticalAlign: 'bottom' });
      const result = fitTextElement(source, () => ({ width: 300, height: 200 }));
      expect(result.x + result.width / 2).toBe(source.x + source.width / 2);
      expect(result.y + result.height / 2).toBe(source.y + source.height / 2);
      expect(result.rotation).toBe(rotation);
      expect(result).toMatchObject({ x: 50, y: 150 });
    },
  );

  it.each([
    [{ width: 0, height: 0 }, 0.01, 0.01],
    [{ width: 20001, height: 20001 }, 20001, 20001],
    [{ width: 200001, height: 200001 }, 100000, 100000],
  ])('bounds measured dimensions %j to supported resize limits', (measurement, width, height) => {
    expect(fitTextElement(resize(), () => measurement)).toMatchObject({ width, height });
  });

  it.each([
    { rotation: 0, coordinate: -99990, size: 100, measured: 9900, expected: -100000 },
    { rotation: 360, coordinate: -99990, size: 100, measured: 9900, expected: -100000 },
    { rotation: 0, coordinate: 99990, size: 100000, measured: 12, expected: 100000 },
    { rotation: 360, coordinate: 99990, size: 100000, measured: 12, expected: 100000 },
  ])(
    'keeps native save validation valid at coordinate $coordinate and rotation $rotation',
    ({ rotation, coordinate, size, measured, expected }) => {
      const source = frozen(
        resize({
          x: coordinate,
          y: coordinate,
          width: size,
          height: size,
          align: 'right',
          verticalAlign: 'bottom',
          rotation,
        }),
      );
      const deck = createDeck();
      deck.slides[0].elements = [source];
      expect(() => validateDeck(deck)).not.toThrow();
      const result = fitTextElement(source, () => ({ width: measured, height: measured }));
      expect(result).toMatchObject({ x: expected, y: expected, width: measured, height: measured });
      expect(source.x).toBe(coordinate);
      expect(source.y).toBe(coordinate);
      deck.slides[0].elements = [result];
      expect(validateDeck(deck).slides[0].elements[0]).toMatchObject({ x: expected, y: expected });
    },
  );

  it('preserves valid far off-slide coordinates when the anchor does not move', () => {
    const source = resize({ x: 50000, y: -50000 });
    const result = fitTextElement(source, () => ({ width: 300, height: 200 }));
    expect(result).toMatchObject({ x: 50000, y: -50000, width: 300, height: 200 });
    const deck = createDeck();
    deck.slides[0].elements = [result];
    expect(() => validateDeck(deck)).not.toThrow();
  });

  it.each([
    undefined,
    { width: Infinity, height: 50 },
    { width: 100, height: NaN },
    { width: -1, height: 50 },
    { width: 100, height: -1 },
  ])('preserves resize geometry when measurement is unavailable: %j', (measurement) => {
    const source = resize();
    expect(fitTextElement(source, () => measurement)).toBe(source);
  });

  it('retains identity when the saved dimensions already contain the measured text exactly', () => {
    const source = resize();
    expect(fitTextElement(source, () => ({ width: 200, height: 100 }))).toBe(source);
  });
});

describe('fitting layout semantics', () => {
  const source = element({
    autoFit: { mode: 'shrink', fontScale: 0.5, lineSpacingReduction: 0.2 },
  });

  it('shrinks glyph sizes while retaining absolute paragraph spacing and list indentation', () => {
    const paragraph: TextParagraph = {
      runs: [{ text: 'Nested', fontSize: 60 }],
      bullet: { kind: 'bullet', level: 2 },
      spaceBefore: 10,
      spaceAfter: 20,
      lineSpacing: 1.5,
    };
    expect(textRunStyle(paragraph.runs[0], source).fontSize).toBe('30pt');
    expect(textParagraphStyle(paragraph, source)).toMatchObject({
      marginTop: '10pt',
      marginBottom: '20pt',
      paddingLeft: '168pt',
      lineHeight: 1.3,
    });
    expect(paragraphMarkerStyle(paragraph, source)).toMatchObject({
      fontSize: '30pt',
      minWidth: '72pt',
      paddingRight: '18pt',
    });
    expect(paragraphContentStyle(paragraph, source).minHeight).toBe('39pt');
  });

  it('subtracts reduction from relative spacing but leaves fixed-point spacing and zero unchanged', () => {
    expect(paragraphLineHeight({ runs: [], lineSpacing: 1.5 }, source)).toBe(1.3);
    expect(paragraphLineHeight({ runs: [], lineSpacingPoints: 36 }, source)).toBe('36pt');
    expect(paragraphContentStyle({ runs: [], lineSpacingPoints: 36 }, source).minHeight).toBe(
      '36pt',
    );
    expect(paragraphLineHeight({ runs: [], lineSpacingPoints: 0 }, source)).toBe('0pt');
    expect(
      paragraphLineHeight(
        { runs: [], lineSpacing: 1 },
        element({ autoFit: { mode: 'shrink', fontScale: 0.5, lineSpacingReduction: 132 } }),
      ),
    ).toBe(0);
  });
});
