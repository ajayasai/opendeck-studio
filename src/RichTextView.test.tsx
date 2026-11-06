import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createDeck, createElement } from './model';
import RichTextView, { paragraphMarkers } from './RichTextView';
import type { TextFrame, TextParagraph } from './types';

afterEach(cleanup);
describe('rich slide rendering', () => {
  it('applies saved shrink scale to inherited and explicit runs and marker glyphs while retaining absolute list spacing', () => {
    const element = createElement('text', createDeck().theme);
    element.fontSize = 40;
    element.autoFit = { mode: 'shrink', fontScale: 0.5, lineSpacingReduction: 0.2 };
    element.text = 'LargeSmall';
    element.paragraphs = [
      {
        runs: [{ text: 'Large', fontSize: 30 }, { text: 'Small' }],
        bullet: { kind: 'number', level: 2, start: 3 },
        lineSpacing: 1.5,
        spaceBefore: 4,
        spaceAfter: 8,
      },
    ];
    const original = structuredClone(element),
      view = render(<RichTextView element={element} />);
    const paragraph = view.container.querySelector<HTMLElement>('.text-paragraph')!,
      marker = screen.getByText('3.');
    const content = view.container.querySelector<HTMLElement>('.paragraph-content')!;
    expect(screen.getByText('Large').style.fontSize).toBe('15pt');
    expect(screen.getByText('Small').style.fontSize).toBe('20pt');
    expect(marker.style.fontSize).toBe('15pt');
    expect(marker.style.minWidth).toBe('36pt');
    expect(marker.style.paddingRight).toBe('9pt');
    expect(paragraph.style.paddingLeft).toBe('84pt');
    expect(paragraph.style.marginTop).toBe('4pt');
    expect(paragraph.style.marginBottom).toBe('8pt');
    // Reduction is subtracted from the multiplier (1.5 - .2), not multiplied into it.
    expect(Number(paragraph.style.lineHeight)).toBeCloseTo(1.3);
    expect(parseFloat(content.style.minHeight)).toBeCloseTo(19.5);
    expect(element).toEqual(original);
  });

  it('keeps exact point line spacing unchanged by saved shrink and clamps relative reduction at zero', () => {
    const element = createElement('text', createDeck().theme);
    element.autoFit = { mode: 'shrink', fontScale: 0.25, lineSpacingReduction: 2 };
    element.text = 'Exact\nZero exact\nRelative';
    element.paragraphs = [
      { runs: [{ text: 'Exact', fontSize: 40 }], lineSpacingPoints: 27.25 },
      { runs: [{ text: 'Zero exact' }], lineSpacingPoints: 0 },
      { runs: [{ text: 'Relative' }], lineSpacing: 1.5 },
    ];
    const view = render(<RichTextView element={element} />);
    const paragraphs = Array.from(view.container.querySelectorAll<HTMLElement>('.text-paragraph'));
    const contents = Array.from(view.container.querySelectorAll<HTMLElement>('.paragraph-content'));
    expect(paragraphs.map((paragraph) => paragraph.style.lineHeight)).toEqual([
      '27.25pt',
      '0pt',
      '0',
    ]);
    expect(contents.map((content) => content.style.minHeight)).toEqual(['27.25pt', '0pt', '0pt']);
    expect(screen.getByText('Exact').style.fontSize).toBe('10pt');
  });

  it('renders character overrides including false emphasis and paragraph spacing', () => {
    const e = createElement('text', createDeck().theme);
    e.bold = true;
    e.underline = true;
    e.paragraphs = [
      {
        align: 'right',
        spaceAfter: 12,
        lineSpacing: 1.5,
        runs: [
          { text: 'Normal', bold: false, underline: false, fontSize: 18, color: '#993322' },
          { text: 'Strong', bold: true },
        ],
      },
    ];
    e.text = 'NormalStrong';
    render(<RichTextView element={e} />);
    expect(screen.getByText('Normal').style.fontWeight).toBe('400');
    expect(screen.getByText('Normal').style.textDecoration).toBe('none');
    expect(screen.getByText('Normal').style.fontSize).toBe('18pt');
    expect(screen.getByText('Strong').style.fontWeight).toBe('700');
    expect(screen.getByText('Normal').parentElement?.style.textAlign).toBe('right');
    expect(screen.getByText('Normal').closest('.text-paragraph')?.getAttribute('style')).toContain(
      'margin-bottom: 12pt',
    );
  });
  it('enables validated links only in presentation mode', () => {
    const e = createElement('text', createDeck().theme);
    e.text = 'Open source';
    e.paragraphs = [
      { runs: [{ text: e.text, hyperlink: 'https://github.com/ajayasai/opendeck-studio' }] },
    ];
    const view = render(<RichTextView element={e} />);
    expect(screen.queryByRole('link')).toBeNull();
    view.rerender(<RichTextView element={e} interactiveLinks />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://github.com/ajayasai/opendeck-studio',
    );
    expect(screen.getByRole('link').getAttribute('rel')).toContain('noopener');
    e.paragraphs[0].runs[0].hyperlink = 'javascript:alert(1)';
    view.rerender(<RichTextView element={e} interactiveLinks />);
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('continues numbering through nested levels and respects restarts and plain paragraphs', () => {
    const para = (level: number, start?: number): TextParagraph => ({
      runs: [{ text: 'Item' }],
      bullet: { kind: 'number', level, ...(start ? { start } : {}) },
    });
    expect(
      paragraphMarkers([
        para(0, 3),
        para(1),
        para(1),
        para(0),
        { runs: [{ text: 'Break' }] },
        para(0),
        para(0, 8),
      ]),
    ).toEqual(['3.', '1.', '2.', '4.', '', '1.', '8.']);
  });
});

describe('text frame rendering geometry', () => {
  it('keeps legacy text at zero insets, wrapped and clipped at the original box', () => {
    const element = createElement('text', createDeck().theme);
    element.width = 240;
    element.height = 120;
    const view = render(<RichTextView element={element} />);
    const frame = view.container.querySelector<HTMLElement>('.text-frame')!;
    const content = view.container.querySelector<HTMLElement>('.rich-text-content')!;
    const paragraph = view.container.querySelector<HTMLElement>('.paragraph-content')!;
    expect(frame.style.inset).toBe('0');
    expect([frame.style.overflowX, frame.style.overflowY]).toEqual(['clip', 'clip']);
    expect([
      content.style.left,
      content.style.top,
      content.style.width,
      content.style.height,
    ]).toEqual(['0px', '0px', '240px', '120px']);
    expect(paragraph.style.whiteSpace).toBe('pre-wrap');
    expect(element).not.toHaveProperty('textFrame');
  });

  it('positions signed asymmetric content inside a separate outer clipping boundary', () => {
    const element = createElement('text', createDeck().theme);
    element.width = 240;
    element.height = 120;
    element.verticalAlign = 'bottom';
    element.textFrame = {
      insets: { top: -12.5, right: 23.75, bottom: 8, left: -4 },
      wrap: 'square',
      horizontalOverflow: 'clip',
      verticalOverflow: 'clip',
    };
    const view = render(<RichTextView element={element} />);
    const frame = view.container.querySelector<HTMLElement>('.text-frame')!;
    const content = view.container.querySelector<HTMLElement>('.rich-text-content')!;
    expect(content.parentElement).toBe(frame);
    expect(frame.style.position).toBe('absolute');
    expect(frame.style.inset).toBe('0');
    expect([
      content.style.left,
      content.style.top,
      content.style.width,
      content.style.height,
    ]).toEqual(['-4px', '-12.5px', '220.25px', '124.5px']);
    expect(content.style.overflow).toBe('visible');
    expect(content.style.justifyContent).toBe('flex-end');
  });

  it.each([
    ['clip', 'overflow', 'clip', 'visible'],
    ['overflow', 'clip', 'visible', 'clip'],
    ['overflow', 'overflow', 'visible', 'visible'],
  ] as const)(
    'keeps %s horizontal and %s vertical overflow independent',
    (horizontalOverflow, verticalOverflow, expectedX, expectedY) => {
      const element = createElement('text', createDeck().theme);
      element.textFrame = {
        insets: { top: -20, right: -20, bottom: -20, left: -20 },
        wrap: 'none',
        horizontalOverflow,
        verticalOverflow,
      };
      const view = render(<RichTextView element={element} />);
      const frame = view.container.querySelector<HTMLElement>('.text-frame')!;
      expect(frame.style.overflowX).toBe(expectedX);
      expect(frame.style.overflowY).toBe(expectedY);
      // Using hidden on either axis would make CSS convert visible on the other to auto.
      expect(frame.style.overflowX).not.toBe('hidden');
      expect(frame.style.overflowY).not.toBe('hidden');
    },
  );

  it('disables soft wrapping while retaining both inline hard breaks and distinct paragraphs', () => {
    const element = createElement('text', createDeck().theme);
    element.text = 'First\nSecond\nThird';
    element.paragraphs = [{ runs: [{ text: 'First\nSecond' }] }, { runs: [{ text: 'Third' }] }];
    element.textFrame = {
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      wrap: 'none',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'overflow',
    };
    const view = render(<RichTextView element={element} />);
    const paragraphs = Array.from(
      view.container.querySelectorAll<HTMLElement>('.paragraph-content'),
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.map((item) => item.textContent)).toEqual(['First\nSecond', 'Third']);
    expect(
      paragraphs.every(
        (item) => item.style.whiteSpace === 'pre' && item.style.overflowWrap === 'normal',
      ),
    ).toBe(true);
  });

  it('renders a consumed content area with zero dimensions instead of negative CSS sizes', () => {
    const element = createElement('text', createDeck().theme);
    element.width = 100;
    element.height = 60;
    const frame: TextFrame = {
      insets: { top: 40, right: 80, bottom: 50, left: 70 },
      wrap: 'square',
      horizontalOverflow: 'clip',
      verticalOverflow: 'clip',
    };
    element.textFrame = frame;
    const view = render(<RichTextView element={element} />);
    const content = view.container.querySelector<HTMLElement>('.rich-text-content')!;
    expect([content.style.width, content.style.height]).toEqual(['0px', '0px']);
    expect([content.style.left, content.style.top]).toEqual(['70px', '40px']);
  });
});
