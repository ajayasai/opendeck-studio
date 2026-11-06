import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { cloneElement, createDeck, createElement, validateDeck } from './model';
import { withParagraphs } from './richText';
import { effectiveParagraphSpacing, resolveTextFrame, validateTextFrame } from './textFrame';
import { prepareTextLayout } from './textFit';
import { fitTextElement } from './textFitting';
import RichTextView from './RichTextView';
import type { Deck, TextElement } from './types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sample(edges?: boolean): TextElement {
  const element = createElement('text', createDeck().theme);
  return withParagraphs(
    {
      ...element,
      width: 240,
      height: 200,
      autoFit: { mode: 'resize' },
      textFrame: {
        ...resolveTextFrame(element),
        ...(edges === undefined ? {} : { paragraphSpacingAtEdges: edges }),
      },
    },
    [
      { runs: [{ text: 'First\nsoft break' }], spaceBefore: 10, spaceAfter: 20 },
      { runs: [{ text: 'Last' }], spaceBefore: 10, spaceAfter: 20 },
    ],
  );
}

describe('paragraph boundary spacing', () => {
  it('retains true and false in native backups and copies while leaving legacy fields absent', () => {
    for (const edges of [undefined, true, false]) {
      const deck = createDeck(),
        element = sample(edges);
      deck.slides[0].elements = [element];
      expect(validateDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
      expect(cloneElement(element).textFrame).toEqual(element.textFrame);
      if (edges === undefined)
        expect(resolveTextFrame(element)).not.toHaveProperty('paragraphSpacingAtEdges');
      else expect(resolveTextFrame(element).paragraphSpacingAtEdges).toBe(edges);
    }
    for (const value of [null, 0, 1, 'false', [], {}])
      expect(() =>
        validateTextFrame({ ...sample().textFrame, paragraphSpacingAtEdges: value }),
      ).toThrow('paragraph edge spacing');
  });

  it('omits only first-before and last-after, including single and empty paragraphs', () => {
    const element = sample(false),
      paragraphs = element.paragraphs!;
    expect(effectiveParagraphSpacing(paragraphs[0], element.textFrame, 0, 2)).toEqual({
      before: 0,
      after: 20,
    });
    expect(effectiveParagraphSpacing(paragraphs[1], element.textFrame, 1, 2)).toEqual({
      before: 10,
      after: 0,
    });
    expect(effectiveParagraphSpacing(paragraphs[0], element.textFrame, 0, 1)).toEqual({
      before: 0,
      after: 0,
    });
    expect(
      effectiveParagraphSpacing(
        { runs: [{ text: '' }], spaceBefore: 10, spaceAfter: 20 },
        element.textFrame,
        1,
        3,
      ),
    ).toEqual({ before: 10, after: 20 });
    // A soft break inside a run does not create another paragraph boundary.
    expect(paragraphs).toHaveLength(2);
    for (const edges of [undefined, true])
      expect(effectiveParagraphSpacing(paragraphs[0], sample(edges).textFrame, 0, 1)).toEqual({
        before: 10,
        after: 20,
      });
  });

  it.each(['top', 'middle', 'bottom'] as const)(
    'renders the edge policy independently of the %s anchor and saved scaling',
    (verticalAlign) => {
      const element = {
        ...sample(false),
        verticalAlign,
        textOpacity: 0.4,
        autoFit: { mode: 'shrink' as const, fontScale: 0.5, lineSpacingReduction: 0 },
      };
      const before = structuredClone(element),
        view = render(<RichTextView element={element} />);
      const margins = () =>
        [...view.container.querySelectorAll<HTMLElement>('.text-paragraph')].map((node) => [
          node.style.marginTop,
          node.style.marginBottom,
        ]);
      expect(margins()).toEqual([
        ['0pt', '20pt'],
        ['10pt', '0pt'],
      ]);
      expect(view.container.querySelector<HTMLElement>('.text-content')!.style.opacity).toBe('0.4');
      view.rerender(
        <RichTextView
          element={{
            ...element,
            textFrame: { ...element.textFrame!, paragraphSpacingAtEdges: true },
          }}
        />,
      );
      expect(margins()).toEqual([
        ['10pt', '20pt'],
        ['10pt', '20pt'],
      ]);
      expect(element).toEqual(before);
    },
  );

  it('uses the same paragraph boundaries during DOM measurement and cleans up its temporary tree', () => {
    const recorded: string[][][] = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const paragraphs = [...this.querySelectorAll<HTMLElement>('.text-paragraph')];
      recorded.push(paragraphs.map((node) => [node.style.marginTop, node.style.marginBottom]));
      const margins = paragraphs.reduce(
        (total, node) =>
          total +
          ((parseFloat(node.style.marginTop) + parseFloat(node.style.marginBottom)) * 4) / 3,
        0,
      );
      return new DOMRect(0, 0, 240, paragraphs.length * 20 + margins);
    });
    expect(fitTextElement(sample(false)).height).toBe(80);
    expect(fitTextElement(sample(true)).height).toBe(120);
    expect(recorded).toEqual([
      [
        ['0pt', '20pt'],
        ['10pt', '0pt'],
      ],
      [
        ['10pt', '20pt'],
        ['10pt', '20pt'],
      ],
    ]);
    expect(document.querySelector('.rich-text-content')).toBeNull();
  });

  it('recalculates only effective spacing changes, preserving imported fitting for ignored endpoints', () => {
    const before = createDeck();
    before.slides[0].elements = [sample(false)];
    const source = before.slides[0].elements[0] as TextElement;
    const change = (element: TextElement): Deck => ({
      ...before,
      slides: [{ ...before.slides[0], elements: [element] }, ...before.slides.slice(1)],
    });
    const fit = vi.fn((element: TextElement) => element);
    const ignored = withParagraphs(
      source,
      source.paragraphs!.map((paragraph, i) => ({
        ...paragraph,
        ...(i === 0 ? { spaceBefore: 99 } : { spaceAfter: 88 }),
      })),
    );
    prepareTextLayout(before, change(ignored), fit);
    expect(fit).not.toHaveBeenCalled();
    prepareTextLayout(
      before,
      change({ ...source, textFrame: { ...source.textFrame!, paragraphSpacingAtEdges: true } }),
      fit,
    );
    expect(fit).toHaveBeenCalledOnce();
    fit.mockClear();
    const inside = withParagraphs(
      source,
      source.paragraphs!.map((paragraph, i) => (i ? paragraph : { ...paragraph, spaceAfter: 21 })),
    );
    prepareTextLayout(before, change(inside), fit);
    expect(fit).toHaveBeenCalledOnce();
  });
});
