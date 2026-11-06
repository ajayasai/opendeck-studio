import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, THEMES } from './model';
import { plainText, withParagraphs } from './richText';
import {
  createRichTextExtensions,
  fromTiptapDocument,
  sanitizeRichTextPaste,
  toTiptapDocument,
} from './richTextEditorAdapter';
import type { TextElement } from './types';
import { paragraphMarkers } from './RichTextView';

const editors: Editor[] = [];
const textBox = (): TextElement => ({
  ...createElement('text', THEMES[0]),
  text: 'Hello world',
  fontSize: 24,
  bold: false,
  italic: false,
  underline: false,
});
function actualEditor(element: TextElement) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: createRichTextExtensions(),
    content: toTiptapDocument(element),
  });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe('native rich text adapter', () => {
  it('retains exact point line spacing through actual editor serialization, including blanks and zero', () => {
    const element = withParagraphs(textBox(), [
      { runs: [{ text: 'Exact\nsoft break' }], lineSpacingPoints: 18.25, spaceAfter: 5 },
      { runs: [{ text: '' }], lineSpacingPoints: 0 },
      { runs: [{ text: 'Item' }], lineSpacingPoints: 22, bullet: { kind: 'number', level: 0 } },
      { runs: [{ text: 'Relative' }], lineSpacing: 1.5 },
    ]);
    const editor = actualEditor(element);
    const output = fromTiptapDocument(editor.getJSON(), element);
    expect(plainText(output)).toBe(element.text);
    expect(output.map((paragraph) => paragraph.lineSpacingPoints)).toEqual([
      18.25,
      0,
      22,
      undefined,
    ]);
    expect(output.map((paragraph) => paragraph.lineSpacing)).toEqual([
      undefined,
      undefined,
      undefined,
      1.5,
    ]);
    expect(editor.getHTML()).toContain('line-height: 18.25pt');
    expect(editor.getHTML()).toContain('line-height: 0pt');
    expect(editor.getHTML()).toContain('line-height: 1.5');
  });

  it('converts safe pasted point/pixel line heights without converting them into relative spacing', () => {
    const result = sanitizeRichTextPaste(
      '<p style="line-height:24px">Pixels</p><p style="line-height:19.5pt">Points</p>' +
        '<p style="line-height:0pt">Zero</p><p style="line-height:1.75">Relative</p>' +
        '<p style="line-height:1001pt">Too large</p><p style="line-height:calc(10px + 3px)">Unsupported</p>',
    );
    const editor = actualEditor(textBox());
    editor.commands.setContent(result.html);
    const output = fromTiptapDocument(editor.getJSON(), textBox());
    expect(output.map((paragraph) => paragraph.lineSpacingPoints)).toEqual([
      18,
      19.5,
      0,
      undefined,
      undefined,
      undefined,
    ]);
    expect(output.map((paragraph) => paragraph.lineSpacing)).toEqual([
      undefined,
      undefined,
      undefined,
      1.75,
      undefined,
      undefined,
    ]);
    expect(result.html).not.toMatch(/1001|calc\(/);
  });

  it('requires exact and relative spacing commands to clear the alternate representation', () => {
    const element = withParagraphs(textBox(), [
      { runs: [{ text: 'Exact' }], lineSpacingPoints: 20 },
    ]);
    const editor = actualEditor(element);
    editor.commands.updateAttributes('paragraph', { lineSpacing: 1.5 });
    expect(() => fromTiptapDocument(editor.getJSON(), element)).toThrow('either');
    editor.commands.updateAttributes('paragraph', { lineSpacingPoints: null });
    expect(fromTiptapDocument(editor.getJSON(), element)[0]).toMatchObject({ lineSpacing: 1.5 });
    expect(fromTiptapDocument(editor.getJSON(), element)[0]).not.toHaveProperty(
      'lineSpacingPoints',
    );
    editor.commands.updateAttributes('paragraph', { lineSpacing: null, lineSpacingPoints: 27.5 });
    expect(fromTiptapDocument(editor.getJSON(), element)[0]).toMatchObject({
      lineSpacingPoints: 27.5,
    });
    expect(fromTiptapDocument(editor.getJSON(), element)[0]).not.toHaveProperty('lineSpacing');
  });

  it('preserves hard breaks, blank paragraphs, paragraph spacing, and effective text styles', () => {
    const element = withParagraphs(textBox(), [
      {
        runs: [{ text: 'One\ninside', bold: true, color: '#112233', fontSize: 18 }],
        align: 'right',
        lineSpacing: 1.5,
        spaceBefore: 3,
        spaceAfter: 8,
      },
      { runs: [{ text: '' }], spaceAfter: 7 },
      {
        runs: [
          {
            text: 'Next',
            italic: true,
            fontFamily: 'Georgia',
            hyperlink: 'https://example.com/docs',
          },
        ],
      },
    ]);
    const editor = actualEditor(element);
    const output = fromTiptapDocument(editor.getJSON(), element);
    expect(plainText(output)).toBe('One\ninside\n\nNext');
    expect(output[0]).toMatchObject({
      align: 'right',
      lineSpacing: 1.5,
      spaceBefore: 3,
      spaceAfter: 8,
    });
    expect(output[0].runs[0]).toMatchObject({
      text: 'One\ninside',
      bold: true,
      color: '#112233',
      fontSize: 18,
    });
    expect(output[1].runs).toEqual([{ text: '' }]);
    expect(output[1].spaceAfter).toBe(7);
    expect(output[2].runs[0]).toMatchObject({
      italic: true,
      fontFamily: 'Georgia',
      hyperlink: 'https://example.com/docs',
    });
  });

  it('preserves explicit false overrides even when the text box base is bold, italic, and underlined', () => {
    const element = withParagraphs({ ...textBox(), bold: true, italic: true, underline: true }, [
      {
        runs: [
          { text: 'Plain', bold: false, italic: false, underline: false },
          { text: ' inherited' },
        ],
      },
    ]);
    const editor = actualEditor(element);
    const runs = fromTiptapDocument(editor.getJSON(), element)[0].runs;
    expect(runs[0]).toMatchObject({ text: 'Plain', bold: false, italic: false, underline: false });
    expect(runs[1]).toMatchObject({
      text: ' inherited',
      bold: true,
      italic: true,
      underline: true,
    });
  });

  it('preserves list levels including skipped levels, number starts, and custom bullet characters', () => {
    const element = withParagraphs(textBox(), [
      { runs: [{ text: 'Seven' }], bullet: { kind: 'number', level: 2, start: 7 } },
      { runs: [{ text: 'Nested' }], bullet: { kind: 'bullet', level: 4, character: '→' } },
      { runs: [{ text: 'Eight' }], bullet: { kind: 'number', level: 2 } },
      { runs: [{ text: 'Reset' }], bullet: { kind: 'number', level: 0, start: 3 } },
      { runs: [{ text: 'Outside' }] },
    ]);
    const editor = actualEditor(element);
    const output = fromTiptapDocument(editor.getJSON(), element);
    expect(output.map((p) => p.bullet)).toEqual(element.paragraphs!.map((p) => p.bullet));
    expect(plainText(output)).toBe(element.text);
  });

  it('does not restart numbering when optional glyph metadata changes on a numbered paragraph', () => {
    const element = withParagraphs(textBox(), [
      { runs: [{ text: 'Three' }], bullet: { kind: 'number', level: 0, start: 3 } },
      { runs: [{ text: 'Four' }], bullet: { kind: 'number', level: 0, character: '*' } },
      { runs: [{ text: 'Five' }], bullet: { kind: 'number', level: 0 } },
    ]);
    const editor = actualEditor(element);
    const output = fromTiptapDocument(editor.getJSON(), element);
    expect(plainText(output)).toBe(element.text);
    expect(paragraphMarkers(output)).toEqual(['3.', '4.', '5.']);
  });

  it('rejects unknown nodes and marks rather than silently dropping document content', () => {
    const element = textBox();
    expect(() =>
      fromTiptapDocument(
        { type: 'doc', content: [{ type: 'image', attrs: { src: 'image.png' } }] },
        element,
      ),
    ).toThrow('Unsupported rich text block');
    expect(() =>
      fromTiptapDocument(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Code', marks: [{ type: 'code' }] }],
            },
          ],
        },
        element,
      ),
    ).toThrow('Unsupported text formatting');
    expect(() =>
      fromTiptapDocument(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Link',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
        element,
      ),
    ).toThrow('valid http');
  });

  it('sanitizes rich paste, strips executable objects and unsafe links, and converts supported CSS units', () => {
    const source =
      '<h1 onclick="alert(1)">Heading</h1><p><span style="font-size:16px;color:rgb(255, 0, 0)" onmouseover="bad()">Red</span><a href="javascript:alert(1)">Unsafe</a><a href="https://example.com" target="_blank">Safe</a><img src="https://example.com/tracker" onerror="bad()"><script>bad()</script></p>';
    const result = sanitizeRichTextPaste(source);
    expect(result.changed).toBe(true);
    expect(result.html).not.toMatch(/<h1|<script|<img|onclick|onmouseover|javascript:|target=/);
    const editor = actualEditor(textBox());
    editor.commands.setContent(result.html);
    const paragraphs = fromTiptapDocument(editor.getJSON(), textBox());
    expect(plainText(paragraphs)).toBe('Heading\nRedUnsafeSafe');
    expect(paragraphs[1].runs[0]).toMatchObject({ text: 'Red', color: '#ff0000', fontSize: 12 });
    expect(paragraphs[1].runs.find((run) => run.text === 'Safe')?.hyperlink).toBe(
      'https://example.com',
    );
    expect(paragraphs[1].runs.find((run) => run.text === 'Unsafe')?.hyperlink).toBeUndefined();
  });

  it('parses pasted resource-bearing HTML only in an inert template before allowlist reconstruction', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => {
      throw new Error('Untrusted HTML must not use a resource-loading document parser.');
    });
    const create = vi.spyOn(document, 'createElement');
    const bodyBefore = document.body.innerHTML;
    try {
      const result = sanitizeRichTextPaste(
        '<p><strong style="color:#123456;background-image:url(https://example.com/background)">Keep styled text</strong>' +
          '<img src="https://example.com/image" srcset="https://example.com/image2 2x">' +
          '<iframe src="https://example.com/frame"></iframe>' +
          '<script src="https://example.com/script">window.pasteExecuted=true</script>' +
          '<style>@import url(https://example.com/style);</style></p>',
      );
      expect(parse).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith('template');
      const template = create.mock.results.find(
        (entry) => entry.type === 'return' && entry.value instanceof HTMLTemplateElement,
      )?.value as HTMLTemplateElement;
      expect(template.isConnected).toBe(false);
      expect(template.content.ownerDocument).not.toBe(document);
      expect(template.content.querySelector('img')).not.toBeNull();
      expect(document.body.innerHTML).toBe(bodyBefore);
      expect(result.changed).toBe(true);
      expect(result.html).toContain('<strong');
      expect(result.html).toContain('Keep styled text');
      expect(result.html).toContain('color: rgb(18, 52, 86)');
      expect(result.html).not.toMatch(
        /img|iframe|script|style>|src=|srcset|background|url\(|https:\/\/|pasteExecuted/,
      );
    } finally {
      create.mockRestore();
      parse.mockRestore();
    }
  });
});

describe('actual Tiptap selected-range editing', () => {
  it('applies marks and font styles to only the selected words, including false after removing inherited bold', () => {
    const element = { ...textBox(), bold: true };
    const editor = actualEditor(element);
    editor
      .chain()
      .setTextSelection({ from: 1, to: 6 })
      .unsetBold()
      .setFontSize('18pt')
      .setColor('#ff0000')
      .run();
    editor
      .chain()
      .setTextSelection({ from: 7, to: 12 })
      .setItalic()
      .setUnderline()
      .setLink({ href: 'https://example.com' })
      .run();
    const runs = fromTiptapDocument(editor.getJSON(), element)[0].runs;
    expect(runs.find((run) => run.text === 'Hello')).toMatchObject({
      bold: false,
      italic: false,
      fontSize: 18,
      color: '#ff0000',
    });
    expect(runs.find((run) => run.text === 'world')).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      hyperlink: 'https://example.com',
    });
    expect(plainText(fromTiptapDocument(editor.getJSON(), element))).toBe('Hello world');
    editor.commands.undo();
    expect(fromTiptapDocument(editor.getJSON(), element)[0].runs.some((run) => run.hyperlink)).toBe(
      false,
    );
  });

  it('supports list commands, nested items, numbering, and paragraph spacing', () => {
    const element = { ...textBox(), text: 'One\nTwo' };
    const editor = actualEditor(element);
    editor
      .chain()
      .selectAll()
      .toggleOrderedList()
      .updateAttributes('orderedList', { start: 4 })
      .run();
    let secondPosition = 0;
    editor.state.doc.descendants((node, position) => {
      if (node.isText && node.text === 'Two') secondPosition = position;
    });
    editor
      .chain()
      .setTextSelection(secondPosition + 1)
      .sinkListItem('listItem')
      .updateAttributes('paragraph', { lineSpacing: 2, spaceAfter: 12 })
      .run();
    const paragraphs = fromTiptapDocument(editor.getJSON(), element);
    expect(paragraphs[0].bullet).toMatchObject({ kind: 'number', level: 0, start: 4 });
    expect(paragraphs[1]).toMatchObject({
      bullet: { kind: 'number', level: 1 },
      lineSpacing: 2,
      spaceAfter: 12,
    });
  });

  it('refuses unsafe hyperlink commands and excludes unsupported editor nodes', () => {
    const editor = actualEditor(textBox());
    editor.commands.selectAll();
    expect(editor.commands.setLink({ href: 'javascript:alert(1)' })).toBe(false);
    expect(editor.commands.setLink({ href: 'file:///private.txt' })).toBe(false);
    expect(editor.commands.setLink({ href: 'mailto:hello@example.com' })).toBe(true);
    for (const name of ['heading', 'blockquote', 'codeBlock', 'horizontalRule', 'image'])
      expect(editor.schema.nodes[name]).toBeUndefined();
    for (const name of ['code', 'strike']) expect(editor.schema.marks[name]).toBeUndefined();
  });
});
