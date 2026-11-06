import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createDeck, createElement } from './model';
import RichTextView, { paragraphMarkers } from './RichTextView';
import type { TextParagraph } from './types';

afterEach(cleanup);
describe('rich slide rendering', () => {
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
