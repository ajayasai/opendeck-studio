import { describe, expect, it } from 'vitest';
import { createDeck, createElement, THEMES, validateDeck } from './model';
import {
  applyTextPatch,
  getParagraphs,
  plainText,
  replacePlainText,
  safeHyperlink,
  validateParagraphs,
  withParagraphs,
} from './richText';
import type { TextElement, TextParagraph } from './types';

const box = (): TextElement => createElement('text', THEMES[0]);
function example(): TextElement {
  return withParagraphs(box(), [
    {
      runs: [
        { text: 'Hello ', bold: true },
        { text: 'world', italic: true, hyperlink: 'https://example.com' },
      ],
      align: 'center',
      bullet: { kind: 'number', level: 1, start: 3 },
      lineSpacing: 1.4,
      spaceAfter: 12,
    },
    { runs: [{ text: 'Next', color: '#AA3311', bold: false }], align: 'right', spaceBefore: 8 },
  ]);
}

describe('rich text representation and compatibility', () => {
  it('projects runs and paragraphs exactly, including blank paragraphs and inline hard breaks', () => {
    const paragraphs: TextParagraph[] = [
      { runs: [{ text: 'Hello' }, { text: '\nworld' }] },
      { runs: [] },
      { runs: [{ text: 'Last' }] },
    ];
    expect(plainText(paragraphs)).toBe('Hello\nworld\n\nLast');
    expect(withParagraphs(box(), paragraphs).text).toBe('Hello\nworld\n\nLast');
  });

  it('reads legacy boxes without changing their representation and returns independent rich data', () => {
    const legacy = box();
    legacy.text = 'First\n\nThird';
    expect(getParagraphs(legacy)).toEqual([
      { runs: [{ text: 'First' }] },
      { runs: [{ text: '' }] },
      { runs: [{ text: 'Third' }] },
    ]);
    expect(legacy).not.toHaveProperty('paragraphs');
    const rich = example(),
      paragraphs = getParagraphs(rich);
    paragraphs[0].runs[0].text = 'Changed';
    paragraphs[0].bullet!.level = 4;
    expect(rich.paragraphs![0].runs[0].text).toBe('Hello ');
    expect(rich.paragraphs![0].bullet!.level).toBe(1);
  });

  it('round-trips rich native backups while legacy backups remain byte-for-byte structurally unchanged', () => {
    const legacy = createDeck();
    expect(JSON.stringify(validateDeck(legacy))).toBe(JSON.stringify(legacy));
    const rich = createDeck();
    rich.slides[0].elements.push(example());
    expect(validateDeck(JSON.parse(JSON.stringify(rich)))).toEqual(rich);
    const text = rich.slides[0].elements.at(-1) as TextElement;
    text.text = 'Incorrect projection';
    expect(() => validateDeck(rich)).toThrow('exactly match');
  });

  it('reconstructs supported fields and does not retain imported markup or unknown properties', () => {
    const result = validateParagraphs([
      {
        runs: [{ text: '<b>Literal text</b>', bold: true, html: '<script>' }],
        align: 'left',
        css: 'url(https://tracking.invalid)',
      },
    ]);
    expect(result).toEqual([
      { runs: [{ text: '<b>Literal text</b>', bold: true }], align: 'left' },
    ]);
  });

  it('rejects inconsistent plain/rich patches instead of silently choosing one', () => {
    expect(() =>
      applyTextPatch(box(), { text: 'one', paragraphs: [{ runs: [{ text: 'two' }] }] }),
    ).toThrow('exactly match');
    expect(
      applyTextPatch(box(), {
        text: 'two',
        paragraphs: [{ runs: [{ text: 'two', italic: true }] }],
      }).text,
    ).toBe('two');
  });
});

describe('safe links', () => {
  it.each([
    'https://example.com/slides?part=1#intro',
    'HTTP://example.com',
    'mailto:hello@example.com',
    'mailto:hello@example.com?subject=Hello%20world',
    'https://example.com/%E2%9C%93',
  ])('accepts an explicit supported URL %s', (url) => expect(safeHyperlink(url)).toBe(true));
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///private.txt',
    'ftp://example.com',
    '//example.com',
    '/slides',
    'https:example.com',
    'https://user:secret@example.com',
    'https://user%3Asecret@example.com',
    'https://@example.com',
    'https://example.com\\@other.com',
    ' https://example.com',
    'https://example.com\n',
    'https://example.com/%0aheader',
    'mailto:hello@example.com?subject=Hi%0D%0ABcc:other@example.com',
    'mailto:',
    'https://',
    'https://example.com/%XX',
  ])('rejects unsafe or ambiguous link %s', (url) => expect(safeHyperlink(url)).toBe(false));
  it('rejects unsafe links in native files', () => {
    expect(() =>
      validateParagraphs([{ runs: [{ text: 'Click', hyperlink: 'javascript:alert(1)' }] }]),
    ).toThrow('Invalid hyperlink');
  });
});

describe('rich validation limits', () => {
  it.each([
    [{ runs: [{ text: 'x', fontSize: 0 }] }],
    [{ runs: [{ text: 'x', fontSize: Infinity }] }],
    [{ runs: [{ text: 'x', color: 'red' }] }],
    [{ runs: [{ text: 'x', bold: 'yes' }] }],
    [{ runs: [{ text: 'x' }], lineSpacing: 0.49 }],
    [{ runs: [{ text: 'x' }], lineSpacing: 10.01 }],
    [{ runs: [{ text: 'x' }], spaceBefore: -1 }],
    [{ runs: [{ text: 'x' }], spaceAfter: 1001 }],
    [{ runs: [{ text: 'x' }], bullet: { kind: 'number', level: 9 } }],
    [{ runs: [{ text: 'x' }], bullet: { kind: 'number', level: 1.5 } }],
    [{ runs: [{ text: 'x' }], bullet: { kind: 'number', level: 0, start: 0 } }],
    [{ runs: [{ text: 'x' }], bullet: { kind: 'bullet', level: 0, character: '123456789' } }],
    [{ runs: [{ text: 'x' }], bullet: { kind: 'bullet', level: 0, character: '\n' } }],
  ])('rejects invalid formatting %j', (paragraph) =>
    expect(() => validateParagraphs([paragraph])).toThrow(),
  );

  it('enforces cumulative character, paragraph, and run limits', () => {
    expect(() =>
      validateParagraphs([{ runs: [{ text: 'a'.repeat(50000) }, { text: 'b'.repeat(50001) }] }]),
    ).toThrow('100,000');
    expect(() =>
      validateParagraphs([{ runs: [{ text: 'a'.repeat(100000) }] }, { runs: [] }]),
    ).toThrow('100,000');
    expect(() => validateParagraphs(Array.from({ length: 5001 }, () => ({ runs: [] })))).toThrow(
      '5,000',
    );
    expect(() =>
      validateParagraphs([{ runs: Array.from({ length: 10001 }, () => ({ text: '' })) }]),
    ).toThrow('10,000');
    expect(() => replacePlainText(box(), 'a'.repeat(100001))).toThrow('100,000');
    expect(
      validateParagraphs([{ runs: [{ text: 'a'.repeat(100000) }] }])[0].runs[0].text.length,
    ).toBe(100000);
  });
});

describe('plain text edits preserve rich content', () => {
  it('keeps legacy edits legacy and avoids generating a command when text is unchanged', () => {
    const legacy = box();
    expect(replacePlainText(legacy, legacy.text)).toBe(legacy);
    expect(replacePlainText(legacy, 'New\ntext')).not.toHaveProperty('paragraphs');
    expect(replacePlainText(example(), example().text).text).toBe('Hello world\nNext');
  });

  it('inherits an insertion from its left neighbor and retains unaffected styled suffixes', () => {
    const source = example(),
      edited = replacePlainText(source, 'Hello brave world\nNext');
    expect(edited.paragraphs![0].runs).toEqual([
      { text: 'Hello brave ', bold: true },
      { text: 'world', italic: true, hyperlink: 'https://example.com' },
    ]);
    expect(edited.paragraphs![1]).toEqual(source.paragraphs![1]);
    expect(source.text).toBe('Hello world\nNext');
  });

  it('uses the replaced text style and keeps paragraph metadata', () => {
    const source = example(),
      edited = replacePlainText(source, 'Hello planet\nNext');
    expect(edited.paragraphs![0].runs[1]).toEqual({
      text: 'planet',
      italic: true,
      hyperlink: 'https://example.com',
    });
    expect(edited.paragraphs![0].bullet).toEqual({ kind: 'number', level: 1, start: 3 });
    expect(edited.paragraphs![0].lineSpacing).toBe(1.4);
    expect(edited.paragraphs![1].spaceBefore).toBe(8);
  });

  it('splits a paragraph while preserving content styles and continuing an existing list', () => {
    const edited = replacePlainText(example(), 'Hello\nworld\nNext');
    expect(edited.paragraphs).toHaveLength(3);
    expect(edited.paragraphs![0].bullet).toEqual({ kind: 'number', level: 1, start: 3 });
    expect(edited.paragraphs![1].bullet).toEqual({ kind: 'number', level: 1 });
    expect(edited.paragraphs![1].align).toBe('center');
    expect(edited.paragraphs![1].spaceAfter).toBe(12);
    expect(edited.paragraphs![1].runs).toEqual([
      { text: 'world', italic: true, hyperlink: 'https://example.com' },
    ]);
    expect(edited.paragraphs![2].align).toBe('right');
  });

  it('merges paragraphs without losing the remaining runs and uses the first paragraph metadata', () => {
    const edited = replacePlainText(example(), 'Hello worldNext');
    expect(edited.paragraphs).toHaveLength(1);
    expect(edited.paragraphs![0].align).toBe('center');
    expect(edited.paragraphs![0].runs.at(-1)).toEqual({
      text: 'Next',
      color: '#AA3311',
      bold: false,
    });
  });

  it('retains the surviving paragraph metadata when deleting preceding paragraphs', () => {
    const source = example(),
      edited = replacePlainText(source, 'Next');
    expect(edited.paragraphs).toEqual([source.paragraphs![1]]);
    const blankFirst = replacePlainText(source, '\nNext');
    expect(blankFirst.paragraphs![0].runs[0].text).toBe('');
    expect(blankFirst.paragraphs![0].bullet?.start).toBe(3);
    expect(blankFirst.paragraphs![1]).toEqual(source.paragraphs![1]);
  });

  it('preserves untouched inline hard breaks rather than converting them into paragraphs', () => {
    const source = withParagraphs(box(), [
      { runs: [{ text: 'One\nTwo', underline: true }], align: 'right' },
    ]);
    const edited = replacePlainText(source, 'One\nTwo!');
    expect(edited.paragraphs).toEqual([
      { runs: [{ text: 'One\nTwo!', underline: true }], align: 'right' },
    ]);
  });

  it('handles empty paragraphs and complete deletion with valid canonical output', () => {
    const source = withParagraphs(box(), [{ runs: [] }, { runs: [{ text: 'End', bold: false }] }]);
    const inserted = replacePlainText(source, 'Start\nEnd');
    expect(inserted.paragraphs![1]).toEqual(source.paragraphs![1]);
    const deleted = replacePlainText(source, '');
    expect(deleted.paragraphs).toEqual([{ runs: [{ text: '' }] }]);
    expect(deleted.text).toBe('');
  });

  it('does not split UTF-16 surrogate pairs when replacing emoji', () => {
    const source = withParagraphs(box(), [
      {
        runs: [
          { text: 'A', bold: true },
          { text: '😀', italic: true },
          { text: 'Z', underline: true },
        ],
      },
    ]);
    const edited = replacePlainText(source, 'A😁Z');
    expect(edited.paragraphs![0].runs).toEqual([
      { text: 'A', bold: true },
      { text: '😁', italic: true },
      { text: 'Z', underline: true },
    ]);
  });

  it('maintains canonical projection across insertions and deletions at every text boundary', () => {
    const source = example();
    for (let index = 0; index <= source.text.length; index++) {
      for (const addition of ['!', '\n', '\n\n', 'abc']) {
        const desired = source.text.slice(0, index) + addition + source.text.slice(index);
        const next = replacePlainText(source, desired);
        expect(plainText(next.paragraphs!)).toBe(desired);
        expect(validateParagraphs(next.paragraphs, next.text)).toEqual(next.paragraphs);
      }
      for (let end = index; end <= source.text.length; end++) {
        const desired = source.text.slice(0, index) + source.text.slice(end);
        expect(plainText(replacePlainText(source, desired).paragraphs!)).toBe(desired);
      }
    }
  });
});

describe('whole-box rich formatting', () => {
  it('overrides all mixed run marks and paragraph alignment when the whole box is formatted', () => {
    const source = example();
    const next = applyTextPatch(source, {
      bold: false,
      italic: true,
      underline: true,
      color: '#112233',
      fontFamily: 'Georgia',
      fontSize: 20,
      align: 'left',
    });
    for (const paragraph of next.paragraphs!) {
      expect(paragraph.align).toBe('left');
      for (const run of paragraph.runs)
        expect(run).toMatchObject({
          bold: false,
          italic: true,
          underline: true,
          color: '#112233',
          fontFamily: 'Georgia',
          fontSize: 20,
        });
    }
    expect(next.paragraphs![0].runs[1].hyperlink).toBe('https://example.com');
    expect(next.text).toBe(source.text);
    expect(source.paragraphs![0].runs[0].bold).toBe(true);
  });

  it('applies text and format together, and preserves paragraphs for unrelated geometry changes', () => {
    const source = example(),
      moved = applyTextPatch(source, { x: 300, rotation: 10 });
    expect(moved.paragraphs).toEqual(source.paragraphs);
    const changed = applyTextPatch(source, { text: 'Hello planet\nNext', bold: false });
    expect(changed.text).toBe('Hello planet\nNext');
    expect(changed.paragraphs![0].runs[1].italic).toBe(true);
    expect(changed.paragraphs!.every((p) => p.runs.every((r) => r.bold === false))).toBe(true);
  });
});
