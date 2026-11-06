import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportPptx, importPptx, pptxExportWarnings } from './pptx';
import type { Deck, ElementBase, Theme, TextElement } from './types';
import { plainText } from './richText';
import { validateDeck } from './model';
import { resolveTextFrame } from './textFrame';
import { readFile } from 'node:fs/promises';

const theme: Theme = {
  id: 'test',
  name: 'Test',
  background: '#ffffff',
  foreground: '#172e29',
  accent: '#174f43',
  muted: '#667766',
  fontFamily: 'Arial',
};
const base: ElementBase = {
  id: 'e',
  name: 'Object',
  x: 96,
  y: 48,
  width: 384,
  height: 120,
  rotation: 0,
  opacity: 1,
  locked: false,
  animation: 'none',
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const sample = (): Deck => ({
  schemaVersion: 1,
  id: 'deck',
  title: 'Editable & original',
  width: 1280,
  height: 720,
  theme,
  updatedAt: new Date().toISOString(),
  slides: [
    {
      id: 's1',
      name: 'Opening',
      background: '#f6f3eb',
      notes: 'Speaker notes\nSecond line.',
      transition: 'fade',
      hidden: false,
      elements: [
        {
          ...base,
          id: 'text',
          name: 'Headline',
          type: 'text',
          text: 'Hello <world> & friends\nNext line',
          fontSize: 32,
          fontFamily: 'Arial',
          color: '#174f43',
          bold: true,
          italic: true,
          underline: true,
          align: 'center',
          verticalAlign: 'top',
          opacity: 0.65,
        },
        {
          ...base,
          id: 'shape',
          name: 'Accent',
          type: 'shape',
          x: 500,
          y: 80,
          width: 80,
          height: 80,
          rotation: 20,
          shape: 'ellipse',
          fill: '#aabbcc',
          stroke: '#334455',
          strokeWidth: 2,
          opacity: 0.8,
        },
        {
          ...base,
          id: 'img',
          name: 'Pixel',
          type: 'image',
          x: 600,
          src: png,
          alt: 'A tiny image',
          fit: 'contain',
          opacity: 0.4,
        },
        {
          ...base,
          id: 'table',
          type: 'table',
          name: 'Budget',
          y: 300,
          rows: [
            ['Item', 'Value'],
            ['A', '10'],
          ],
          header: true,
          fontSize: 16,
          color: '#172e29',
          fill: '#ffffff',
        },
        {
          ...base,
          id: 'chart',
          type: 'chart',
          name: 'Results',
          x: 700,
          y: 300,
          chartType: 'bar',
          labels: ['Alpha', 'Beta'],
          values: [12, 31],
          color: '#174f43',
        },
      ],
    },
    {
      id: 's2',
      name: 'Closing',
      background: '#ffffff',
      elements: [],
      notes: '',
      transition: 'slide',
      hidden: true,
    },
  ],
});

async function buffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}
const ns =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relationship = (id: string, type: string, target: string, external = false) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
const rels = (...entries: string[]) =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.join('')}</Relationships>`;
const textShape = (text: string, shapeId = '2', extra = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${shapeId}" name="Text ${shapeId}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="3657600" cy="914400"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="r"/><a:r><a:rPr sz="2800"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill>${extra}</a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const slide = (content: string) =>
  `<p:sld ${ns}><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`;
const placeholderText = (ph: string, bodyPr: string, properties = '<p:spPr/>') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Frame"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr>${properties}<p:txBody>${bodyPr}<a:p><a:r><a:t>Frame text</a:t></a:r></a:p></p:txBody></p:sp>`;
async function fixture(modify?: (zip: JSZip) => void): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('_rels/.rels', rels(relationship('r1', 'officeDocument', 'ppt/presentation.xml')));
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation ${ns}><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    rels(
      relationship('first', 'slide', 'slides/slide1.xml'),
      relationship('second', 'slide', 'slides/slide12.xml'),
    ),
  );
  zip.file('ppt/slides/slide1.xml', slide(textShape('Later')));
  zip.file('ppt/slides/slide12.xml', slide(textShape('First')));
  zip.file(
    'ppt/slides/_rels/slide12.xml.rels',
    rels(relationship('layout', 'slideLayout', '../slideLayouts/slideLayout1.xml')),
  );
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<p:sldLayout ${ns}><p:cSld><p:spTree/></p:cSld></p:sldLayout>`,
  );
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    rels(relationship('master', 'slideMaster', '../slideMasters/slideMaster1.xml')),
  );
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<p:sldMaster ${ns}><p:cSld><p:spTree/></p:cSld></p:sldMaster>`,
  );
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels(relationship('theme', 'theme', '../theme/theme1.xml')),
  );
  zip.file(
    'ppt/theme/theme1.xml',
    `<a:theme ${ns}><a:themeElements><a:clrScheme name="Test"><a:accent1><a:srgbClr val="9A4B13"/></a:accent1></a:clrScheme><a:fontScheme name="Test"><a:minorFont><a:latin typeface="Georgia"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
  );
  modify?.(zip);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

describe('editable PPTX interoperability', () => {
  it('imports an original fixture authored by installed Microsoft PowerPoint through its object model', async () => {
    const source = await readFile('tests/fixtures/powerpoint-original.pptx');
    const result = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    expect(result.deck.slides).toHaveLength(2);
    expect(result.deck.width).toBeCloseTo(1280);
    expect(result.deck.height).toBeCloseTo(720);
    const firstText = result.deck.slides[0].elements.filter((e) => e.type === 'text');
    expect(firstText.some((e) => e.text === 'First in presentation order')).toBe(true);
    expect(
      firstText.some((e) => e.text === 'Placeholder geometry inherited from the layout.'),
    ).toBe(true);
    const second = result.deck.slides[1];
    expect(second.elements.find((e) => e.type === 'text')).toMatchObject({
      text: 'Original PowerPoint fixture\nAn editable interoperability sample',
      fontSize: 28,
      bold: true,
    });
    expect(second.elements.find((e) => e.type === 'shape')).toMatchObject({
      shape: 'ellipse',
      x: 800,
      width: 160,
      height: 160,
    });
    expect(second.elements.find((e) => e.type === 'table')).toMatchObject({
      rows: [
        ['Item', 'Value'],
        ['Alpha', '12'],
        ['Beta', '31'],
      ],
    });
    expect(second.notes).toBe(
      'Original speaker notes authored through the PowerPoint object model.',
    );
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it('exports native objects and round-trips geometry, text, notes, theme values, charts, and images', async () => {
    const deck = sample();
    const bytes = await buffer(await exportPptx(deck));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('<p:sp>');
    expect(xml).toContain('<p:pic>');
    expect(xml).toContain('<a:tbl>');
    expect(xml).toContain('c:chart');
    expect(zip.file('ppt/charts/chart1.xml')).not.toBeNull();
    const result = await importPptx(bytes);
    expect(() => validateDeck(result.deck)).not.toThrow();
    expect(result.deck.title).toBe(deck.title);
    expect(result.deck.width).toBeCloseTo(1280);
    expect(result.deck.height).toBeCloseTo(720);
    expect(result.deck.slides).toHaveLength(2);
    expect(result.deck.slides[1].hidden).toBe(true);
    expect(result.deck.slides[0].name).toBe('Opening');
    expect(result.deck.slides[0].background.toLowerCase()).toBe('#f6f3eb');
    expect(result.deck.slides[0].notes).toBe('Speaker notes\nSecond line.');
    expect(result.deck.slides[0].transition).toBe('fade');
    expect(result.deck.slides[1].transition).toBe('slide');
    const objects = result.deck.slides[0].elements;
    const text = objects.find((e) => e.type === 'text');
    expect(text).toMatchObject({
      text: 'Hello <world> & friends\nNext line',
      x: 96,
      y: 48,
      width: 384,
      height: 120,
      fontSize: 32,
      bold: true,
      italic: true,
      underline: true,
      align: 'center',
    });
    expect(text?.opacity).toBeCloseTo(0.65);
    expect(objects.find((e) => e.type === 'shape')).toMatchObject({
      shape: 'ellipse',
      x: 500,
      y: 80,
      rotation: 20,
      fill: '#aabbcc',
      strokeWidth: 2,
      opacity: 0.8,
    });
    expect(objects.find((e) => e.type === 'image')).toMatchObject({
      src: png,
      alt: 'A tiny image',
      opacity: 0.4,
    });
    expect(objects.find((e) => e.type === 'table')).toMatchObject({
      rows: [
        ['Item', 'Value'],
        ['A', '10'],
      ],
      header: true,
      fill: '#ffffff',
      color: '#172e29',
    });
    expect(objects.find((e) => e.type === 'chart')).toMatchObject({
      chartType: 'bar',
      labels: ['Alpha', 'Beta'],
      values: [12, 31],
    });
  });

  it('follows presentation relationship order rather than slide filenames, and resolves theme colors', async () => {
    const result = await importPptx(await fixture());
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      text: 'First',
      color: '#9a4b13',
      fontFamily: 'Georgia',
      x: 96,
      y: 48,
      width: 384,
      height: 96,
      align: 'right',
    });
    expect(result.deck.slides[1].elements[0]).toMatchObject({ text: 'Later' });
  });

  it('preserves object stacking order across different drawing types', async () => {
    const shape =
      '<p:sp><p:nvSpPr><p:cNvPr id="3" name="middle"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:spPr></p:sp>';
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(textShape('Under') + shape + textShape('Over', '4')),
        ),
      ),
    );
    expect(result.deck.slides[0].elements.map((e) => e.type)).toEqual(['text', 'shape', 'text']);
  });

  it('resolves placeholder bounds from the slide layout', async () => {
    const ph =
      '<p:nvSpPr><p:cNvPr id="2" name="Placeholder"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="title" idx="1"/></p:nvPr></p:nvSpPr>';
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            `<p:sp>${ph}<p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Inherited</a:t></a:r></a:p></p:txBody></p:sp>`,
          ),
        );
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree><p:sp>${ph}<p:spPr><a:xfrm><a:off x="190500" y="285750"/><a:ext cx="952500" cy="476250"/></a:xfrm></p:spPr></p:sp></p:spTree></p:cSld></p:sldLayout>`,
        );
      }),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      text: 'Inherited',
      x: 20,
      y: 30,
      width: 100,
      height: 50,
    });
  });

  it('uses OOXML text-frame defaults when no attribute is specified', async () => {
    const result = await importPptx(await fixture());
    const text = result.deck.slides[0].elements[0] as TextElement;
    expect(text.textFrame).toEqual({
      insets: { top: 4.8, right: 9.6, bottom: 4.8, left: 9.6 },
      wrap: 'square',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'overflow',
    });
    expect(text.verticalAlign).toBe('top');
    expect(result.warnings.join(' ')).not.toMatch(/margins are not retained|autofit|fit-text/i);
    expect(result.warnings.join(' ')).not.toContain('omit whole lines');
  });

  it('exports legacy zero insets and clipping explicitly without enabling autofit', async () => {
    const deck = sample();
    deck.slides[0].elements = [deck.slides[0].elements[0]];
    expect(pptxExportWarnings(deck).join(' ')).toContain('omit whole lines');
    const bytes = await buffer(await exportPptx(deck));
    const zip = await JSZip.loadAsync(bytes);
    const xml = new DOMParser().parseFromString(
      await zip.file('ppt/slides/slide1.xml')!.async('string'),
      'application/xml',
    );
    const body = xml.getElementsByTagNameNS('*', 'bodyPr')[0];
    for (const attribute of ['lIns', 'rIns', 'tIns', 'bIns'])
      expect(body.getAttribute(attribute)).toBe('0');
    expect(body.getAttribute('wrap')).toBe('square');
    expect(body.getAttribute('horzOverflow')).toBe('clip');
    expect(body.getAttribute('vertOverflow')).toBe('clip');
    expect(body.getElementsByTagNameNS('*', 'noAutofit')).toHaveLength(1);
    expect(body.getElementsByTagNameNS('*', 'normAutofit')).toHaveLength(0);
    const reimported = await importPptx(bytes);
    expect(reimported.warnings.join(' ')).not.toContain('Text-box fill or border');
    const again = reimported.deck.slides[0].elements[0] as TextElement;
    expect(again.textFrame).toEqual(resolveTextFrame(deck.slides[0].elements[0] as TextElement));
  });

  it.each(['t', 'ctr', 'b'] as const)(
    'preserves signed and zero insets, no-wrap and independent overflow with anchor %s',
    async (anchor) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              textShape('Frame').replace(
                '<a:bodyPr/>',
                `<a:bodyPr lIns="0" rIns="152400" tIns="-38100" bIns="0" wrap="none" horzOverflow="overflow" vertOverflow="clip" anchor="${anchor}"><a:noAutofit/></a:bodyPr>`,
              ),
            ),
          );
        }),
      );
      const text = result.deck.slides[0].elements[0] as TextElement;
      expect(result.warnings.join(' ')).toContain('omit whole lines');
      expect(text.textFrame).toEqual({
        insets: { top: -4, right: 16, bottom: 0, left: 0 },
        wrap: 'none',
        horizontalOverflow: 'overflow',
        verticalOverflow: 'clip',
      });
      expect(text.verticalAlign).toBe(
        anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
      );
      const bytes = await buffer(await exportPptx(result.deck));
      const zip = await JSZip.loadAsync(bytes);
      const xml = new DOMParser().parseFromString(
        await zip.file('ppt/slides/slide1.xml')!.async('string'),
        'application/xml',
      );
      const body = xml.getElementsByTagNameNS('*', 'bodyPr')[0];
      expect(
        Object.fromEntries(
          ['lIns', 'rIns', 'tIns', 'bIns', 'wrap', 'horzOverflow', 'vertOverflow', 'anchor'].map(
            (key) => [key, body.getAttribute(key)],
          ),
        ),
      ).toEqual({
        lIns: '0',
        rIns: '152400',
        tIns: '-38100',
        bIns: '0',
        wrap: 'none',
        horzOverflow: 'overflow',
        vertOverflow: 'clip',
        anchor,
      });
      const again = (await importPptx(bytes)).deck.slides[0].elements[0] as TextElement;
      expect(again.textFrame).toEqual(text.textFrame);
      expect(again.paragraphs).toEqual(text.paragraphs);
    },
  );

  it('resolves each body attribute separately through layout and master while explicit zero and noAutofit override inheritance', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            placeholderText(
              'idx="2"',
              '<a:bodyPr lIns="0" rIns="0" horzOverflow="overflow"><a:noAutofit/></a:bodyPr>',
            ),
          ),
        );
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="2"', '<a:bodyPr tIns="190500" wrap="none" anchor="ctr"/>')}</p:spTree></p:cSld></p:sldLayout>`,
        );
        const wrong = placeholderText('idx="2" type="title"', '<a:bodyPr bIns="9525" anchor="t"/>');
        const body = placeholderText(
          'idx="1" type="body"',
          '<a:bodyPr lIns="381000" rIns="190500" tIns="95250" bIns="285750" horzOverflow="clip" vertOverflow="clip" anchor="b"><a:normAutofit fontScale="75000"/></a:bodyPr>',
          '<p:spPr><a:xfrm><a:off x="285750" y="381000"/><a:ext cx="3810000" cy="1905000"/></a:xfrm></p:spPr>',
        );
        zip.file(
          'ppt/slideMasters/slideMaster1.xml',
          `<p:sldMaster ${ns}><p:cSld><p:spTree>${wrong}${body}</p:spTree></p:cSld><p:txStyles><p:bodyStyle><a:lvl1pPr><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1200" b="0"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
        );
      }),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      x: 30,
      y: 40,
      width: 400,
      height: 200,
      verticalAlign: 'middle',
      fontSize: 32,
      bold: true,
      textFrame: {
        insets: { top: 20, right: 0, bottom: 30, left: 0 },
        wrap: 'none',
        horizontalOverflow: 'overflow',
        verticalOverflow: 'clip',
      },
    });
    expect(result.warnings.join(' ')).not.toMatch(/autofit|fit-text/i);
  });

  it('does not inherit body settings from a wrong-index layout placeholder or decorative shape', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file('ppt/slides/slide12.xml', slide(placeholderText('idx="9"', '<a:bodyPr/>')));
        const decorative = textShape('Decoration').replace(
          '<a:bodyPr/>',
          '<a:bodyPr tIns="952500" wrap="none"/>',
        );
        const wrong = placeholderText('idx="8"', '<a:bodyPr bIns="952500" anchor="b"/>');
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${decorative}${wrong}</p:spTree></p:cSld></p:sldLayout>`,
        );
        zip.file(
          'ppt/slideMasters/slideMaster1.xml',
          `<p:sldMaster ${ns}><p:cSld><p:spTree>${placeholderText('type="body"', '<a:bodyPr lIns="952500"/>')}</p:spTree></p:cSld></p:sldMaster>`,
        );
      }),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      verticalAlign: 'top',
      textFrame: {
        insets: { top: 4.8, right: 9.6, bottom: 4.8, left: 9.6 },
        wrap: 'square',
        horizontalOverflow: 'overflow',
        verticalOverflow: 'overflow',
      },
    });
  });

  it.each([
    ['<a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill>', true],
    ['<a:ln w="12700"><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill></a:ln>', true],
    ['<a:ln><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill></a:ln>', true],
    ['<a:noFill/><a:ln/>', false],
    ['<a:noFill/><a:ln><a:noFill/></a:ln>', false],
    [
      '<a:solidFill><a:srgbClr val="AABBCC"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln w="0"/>',
      false,
    ],
  ])(
    'warns only for visible explicit text-box fill or border loss: %s',
    async (decoration, warning) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(textShape('Decorated text').replace('</p:spPr>', `${decoration}</p:spPr>`)),
          );
        }),
      );
      expect(result.deck.slides[0].elements).toHaveLength(1);
      expect(result.deck.slides[0].elements[0]).toMatchObject({
        type: 'text',
        text: 'Decorated text',
      });
      expect(result.warnings.some((message) => message.includes('Text-box fill or border'))).toBe(
        warning,
      );
    },
  );

  it.each([
    ['<a:normAutofit/>', 'Shrink-text-to-fit behavior'],
    [
      '<a:normAutofit fontScale="80000" lnSpcReduction="10000"/>',
      'autofit font scaling and line-spacing reductions',
    ],
    [
      '<a:normAutofit fontScale="80.000%" lnSpcReduction="10.000%"/>',
      'autofit font scaling and line-spacing reductions',
    ],
    ['<a:spAutoFit/>', 'Resize-shape-to-fit-text behavior'],
  ])('warns for inherited unsupported autofit choice %s', async (fit, warning) => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file('ppt/slides/slide12.xml', slide(placeholderText('idx="3"', '<a:bodyPr/>')));
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="3" type="body"', `<a:bodyPr>${fit}</a:bodyPr>`)}</p:spTree></p:cSld></p:sldLayout>`,
        );
      }),
    );
    expect(result.warnings.join(' ')).toContain(warning);
  });

  it('warns for effective inherited columns, ellipsis, vertical text and anchoring while local supported overrides suppress those warnings', async () => {
    const make = (local: string) =>
      fixture((zip) => {
        zip.file('ppt/slides/slide12.xml', slide(placeholderText('idx="3"', local)));
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="3" type="body"', '<a:bodyPr numCol="2" vert="vert" rot="60000" vertOverflow="ellipsis" anchor="dist" anchorCtr="1"/>')}</p:spTree></p:cSld></p:sldLayout>`,
        );
      });
    const inherited = await importPptx(await make('<a:bodyPr/>'));
    expect(inherited.deck.slides[0].elements[0]).toMatchObject({
      verticalAlign: 'top',
      textFrame: { verticalOverflow: 'clip' },
    });
    expect(inherited.warnings.join(' ')).toMatch(/ellipsis/);
    expect(inherited.warnings.join(' ')).toMatch(/Multi-column/);
    expect(inherited.warnings.join(' ')).toMatch(/Vertical and rotated/);
    expect(inherited.warnings.join(' ')).toMatch(/vertical text anchoring/);
    expect(inherited.warnings.join(' ')).toMatch(/complete text block/);
    const overridden = await importPptx(
      await make(
        '<a:bodyPr numCol="1" vert="horz" rot="0" vertOverflow="overflow" anchor="t" anchorCtr="0"/>',
      ),
    );
    expect(overridden.warnings.join(' ')).not.toMatch(
      /ellipsis|Multi-column|Vertical and rotated|vertical text anchoring|complete text block/,
    );
  });

  it('imports native PowerPoint margins, anchors and layout/master inheritance and preserves all text frames through export', async () => {
    const source = await readFile('tests/fixtures/powerpoint-text-frame.pptx');
    const imported = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    expect(imported.deck.slides).toHaveLength(6);
    const texts = imported.deck.slides
      .flatMap((slide) => slide.elements)
      .filter((element) => element.type === 'text');
    const find = (name: string) => {
      const text = texts.find((element) => element.name === name);
      expect(text, name).toBeDefined();
      return text!;
    };
    expect(find('Asymmetric insets').textFrame).toEqual({
      insets: { left: 48, top: 32, right: 24, bottom: 16 },
      wrap: 'square',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'overflow',
    });
    expect(find('Explicit zero insets').textFrame?.insets).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(
      ['Top anchor', 'Middle anchor', 'Bottom anchor'].map((name) => find(name).verticalAlign),
    ).toEqual(['top', 'middle', 'bottom']);
    expect(find('No wrap overflow').textFrame?.wrap).toBe('none');
    expect(find('Hard and soft breaks without wrapping').paragraphs).toHaveLength(2);
    expect(
      find('Hard and soft breaks without wrapping').paragraphs?.some((p) =>
        p.runs.some((r) => r.text.includes('\n')),
      ),
    ).toBe(true);
    const checkInsets = (
      name: string,
      points: { left: number; top: number; right: number; bottom: number },
    ) => {
      for (const side of ['left', 'top', 'right', 'bottom'] as const)
        expect(find(name).textFrame?.insets[side], `${name} ${side}`).toBeCloseTo(
          (points[side] * 4) / 3,
          8,
        );
    };
    checkInsets('Inherited layout title', { left: 27, top: 13, right: 33, bottom: 17 });
    expect(find('Inherited layout title')).toMatchObject({
      verticalAlign: 'bottom',
      textFrame: { wrap: 'none' },
    });
    checkInsets('Inherited layout body', { left: 21, top: 9, right: 15, bottom: 27 });
    expect(find('Inherited layout body')).toMatchObject({
      verticalAlign: 'middle',
      textFrame: { wrap: 'square' },
    });
    for (const name of ['Inherited master content 1', 'Inherited master content 2']) {
      checkInsets(name, { left: 24, top: 10, right: 16, bottom: 20 });
      expect(find(name)).toMatchObject({ verticalAlign: 'bottom', textFrame: { wrap: 'square' } });
    }
    checkInsets('Inherited master title', { left: 4, top: 8, right: 12, bottom: 16 });
    expect(find('Inherited master title')).toMatchObject({
      verticalAlign: 'top',
      textFrame: { wrap: 'none' },
    });
    expect(imported.warnings.join(' ')).not.toMatch(
      /autofit|fit-text|margins are not retained|omit whole lines/i,
    );
    const again = await importPptx(await buffer(await exportPptx(imported.deck)));
    expect(again.warnings.join(' ')).not.toContain('Text-box fill or border');
    for (let index = 0; index < imported.deck.slides.length; index++) {
      const originalText = imported.deck.slides[index].elements.filter((e) => e.type === 'text');
      const exportedText = again.deck.slides[index].elements.filter((e) => e.type === 'text');
      expect(
        exportedText.map((e) => ({
          frame: e.textFrame,
          anchor: e.verticalAlign,
          paragraphs: e.paragraphs,
        })),
      ).toEqual(
        originalText.map((e) => ({
          frame: e.textFrame,
          anchor: e.verticalAlign,
          paragraphs: e.paragraphs,
        })),
      );
      expect(again.deck.slides[index].notes).toBe(imported.deck.slides[index].notes);
    }
  });

  it('imports the separately XML-derived clipping probe with signed margins and per-axis overflow intact', async () => {
    const source = await readFile('tests/fixtures/powerpoint-text-frame-clip-probe.pptx');
    const imported = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    const texts = imported.deck.slides
      .flatMap((slide) => slide.elements)
      .filter((element) => element.type === 'text');
    const find = (name: string) => texts.find((element) => element.name === name)!;
    expect(find('No wrap overflow').textFrame).toMatchObject({
      horizontalOverflow: 'clip',
      verticalOverflow: 'overflow',
    });
    expect(find('Wrapped vertical overflow').textFrame).toMatchObject({
      horizontalOverflow: 'overflow',
      verticalOverflow: 'clip',
    });
    expect(find('Positive overflow control').textFrame).toMatchObject({
      horizontalOverflow: 'clip',
      verticalOverflow: 'clip',
    });
    for (const name of ['Negative insets', 'Negative overflow control']) {
      expect(find(name).textFrame?.insets).toEqual({
        left: -24,
        top: -16,
        right: -32,
        bottom: -101600 / 9525,
      });
    }
    expect(find('Negative overflow control').textFrame).toMatchObject({
      horizontalOverflow: 'clip',
      verticalOverflow: 'clip',
    });
    expect(imported.warnings.join(' ')).toContain('omit whole lines');
    const again = await importPptx(await buffer(await exportPptx(imported.deck)));
    expect(
      again.deck.slides
        .flatMap((slide) => slide.elements)
        .filter((e) => e.type === 'text')
        .map((e) => e.textFrame),
    ).toEqual(texts.map((e) => e.textFrame));
  });

  it('flattens scaled groups with explicit warnings', async () => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            `<p:grpSp><p:nvGrpSpPr/><p:grpSpPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="1905000" cy="1905000"/><a:chOff x="0" y="0"/><a:chExt cx="952500" cy="952500"/></a:xfrm></p:grpSpPr>${textShape('Grouped')}</p:grpSp>`,
          ),
        ),
      ),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      x: 292,
      y: 196,
      width: 768,
      height: 192,
    });
    expect(result.warnings.some((w) => w.includes('Grouped objects'))).toBe(true);
  });

  it('skips external images instead of fetching them', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            '<p:pic><p:nvPicPr><p:cNvPr id="2" name="remote"/></p:nvPicPr><p:blipFill><a:blip r:link="img"/></p:blipFill><p:spPr/></p:pic>',
          ),
        );
        zip.file(
          'ppt/slides/_rels/slide12.xml.rels',
          rels(relationship('img', 'image', 'https://example.com/private.png', true)),
        );
      }),
    );
    expect(result.deck.slides[0].elements).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('No remote image was fetched');
  });

  it('rejects DTDs and entity declarations', async () => {
    const bytes = await fixture((zip) =>
      zip.file(
        'ppt/slides/slide12.xml',
        '<!DOCTYPE slide [<!ENTITY injected SYSTEM "file:///private">]>' +
          slide(textShape('&injected;')),
      ),
    );
    await expect(importPptx(bytes)).rejects.toThrow('entities');
  });

  it('rejects malformed XML and package path escapes', async () => {
    await expect(
      importPptx(await fixture((zip) => zip.file('ppt/slides/slide12.xml', '<p:broken>'))),
    ).rejects.toThrow('Malformed XML');
    await expect(
      importPptx(
        await fixture((zip) =>
          zip.file(
            'ppt/_rels/presentation.xml.rels',
            rels(relationship('second', 'slide', '../../../evil.xml')),
          ),
        ),
      ),
    ).rejects.toThrow('escapes its package');
  });

  it('rejects missing ordered slides rather than silently dropping them', async () => {
    await expect(
      importPptx(await fixture((zip) => zip.remove('ppt/slides/slide12.xml'))),
    ).rejects.toThrow('Slide 1 is missing');
  });

  it('rejects non-ZIP files and oversized central-directory entries before inflation', async () => {
    await expect(importPptx(new TextEncoder().encode('not a zip').buffer)).rejects.toThrow(
      'valid PPTX',
    );
    const bytes = await fixture();
    const view = new DataView(bytes);
    for (let i = 0; i < bytes.byteLength - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 101 * 1024 * 1024, true);
        break;
      }
    await expect(importPptx(bytes)).rejects.toThrow('oversized');
  });

  it('preserves mixed formatting while still reporting unsupported animations', async () => {
    const deck = sample();
    deck.slides[0].elements[0].animation = 'rise';
    expect(pptxExportWarnings(deck).join(' ')).toContain('animations');
    const mixed = textShape('Hello').replace(
      '</a:p>',
      '<a:r><a:rPr sz="1200"/><a:t>Small</a:t></a:r></a:p>',
    );
    const result = await importPptx(
      await fixture((zip) =>
        zip.file('ppt/slides/slide12.xml', slide(mixed).replace('</p:sld>', '<p:timing/></p:sld>')),
      ),
    );
    const text = result.deck.slides[0].elements.find((e) => e.type === 'text')!;
    expect(text.paragraphs?.[0].runs).toMatchObject([
      { text: 'Hello', fontSize: 28 },
      { text: 'Small', fontSize: 12 },
    ]);
    expect(result.warnings.join(' ')).not.toContain('Mixed character formatting');
    expect(result.warnings.join(' ')).toContain('animations');
  });

  it('imports native PowerPoint rich text with lists, paragraph spacing, a blank paragraph, and a safe hyperlink', async () => {
    const source = await readFile('tests/fixtures/powerpoint-rich-text.pptx');
    const { deck } = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    const rich = deck.slides[0].elements.find(
      (e) => e.name === 'Mixed runs and paragraphs',
    ) as TextElement;
    expect(rich.paragraphs).toHaveLength(4);
    expect(rich.text).toBe(
      'Original bold, italic, color, and link.\nSecond paragraph with larger type.\n\nSoft line\nbreak stays in one paragraph.',
    );
    const p = rich.paragraphs!;
    expect(p[0]).toMatchObject({ lineSpacing: 1.25, spaceBefore: 6, spaceAfter: 12 });
    expect(p[0].runs.find((r) => r.text === 'bold')).toMatchObject({
      bold: true,
      italic: false,
      fontSize: 24,
      fontFamily: 'Arial',
    });
    expect(p[0].runs.find((r) => r.text === 'italic')).toMatchObject({ italic: true, bold: false });
    expect(p[0].runs.find((r) => r.text === 'color')).toMatchObject({ color: '#c76a35' });
    expect(p[0].runs.find((r) => r.text === 'link')).toMatchObject({
      underline: true,
      hyperlink: 'https://example.com/opendeck?from=fixture&mode=rich',
    });
    expect(p[1]).toMatchObject({
      align: 'center',
      runs: [{ fontSize: 30, fontFamily: 'Georgia' }],
    });
    expect(p[2].runs.map((r) => r.text).join('')).toBe('');
    expect(p[3].runs.some((r) => r.text === '\n')).toBe(true);
    const bullets = deck.slides[1].elements.find((e) => e.name === 'Bullet list') as TextElement;
    expect(bullets.paragraphs?.map((p) => p.bullet)).toEqual([
      { kind: 'bullet', level: 0, character: '•' },
      { kind: 'bullet', level: 1, character: '•' },
      { kind: 'bullet', level: 0, character: '•' },
    ]);
    const numbers = deck.slides[1].elements.find((e) => e.name === 'Numbered list') as TextElement;
    expect(numbers.paragraphs?.map((p) => p.bullet)).toEqual([
      { kind: 'number', level: 0, start: 3 },
      { kind: 'number', level: 0 },
      { kind: 'number', level: 0 },
    ]);
    const exported = await buffer(await exportPptx(deck));
    const again = await importPptx(exported);
    const richAgain = again.deck.slides[0].elements.find(
      (e) => e.name === rich.name,
    ) as TextElement;
    expect(richAgain.paragraphs).toEqual(rich.paragraphs);
    const numbersAgain = again.deck.slides[1].elements.find(
      (e) => e.name === numbers.name,
    ) as TextElement;
    expect(numbersAgain.paragraphs).toEqual(numbers.paragraphs);
  });

  it('writes one native paragraph per model paragraph, preserving consecutive/trailing blanks and soft breaks', async () => {
    const deck = sample();
    const text = deck.slides[0].elements[0] as TextElement;
    text.paragraphs = [
      {
        runs: [
          { text: 'A', bold: true },
          { text: '\nB', italic: true, hyperlink: 'mailto:team@example.com' },
        ],
        align: 'right',
        lineSpacing: 1.4,
        spaceBefore: 3,
        spaceAfter: 7,
      },
      { runs: [] },
      { runs: [{ text: '' }] },
      { runs: [{ text: 'Last' }], bullet: { kind: 'number', level: 1, start: 7 } },
      { runs: [] },
    ];
    text.text = plainText(text.paragraphs);
    deck.slides[0].elements = [text];
    const bytes = await buffer(await exportPptx(deck));
    const zip = await JSZip.loadAsync(bytes);
    const doc = new DOMParser().parseFromString(
      await zip.file('ppt/slides/slide1.xml')!.async('string'),
      'application/xml',
    );
    expect(doc.getElementsByTagNameNS('*', 'p')).toHaveLength(5);
    expect(doc.getElementsByTagNameNS('*', 'br')).toHaveLength(1);
    expect(doc.getElementsByTagNameNS('*', 'buAutoNum')[0].getAttribute('startAt')).toBe('7');
    const result = await importPptx(bytes);
    const imported = result.deck.slides[0].elements[0] as TextElement;
    expect(imported.text).toBe(text.text);
    expect(imported.paragraphs).toHaveLength(5);
    expect(imported.paragraphs?.[0]).toMatchObject({
      align: 'right',
      lineSpacing: 1.4,
      spaceBefore: 3,
      spaceAfter: 7,
    });
    expect(
      imported.paragraphs?.[0].runs
        .filter((r) => r.text !== 'A')
        .every((r) => r.hyperlink === 'mailto:team@example.com'),
    ).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'file:///private',
    'https://user:secret@example.com/',
    'mailto:team@example.com?body=%0d%0aevil',
  ])('drops unsafe imported text hyperlink %s without fetching', async (target) => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(textShape('Link', '2', '<a:hlinkClick r:id="badLink"/>')),
        );
        zip.file(
          'ppt/slides/_rels/slide12.xml.rels',
          rels(relationship('badLink', 'hyperlink', target, true)),
        );
      }),
    );
    const text = result.deck.slides[0].elements[0] as TextElement;
    expect(text.paragraphs?.[0].runs[0].hyperlink).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('Unsafe, internal, or action-based hyperlinks');
  });

  it('resolves local paragraph defaults over list and master styles with theme font aliases', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Inherited"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2200" b="1"><a:latin typeface="+mj-lt"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:pPr algn="ctr"><a:defRPr i="1" b="0"/></a:pPr><a:r><a:t>Inherited style</a:t></a:r></a:p></p:txBody></p:sp>',
          ),
        );
        zip.file(
          'ppt/theme/theme1.xml',
          `<a:theme ${ns}><a:themeElements><a:clrScheme name="Test"><a:accent1><a:srgbClr val="9A4B13"/></a:accent1></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
        );
      }),
    );
    const text = result.deck.slides[0].elements[0] as TextElement;
    expect(text.paragraphs?.[0]).toMatchObject({
      align: 'center',
      runs: [{ fontSize: 22, fontFamily: 'Georgia', bold: false, italic: true, color: '#9a4b13' }],
    });
  });

  it('warns about adjacent same-base list restarts that OOXML may merge into one sequence', () => {
    const deck = sample();
    const text = deck.slides[0].elements[0] as TextElement;
    text.paragraphs = [
      { runs: [{ text: 'Three' }], bullet: { kind: 'number', level: 0, start: 3 } },
      { runs: [{ text: 'Three again' }], bullet: { kind: 'number', level: 0, start: 3 } },
    ];
    text.text = plainText(text.paragraphs);
    expect(pptxExportWarnings(deck).join(' ')).toContain('same sequence base');
  });

  it('never passes remote image paths to the exporter', async () => {
    const deck = sample();
    const image = deck.slides[0].elements.find((e) => e.type === 'image')!;
    if (image.type === 'image') image.src = 'https://example.com/tracking.png';
    await expect(exportPptx(deck)).rejects.toThrow('Only embedded');
  });

  it('exports line arrows at the visual center and preserves their visible geometry', async () => {
    const deck = sample();
    deck.slides[0].elements = [
      {
        ...base,
        id: 'arrow',
        name: 'Arrow',
        type: 'shape',
        shape: 'arrow',
        x: 100,
        y: 200,
        width: 300,
        height: 40,
        fill: '#174f43',
        stroke: 'transparent',
        strokeWidth: 0,
      },
    ];
    const bytes = await buffer(await exportPptx(deck));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('prst="line"');
    expect(xml).toContain('cy="0"');
    expect(xml).toContain('tailEnd type="arrow"');
    const result = await importPptx(bytes);
    const arrow = result.deck.slides[0].elements[0];
    expect(arrow).toMatchObject({
      type: 'shape',
      shape: 'arrow',
      x: 100,
      width: 300,
      stroke: '#174f43',
      strokeWidth: 2,
    });
    expect(arrow.y + arrow.height / 2).toBeCloseTo(220);
  });

  it('normalizes oversized metadata to the native document limits', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'docProps/core.xml',
          `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${'X'.repeat(400)}</dc:title></cp:coreProperties>`,
        );
        zip.file(
          'ppt/slides/slide12.xml',
          slide(textShape('Text')).replace('name="Text 2"', `name="${'X'.repeat(400)}"`),
        );
      }),
    );
    expect(result.deck.title).toHaveLength(256);
    expect(result.deck.slides[0].elements[0].name).toHaveLength(256);
  });

  it.each([
    [-5, 10],
    [0, 0],
  ])('keeps invalid pie values visible by importing them as bars: %j', async (...values) => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Data"/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="3657600" cy="3657600"/></p:xfrm><a:graphic><a:graphicData><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="chart"/></a:graphicData></a:graphic></p:graphicFrame>',
          ),
        );
        zip.file(
          'ppt/slides/_rels/slide12.xml.rels',
          rels(relationship('chart', 'chart', '../charts/chart1.xml')),
        );
        zip.file(
          'ppt/charts/chart1.xml',
          `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:pieChart><c:ser><c:val><c:numLit>${values.map((value, i) => `<c:pt idx="${i}"><c:v>${value}</c:v></c:pt>`).join('')}</c:numLit></c:val></c:ser></c:pieChart></c:plotArea></c:chart></c:chartSpace>`,
        );
      }),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      type: 'chart',
      chartType: 'bar',
      values,
    });
    expect(result.warnings.join(' ')).toContain('negative or all-zero');
  });
});
