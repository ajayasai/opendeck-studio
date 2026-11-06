import { describe, expect, it, vi } from 'vitest';
import { cloneElement, createDeck, validateDeck } from './model';
import { withParagraphs } from './richText';
import { fromTiptapDocument, toTiptapDocument } from './richTextEditorAdapter';
import { prepareTextLayout, resolveAutoFit, validateAutoFit } from './textFit';
import type { Deck, TextElement } from './types';

function fixture(): Deck {
  const deck = createDeck();
  deck.slides[0].elements[0] = withParagraphs(
    {
      ...(deck.slides[0].elements[0] as TextElement),
      autoFit: { mode: 'shrink', fontScale: 0.72, lineSpacingReduction: 0.13 },
    },
    [
      {
        runs: [{ text: 'One', bold: true }, { text: ' two' }],
        bullet: { kind: 'number', level: 0 },
      },
      { runs: [{ text: 'Three' }], bullet: { kind: 'number', level: 0 }, lineSpacingPoints: 20 },
    ],
  );
  return deck;
}
const first = (deck: Deck) => deck.slides[0].elements[0] as TextElement;
function edit(deck: Deck, change: (element: TextElement) => TextElement): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide, index) =>
      index
        ? slide
        : {
            ...slide,
            elements: slide.elements.map((element, index) =>
              index ? element : change(element as TextElement),
            ),
          },
    ),
  };
}

describe('saved native text fitting', () => {
  it('preserves legacy documents and independently resolves absent fitting', () => {
    const deck = createDeck();
    expect(JSON.stringify(validateDeck(deck))).toBe(JSON.stringify(deck));
    expect(resolveAutoFit(first(deck))).toEqual({ mode: 'none' });
    expect(resolveAutoFit(first(deck))).not.toBe(resolveAutoFit(first(deck)));
    expect(first(deck)).not.toHaveProperty('autoFit');
  });

  it('retains saved shrink parameters and reconstructs only the recognized union fields', () => {
    const deck = fixture();
    expect(validateDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    const source = { mode: 'shrink', fontScale: 0.01, lineSpacingReduction: 132, unsafe: true };
    expect(validateAutoFit(source)).toEqual({
      mode: 'shrink',
      fontScale: 0.01,
      lineSpacingReduction: 132,
    });
    expect(validateAutoFit({ mode: 'shrink', fontScale: 1, lineSpacingReduction: 0 })).toEqual({
      mode: 'shrink',
      fontScale: 1,
      lineSpacingReduction: 0,
    });
    expect(validateAutoFit({ mode: 'none', fontScale: 'bad' })).toEqual({ mode: 'none' });
    expect(validateAutoFit({ mode: 'resize', fontScale: 0.3 })).toEqual({ mode: 'resize' });
    expect(cloneElement(first(deck)).autoFit).toEqual(first(deck).autoFit);
    expect(cloneElement(first(deck)).autoFit).not.toBe(first(deck).autoFit);
  });

  it.each([undefined, null, [], 'shrink', {}, { mode: 'auto' }])(
    'rejects malformed autofit %j',
    (value) => {
      expect(() => validateAutoFit(value)).toThrow('Invalid text autofit');
    },
  );

  it('rejects missing, nonnumeric, nonfinite and out-of-range shrink parameters', () => {
    for (const value of [undefined, null, '1', NaN, Infinity, -Infinity, 0, 0.0099, 1.0001])
      expect(() =>
        validateAutoFit({ mode: 'shrink', fontScale: value, lineSpacingReduction: 0 }),
      ).toThrow('fontScale');
    for (const value of [undefined, null, '0', NaN, Infinity, -Infinity, -0.01, 132.0001])
      expect(() =>
        validateAutoFit({ mode: 'shrink', fontScale: 1, lineSpacingReduction: value }),
      ).toThrow('lineSpacingReduction');
    const deck = fixture();
    first(deck).autoFit = { mode: 'shrink', fontScale: NaN, lineSpacingReduction: 0 };
    expect(() => validateDeck(deck)).toThrow('fontScale');
  });
});

describe('pre-command fitting invalidation', () => {
  it('fits a geometry edit once, keeping unrelated objects/slides shared and inputs unchanged', () => {
    const before = fixture();
    const next = edit(before, (text) => ({ ...text, width: text.width / 2 }));
    const fit = vi.fn((text: TextElement): TextElement => ({
      ...text,
      autoFit: { mode: 'shrink', fontScale: 0.4, lineSpacingReduction: 0 },
    }));
    const prepared = prepareTextLayout(before, next, fit);
    expect(fit).toHaveBeenCalledExactlyOnceWith(first(next));
    expect(first(prepared).autoFit).toMatchObject({ fontScale: 0.4 });
    expect(first(before).autoFit).toMatchObject({ fontScale: 0.72 });
    expect(first(next).autoFit).toMatchObject({ fontScale: 0.72 });
    expect(prepared.slides[1]).toBe(next.slides[1]);
    expect(prepared.slides[0].elements[1]).toBe(next.slides[0].elements[1]);
  });

  it.each([
    ['text', (text: TextElement) => withParagraphs(text, [{ runs: [{ text: 'Changed' }] }])],
    ['font', (text: TextElement) => ({ ...text, fontFamily: 'Georgia' })],
    ['bold', (text: TextElement) => ({ ...text, bold: !text.bold })],
    ['size', (text: TextElement) => ({ ...text, fontSize: text.fontSize + 1 })],
    [
      'exact spacing',
      (text: TextElement) =>
        withParagraphs(text, [{ runs: [{ text: text.text }], lineSpacingPoints: 26 }]),
    ],
    [
      'insets',
      (text: TextElement) => ({
        ...text,
        textFrame: {
          insets: { top: 0, right: 8, bottom: 0, left: 0 },
          wrap: 'square' as const,
          horizontalOverflow: 'clip' as const,
          verticalOverflow: 'clip' as const,
        },
      }),
    ],
    ['mode', (text: TextElement) => ({ ...text, autoFit: { mode: 'resize' as const } })],
  ])('fits changed %s metrics', (_name, change) => {
    const before = fixture(),
      next = edit(before, change);
    const fit = vi.fn((text: TextElement) => text);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(fit).toHaveBeenCalledOnce();
  });

  it('preserves imported scale through a no-op rich Save with explicit styles and normalized list starts', () => {
    const before = fixture();
    const next = edit(before, (text) =>
      withParagraphs(text, fromTiptapDocument(toTiptapDocument(text), text)),
    );
    expect(first(next).paragraphs).not.toEqual(first(before).paragraphs);
    const fit = vi.fn((text: TextElement) => text);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(fit).not.toHaveBeenCalled();
    expect(first(next).autoFit).toEqual(first(before).autoFit);
  });

  it('ignores run segmentation and presentation metadata while honoring effective overrides', () => {
    const before = fixture();
    const source = first(before);
    source.paragraphs = [
      { runs: [{ text: 'Same', fontSize: 24, fontFamily: 'Arial', bold: false, italic: false }] },
    ];
    source.text = 'Same';
    const next = edit(before, (text) => ({
      ...text,
      x: text.x + 30,
      y: 5,
      rotation: 30,
      name: 'Renamed',
      color: '#445566',
      opacity: 0.5,
      fontSize: 90,
      fontFamily: 'Georgia',
      bold: true,
      italic: true,
      paragraphs: [
        {
          align: text.align,
          lineSpacing: 1.16,
          spaceBefore: 0,
          spaceAfter: 0,
          runs: [
            {
              text: 'Sa',
              fontSize: 24,
              fontFamily: 'Arial',
              bold: false,
              italic: false,
              color: '#445566',
            },
            {
              text: 'me',
              fontSize: 24,
              fontFamily: 'Arial',
              bold: false,
              italic: false,
              underline: true,
              hyperlink: 'https://example.com',
            },
          ],
        },
      ],
    }));
    const fit = vi.fn((text: TextElement) => text);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(fit).not.toHaveBeenCalled();
  });

  it('keeps new deck/copy results, unchanged snapshots, fit-none edits, and explicit scale changes', () => {
    const before = fixture(),
      fit = vi.fn((text: TextElement) => text);
    const copied = {
      ...before,
      slides: [{ ...before.slides[0], elements: [cloneElement(first(before))] }],
    };
    const next = edit(before, (text) => ({ ...text, autoFit: { mode: 'none' }, width: 20 }));
    const scaleOnly = edit(before, (text) => ({
      ...text,
      autoFit: { mode: 'shrink', fontScale: 0.2, lineSpacingReduction: 0.1 },
    }));
    expect(prepareTextLayout(before, before, fit)).toBe(before);
    expect(prepareTextLayout(before, copied, fit)).toBe(copied);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(prepareTextLayout(before, scaleOnly, fit)).toBe(scaleOnly);
    const loaded = { ...next, id: 'new-deck-id' };
    expect(prepareTextLayout(before, loaded, fit)).toBe(loaded);
    expect(fit).not.toHaveBeenCalled();
  });

  it('starts fitting when an existing legacy text box opts in', () => {
    const before = createDeck();
    const next = edit(before, (text) => ({
      ...text,
      autoFit: { mode: 'shrink', fontScale: 1, lineSpacingReduction: 0 },
    }));
    const fit = vi.fn((text: TextElement) => text);
    prepareTextLayout(before, next, fit);
    expect(fit).toHaveBeenCalledExactlyOnceWith(first(next));
  });
});
