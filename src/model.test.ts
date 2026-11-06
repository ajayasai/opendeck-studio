import { describe, expect, it } from 'vitest';
import {
  alignElements,
  cloneSlide,
  commitHistory,
  contrastText,
  createDeck,
  createElement,
  createHistory,
  createSlide,
  redoHistory,
  removeElements,
  reorderSlide,
  THEMES,
  undoHistory,
  updateElement,
  validateDeck,
} from './model';

describe('contrast-aware text', () => {
  it('uses dark text on pale fills, white on dark fills, and a safe fallback', () => {
    expect(contrastText('#b7d887')).toBe('#172E29');
    expect(contrastText('#A5B8FF')).toBe('#172E29');
    expect(contrastText('#ffffff')).toBe('#172E29');
    expect(contrastText('#172e29')).toBe('#FFFFFF');
    expect(contrastText('#000000')).toBe('#FFFFFF');
    expect(contrastText('transparent')).toBe('#172E29');
  });
});

describe('native document validation', () => {
  it('round-trips all supported objects without retaining unexpected fields', () => {
    const deck = createDeck();
    expect(new Set(deck.slides.flatMap((s) => s.elements.map((e) => e.type)))).toEqual(
      new Set(['text', 'shape', 'chart', 'table', 'image']),
    );
    const result = validateDeck({ ...deck, unknown: '<script>' });
    expect(result).toEqual(deck);
    expect(result).not.toHaveProperty('unknown');
    expect(result).not.toBe(deck);
  });
  it('rejects unsupported versions and empty presentations', () => {
    expect(() => validateDeck({ ...createDeck(), schemaVersion: 2 })).toThrow('version');
    expect(() => validateDeck({ ...createDeck(), slides: [] })).toThrow('1–500');
  });
  it('rejects duplicate identities, nonfinite coordinates and unsafe styles', () => {
    const deck = createDeck();
    deck.slides[1].id = deck.slides[0].id;
    expect(() => validateDeck(deck)).toThrow('unique');
    const next = createDeck();
    next.slides[0].elements[0].x = Infinity;
    expect(() => validateDeck(next)).toThrow('Invalid x');
    next.slides[0].elements[0].x = 0;
    next.slides[0].background = 'url(https://tracking.invalid)';
    expect(() => validateDeck(next)).toThrow('background');
  });
  it.each([
    'https://tracking.invalid/pixel.png',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+',
  ])('rejects external or active image content %s', (src) => {
    const deck = createDeck();
    deck.slides[0].elements.push({ ...createElement('image', deck.theme), src } as ReturnType<
      typeof createElement
    >);
    expect(() => validateDeck(deck)).toThrow('Images must be embedded');
  });
  it('rejects malformed tables and mismatched chart series', () => {
    const deck = createDeck();
    const table = createElement('table', deck.theme);
    if (table.type !== 'table') throw new Error('Expected table');
    table.rows = [['a', 'b'], ['c']];
    deck.slides[0].elements = [table];
    expect(() => validateDeck(deck)).toThrow('same number');
    const chart = createElement('chart', deck.theme);
    if (chart.type !== 'chart') throw new Error('Expected chart');
    chart.values = [1];
    deck.slides[0].elements = [chart];
    expect(() => validateDeck(deck)).toThrow('matching lengths');
  });
  it('validates every built-in layout and theme', () => {
    for (const theme of THEMES)
      for (const layout of ['blank', 'title', 'content', 'split', 'quote'] as const) {
        expect(
          validateDeck({ ...createDeck(), theme, slides: [createSlide(theme, layout)] }).slides,
        ).toHaveLength(1);
      }
  });
  it('rejects negative or zero-sum pie series instead of silently changing the data', () => {
    const deck = createDeck();
    const chart = createElement('chart', deck.theme);
    chart.chartType = 'pie';
    chart.labels = ['One', 'Two'];
    chart.values = [1, -2];
    deck.slides[0].elements = [chart];
    expect(() => validateDeck(deck)).toThrow('nonnegative');
    chart.values = [0, 0];
    expect(() => validateDeck(deck)).toThrow('positive');
    chart.values = [0, 2];
    expect(validateDeck(deck).slides[0].elements[0]).toEqual(chart);
  });
});

describe('editing operations', () => {
  it('duplicates with fresh object identities and independent data', () => {
    const source = createDeck().slides[2];
    const clone = cloneSlide(source);
    expect(clone.id).not.toBe(source.id);
    clone.elements.forEach((element, index) =>
      expect(element.id).not.toBe(source.elements[index].id),
    );
    const chart = clone.elements.find((element) => element.type === 'chart');
    if (chart?.type !== 'chart') throw new Error('Expected chart');
    chart.values[0] = 900;
    const original = source.elements.find((element) => element.type === 'chart');
    expect(original?.type === 'chart' && original.values[0]).toBe(24);
  });
  it('preserves locked objects during editing and deletion', () => {
    const deck = createDeck();
    const slide = deck.slides[0];
    slide.elements[0].locked = true;
    const next = updateElement(deck, slide.id, slide.elements[0].id, { x: 999 });
    expect(next.slides[0].elements[0].x).toBe(slide.elements[0].x);
    const deleted = removeElements(
      deck,
      slide.id,
      slide.elements.slice(0, 2).map((e) => e.id),
    );
    expect(deleted.slides[0].elements).toHaveLength(slide.elements.length - 1);
    expect(deleted.slides[0].elements[0].locked).toBe(true);
    expect(deck.slides[0].elements).toHaveLength(slide.elements.length);
  });
  it('reorders without losing or mutating slides and ignores invalid positions', () => {
    const deck = createDeck();
    const result = reorderSlide(deck, 0, 4);
    expect(result.slides[4].id).toBe(deck.slides[0].id);
    expect(result.slides).toHaveLength(deck.slides.length);
    expect(deck.slides[0].id).not.toBe(result.slides[0].id);
    expect(reorderSlide(deck, -1, 0)).toBe(deck);
    expect(reorderSlide(deck, 0, 5)).toBe(deck);
  });
  it('aligns a single object to slide bounds and multiple objects to their shared bounds', () => {
    const deck = createDeck();
    const slide = deck.slides[0];
    const first = slide.elements[0];
    const centered = alignElements(deck, slide.id, [first.id], 'center');
    expect(centered.slides[0].elements[0].x).toBe((deck.width - first.width) / 2);
    const selected = slide.elements.slice(0, 3);
    const right = Math.max(...selected.map((element) => element.x + element.width));
    const aligned = alignElements(
      deck,
      slide.id,
      selected.map((element) => element.id),
      'right',
    );
    expect(
      aligned.slides[0].elements
        .slice(0, 3)
        .every((element) => element.x + element.width === right),
    ).toBe(true);
  });
});

describe('history', () => {
  it('undoes and redoes and discards the future after branching', () => {
    let state = commitHistory(commitHistory(createHistory('a'), 'b'), 'c');
    state = undoHistory(state);
    expect(state.present).toBe('b');
    expect(redoHistory(state).present).toBe('c');
    state = commitHistory(state, 'd');
    expect(state.future).toEqual([]);
    expect(redoHistory(state)).toBe(state);
  });
  it('keeps a bounded 100-step history', () => {
    let state = createHistory(0);
    for (let i = 1; i < 150; i++) state = commitHistory(state, i);
    expect(state.past).toHaveLength(100);
    expect(state.past[0]).toBe(49);
  });
});
