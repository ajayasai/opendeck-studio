import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportPptx, importPptx, pptxExportWarnings } from './pptx';
import type {
  Deck,
  ElementBase,
  Theme,
  TextElement,
  TextAutoFit,
  TextDecoration,
  GradientFill,
  ImageElement,
} from './types';
import { TEXT_LINE_DASHES } from './textDecoration';
import { plainText } from './richText';
import { validateDeck } from './model';
import { resolveTextFrame } from './textFrame';
import { readFile } from 'node:fs/promises';
import { readImageDimensions } from './imageDimensions';
import { materializeImageOrientation } from './imageOrientation';

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
    expect(text?.opacity).toBe(1);
    expect(text?.textOpacity).toBeCloseTo(0.65);
    expect(objects.find((e) => e.type === 'shape')).toMatchObject({
      shape: 'ellipse',
      x: 500,
      y: 80,
      rotation: 20,
      fill: '#aabbcc',
      strokeWidth: 2,
      opacity: 1,
      fillOpacity: 0.8,
      strokeOpacity: 0.8,
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

  it.each(['shape', 'table', 'chart'] as const)(
    'warns at the positive non-text unit boundary for %s without flagging negative positions',
    (type) => {
      const deck = sample();
      const item = deck.slides[0].elements.find((element) => element.type === type)!;
      deck.slides[0].elements = [item];
      const warned = () =>
        pptxExportWarnings(deck).some((message) => message.includes('library unit limit'));
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        Object.assign(item, { x: 100, y: 100, width: 100, height: 100, [key]: 9599.99 });
        expect(warned(), `${type} ${key} below threshold`).toBe(false);
        item[key] = 9600;
        expect(warned(), `${type} ${key} at threshold`).toBe(true);
      }
      Object.assign(item, { x: -100000, y: -100000, width: 100, height: 100 });
      expect(warned()).toBe(false);
    },
  );

  it('checks the exported line center and excludes corrected text geometry from the unit-limit warning', () => {
    const deck = sample();
    const text = deck.slides[0].elements[0];
    Object.assign(text, { x: 50000, y: 50000, width: 50000, height: 50000 });
    deck.slides[0].elements = [text];
    const warned = () =>
      pptxExportWarnings(deck).some((message) => message.includes('library unit limit'));
    expect(warned()).toBe(false);
    for (const shape of ['line', 'arrow'] as const) {
      const line = {
        ...base,
        type: 'shape' as const,
        shape,
        fill: '#174F43',
        stroke: '#174F43',
        strokeWidth: 2,
        x: 100,
        y: 9590,
        width: 100,
        height: 20,
      };
      deck.slides[0].elements = [line];
      expect(warned()).toBe(true);
      Object.assign(line, { y: -10000, height: 20000 });
      expect(warned()).toBe(false);
    }
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

  it.each([
    { x: 50000, y: -50000, width: 0.01, height: 0.01, rotation: 360 },
    { x: -100000, y: 100000, width: 100000, height: 100000, rotation: -360 },
    { x: 9600, y: 9600, width: 9600, height: 9600, rotation: 720 },
  ])('preserves legal text geometry beyond the library unit heuristic: %j', async (geometry) => {
    const deck = sample();
    const text = deck.slides[0].elements[0] as TextElement;
    Object.assign(text, geometry, { autoFit: { mode: 'resize' } });
    deck.slides[0].elements = [text];
    expect(() => validateDeck(deck)).not.toThrow();
    const bytes = await buffer(await exportPptx(deck));
    const zip = await JSZip.loadAsync(bytes);
    const xml = new DOMParser().parseFromString(
      await zip.file('ppt/slides/slide1.xml')!.async('string'),
      'application/xml',
    );
    const transform = xml
      .getElementsByTagNameNS('*', 'sp')[0]
      .getElementsByTagNameNS('*', 'xfrm')[0];
    const off = transform.getElementsByTagNameNS('*', 'off')[0];
    const ext = transform.getElementsByTagNameNS('*', 'ext')[0];
    expect(off.getAttribute('x')).toBe(String(Math.round(geometry.x * 9525)));
    expect(off.getAttribute('y')).toBe(String(Math.round(geometry.y * 9525)));
    expect(ext.getAttribute('cx')).toBe(String(Math.round(geometry.width * 9525)));
    expect(ext.getAttribute('cy')).toBe(String(Math.round(geometry.height * 9525)));
    expect(transform.getAttribute('rot')).toBe(String(geometry.rotation * 60000));
    const imported = await importPptx(bytes);
    expect(imported.deck.slides[0].elements[0]).toMatchObject({
      ...geometry,
      autoFit: { mode: 'resize' },
    });
    expect(() => validateDeck(imported.deck)).not.toThrow();
    expect(pptxExportWarnings(deck).join(' ')).not.toContain('equivalent angle');
  });

  it.each([
    [360000, 360],
    [-360000, -360],
    [359999, 359],
    [-359999, -359],
  ])(
    'writes representable equivalent text angles for %s degrees while preserving nonzero full turns',
    async (rotation, expected) => {
      const deck = sample();
      const text = deck.slides[0].elements[0] as TextElement;
      text.rotation = rotation;
      text.autoFit = { mode: 'resize' };
      deck.slides[0].elements = [text];
      expect(pptxExportWarnings(deck).join(' ')).toContain('equivalent angle');
      const bytes = await buffer(await exportPptx(deck));
      const imported = await importPptx(bytes);
      expect(imported.deck.slides[0].elements[0]).toMatchObject({
        rotation: expected,
        autoFit: { mode: 'resize' },
      });
      expect(text.rotation).toBe(rotation);
    },
  );

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
      paragraphSpacingAtEdges: false,
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
    expect(again.textFrame).toEqual({
      ...resolveTextFrame(deck.slides[0].elements[0] as TextElement),
      paragraphSpacingAtEdges: true,
    });
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
        paragraphSpacingAtEdges: false,
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
    [
      '<a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill>',
      { fill: { color: '#aabbcc', opacity: 1 }, line: null },
    ],
    [
      '<a:ln w="12700"><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill></a:ln>',
      { fill: null, line: { color: '#aabbcc', opacity: 1, width: 4 / 3, dash: 'solid' } },
    ],
    [
      '<a:ln><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill></a:ln>',
      { fill: null, line: { color: '#aabbcc', opacity: 1, width: 0, dash: 'solid' } },
    ],
    ['<a:noFill/><a:ln/>', { fill: null, line: null }],
    ['<a:noFill/><a:ln><a:noFill/></a:ln>', { fill: null, line: null }],
    [
      '<a:solidFill><a:srgbClr val="AABBCC"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln w="0"/>',
      { fill: { color: '#aabbcc', opacity: 0 }, line: null },
    ],
  ])(
    'retains explicit text-box paints and distinguishes empty lines: %s',
    async (decoration, expected) => {
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
        decoration: { shape: 'rect', ...expected },
      });
      expect(result.warnings.join(' ')).not.toContain('Text-box fill or border');
    },
  );

  it.each([
    ['flat', 'flat'],
    ['rnd', 'round'],
    ['sq', 'square'],
  ] as const)(
    'preserves inherited line cap %s and explicitly writes it on export',
    async (native, expected) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:ln w="28575"/></p:spPr>')),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', `<p:spPr><a:ln cap="${native}" w="12700"><a:solidFill><a:srgbClr val="224466"/></a:solidFill><a:prstDash val="dot"/></a:ln></p:spPr>`)}</p:spTree></p:cSld></p:sldLayout>`,
          );
        }),
      );
      expect(result.deck.slides[0].elements[0]).toMatchObject({
        decoration: { line: { width: 3, cap: expected, dash: 'dot' } },
      });
      const bytes = await buffer(await exportPptx(result.deck));
      const zip = await JSZip.loadAsync(bytes);
      expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain(`cap="${native}"`);
      expect((await importPptx(bytes)).deck.slides[0].elements[0]).toMatchObject({
        decoration: { line: { cap: expected } },
      });
      expect(result.warnings.join(' ')).not.toContain('border cap');
    },
  );

  it.each([
    ['<a:round/>', { join: 'round' }],
    ['<a:bevel/>', { join: 'bevel' }],
    ['<a:miter/>', { join: 'miter' }],
    ['<a:miter lim="800%"/>', { join: 'miter', miterLimit: 8 }],
    ['<a:miter lim="0"/>', { join: 'miter', miterLimit: 0 }],
    ['<a:miter lim="50%"/>', { join: 'miter', miterLimit: 0.5 }],
    ['<a:miter lim="2147483647"/>', { join: 'miter', miterLimit: 21474.83647 }],
  ] as const)('preserves inherited border join and miter settings %s', async (join, expected) => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:ln w="28575"/></p:spPr>')),
        );
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', `<p:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="224466"/></a:solidFill>${join}</a:ln></p:spPr>`)}</p:spTree></p:cSld></p:sldLayout>`,
        );
      }),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      decoration: { line: { width: 3, ...expected } },
    });
    const bytes = await buffer(await exportPptx(result.deck));
    expect((await importPptx(bytes)).deck.slides[0].elements[0]).toMatchObject({
      decoration: { line: expected },
    });
    expect(result.warnings.some((warning) => warning.includes('minimum limit of 1'))).toBe(
      'miterLimit' in expected && expected.miterLimit < 1,
    );
    expect(
      pptxExportWarnings(result.deck).some((warning) => warning.includes('minimum limit of 1')),
    ).toBe('miterLimit' in expected && expected.miterLimit < 1);
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it.each([0, 1000, 1001])(
    'resolves fillRef %s against the correct style list or no-fill sentinel',
    async (index) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              textShape('Theme').replace(
                '<p:txBody>',
                `<p:style><a:fillRef idx="${index}"><a:srgbClr val="336699"/></a:fillRef><a:lnRef idx="0"/></p:style><p:txBody>`,
              ),
            ),
          );
          zip.file(
            'ppt/theme/theme1.xml',
            `<a:theme ${ns}><a:themeElements><a:fmtScheme name="Paint"><a:fillStyleLst><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:fillStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
          );
        }),
      );
      expect((result.deck.slides[0].elements[0] as TextElement).decoration).toEqual({
        shape: 'rect',
        fill: index === 1001 ? { color: '#336699', opacity: 1 } : null,
        line: null,
      });
      expect(result.warnings.join(' ')).not.toContain('unresolved');
    },
  );

  it('limits a legal large percent-form miter limit to the application bound with a warning', async () => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            textShape('Large miter').replace(
              '</p:spPr>',
              '<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:miter lim="10000000%"/></a:ln></p:spPr>',
            ),
          ),
        ),
      ),
    );
    expect((result.deck.slides[0].elements[0] as TextElement).decoration?.line?.miterLimit).toBe(
      21474.83647,
    );
    expect(result.warnings.join(' ')).toContain('miter limits outside the supported range');
  });

  it('keeps connector text separate and reports the approximation', async () => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            textShape('Arrow label')
              .replace(' txBox="1"', '')
              .replace(
                '</p:spPr>',
                '<a:prstGeom prst="rightArrow"><a:avLst/></a:prstGeom></p:spPr>',
              ),
          ),
        ),
      ),
    );
    expect(result.deck.slides[0].elements.map((e) => e.type)).toEqual(['shape', 'text']);
    expect(result.warnings.join(' ')).toContain('separate shape and text objects');
  });

  it('inherits glyph alpha independently from decoration alpha and warns when later runs differ', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            placeholderText(
              'idx="1"',
              '<a:bodyPr/>',
              '<p:spPr><a:solidFill><a:srgbClr val="AABBCC"><a:alpha val="20000"/></a:srgbClr></a:solidFill></p:spPr>',
            ).replace(
              '</a:p>',
              '<a:r><a:rPr><a:solidFill><a:srgbClr val="112233"><a:alpha val="80000"/></a:srgbClr></a:solidFill></a:rPr><a:t> second</a:t></a:r></a:p>',
            ),
          ),
        );
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>').replace('<a:p>', '<a:p><a:pPr><a:defRPr><a:solidFill><a:srgbClr val="445566"><a:alpha val="40000"/></a:srgbClr></a:solidFill></a:defRPr></a:pPr>')}</p:spTree></p:cSld></p:sldLayout>`,
        );
      }),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      opacity: 1,
      textOpacity: 0.4,
      decoration: { fill: { opacity: 0.2 } },
    });
    expect(result.warnings.join(' ')).toContain('Mixed per-run text opacity');
  });

  it.each(['<a:ln/>', '<a:ln><a:solidFill/></a:ln>'])(
    'inherits empty same-type fill and border paint without substituting black: %s',
    async (localLine) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              placeholderText(
                'idx="1"',
                '<a:bodyPr/>',
                `<p:spPr><a:solidFill/>${localLine}</p:spPr>`,
              ),
            ),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:solidFill><a:schemeClr val="accent1"><a:alpha val="60000"/></a:schemeClr></a:solidFill><a:ln w="38100"><a:solidFill><a:srgbClr val="123456"><a:alpha val="70000"/></a:srgbClr></a:solidFill><a:prstDash val="dot"/></a:ln></p:spPr>')}</p:spTree></p:cSld></p:sldLayout>`,
          );
        }),
      );
      expect((result.deck.slides[0].elements[0] as TextElement).decoration).toEqual({
        shape: 'rect',
        fill: { color: '#9a4b13', opacity: 0.6 },
        line: { color: '#123456', opacity: 0.7, width: 4, dash: 'dot' },
      });
      expect(result.warnings.join(' ')).not.toMatch(/incomplete|replaced with black/);
    },
  );

  it('inherits an empty solid border color from its theme style while preserving local width', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            textShape('Theme merge')
              .replace('</p:spPr>', '<a:ln w="19050"><a:solidFill/></a:ln></p:spPr>')
              .replace(
                '<p:txBody>',
                '<p:style><a:lnRef idx="1"><a:srgbClr val="CC8844"/></a:lnRef></p:style><p:txBody>',
              ),
          ),
        );
        zip.file(
          'ppt/theme/theme1.xml',
          `<a:theme ${ns}><a:themeElements><a:fmtScheme name="Paint"><a:lnStyleLst><a:ln w="95250"><a:solidFill><a:schemeClr val="phClr"><a:alpha val="50000"/></a:schemeClr></a:solidFill></a:ln></a:lnStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
        );
      }),
    );
    expect((result.deck.slides[0].elements[0] as TextElement).decoration?.line).toMatchObject({
      color: '#cc8844',
      opacity: 0.5,
      width: 2,
    });
    expect(result.warnings.join(' ')).not.toContain('incomplete');
  });

  it.each(['<a:noFill/>', '<a:gradFill/>', ''])(
    'warns when an empty solid fill has no supported same-type inherited color: %s',
    async (inheritedPaint) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:solidFill/></p:spPr>')),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', `<p:spPr>${inheritedPaint}</p:spPr>`)}</p:spTree></p:cSld></p:sldLayout>`,
          );
        }),
      );
      expect((result.deck.slides[0].elements[0] as TextElement).decoration?.fill).toEqual({
        color: '#FFFFFF',
        opacity: 1,
      });
      expect(result.warnings.join(' ')).toContain('incomplete solid color');
    },
  );

  it.each(['rect', 'roundRect', 'ellipse', 'triangle'] as const)(
    'imports a %s text shape as one editable object with independent paint opacity',
    async (preset) => {
      const result = await importPptx(
        await fixture((zip) =>
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              textShape('Attached paint')
                .replace(' txBox="1"', '')
                .replace(
                  '</p:spPr>',
                  `<a:prstGeom prst="${preset}"><a:avLst>${preset === 'roundRect' ? '<a:gd name="adj" fmla="val 25000"/>' : ''}</a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="AABBCC"><a:alpha val="40000"/></a:srgbClr></a:solidFill><a:ln w="28575"><a:solidFill><a:srgbClr val="112233"><a:alpha val="75000"/></a:srgbClr></a:solidFill><a:prstDash val="dashDot"/></a:ln></p:spPr>`,
                )
                .replace(
                  '<a:schemeClr val="accent1"/>',
                  '<a:schemeClr val="accent1"><a:alpha val="65000"/></a:schemeClr>',
                ),
            ),
          ),
        ),
      );
      expect(result.deck.slides[0].elements).toHaveLength(1);
      const text = result.deck.slides[0].elements[0] as TextElement;
      expect(text).toMatchObject({
        type: 'text',
        opacity: 1,
        textOpacity: 0.65,
        decoration: {
          shape: preset,
          fill: { color: '#aabbcc', opacity: 0.4 },
          line: { color: '#112233', opacity: 0.75, width: 3, dash: 'dashDot' },
        },
      });
      if (preset === 'roundRect') expect(text.decoration?.cornerRadius).toBe(0.25);
      expect(result.warnings.join(' ')).not.toMatch(
        /text region|decorations are not|unsupported shape/i,
      );
      const again = await importPptx(await buffer(await exportPptx(result.deck)));
      expect(again.deck.slides[0].elements).toHaveLength(1);
      expect(again.deck.slides[0].elements[0]).toMatchObject({
        opacity: 1,
        textOpacity: 0.65,
        decoration: text.decoration,
      });
      expect(() => validateDeck(again.deck)).not.toThrow();
    },
  );

  it('exports exact preset geometry, every supported dash and independent effective alpha without mutating the source', async () => {
    const deck = sample();
    const original = deck.slides[0].elements[0] as TextElement;
    deck.slides[0].elements = TEXT_LINE_DASHES.map((dash, index) => ({
      ...structuredClone(original),
      id: `dash-${index}`,
      opacity: 0.5,
      textOpacity: 0.6,
      decoration: {
        shape: 'roundRect',
        cornerRadius: 0.35,
        fill: { color: '#DDEEFF', opacity: 0.4 },
        line: { color: '#224466', opacity: 0.8, width: 2.5, dash },
      },
    }));
    const before = structuredClone(deck);
    const bytes = await buffer(await exportPptx(deck));
    expect(deck).toEqual(before);
    const zip = await JSZip.loadAsync(bytes);
    const doc = new DOMParser().parseFromString(
      await zip.file('ppt/slides/slide1.xml')!.async('string'),
      'application/xml',
    );
    const shapes = Array.from(doc.getElementsByTagNameNS('*', 'sp'));
    expect(shapes).toHaveLength(TEXT_LINE_DASHES.length);
    shapes.forEach((shape, index) => {
      const props = shape.getElementsByTagNameNS('*', 'spPr')[0];
      expect(props.getElementsByTagNameNS('*', 'prstGeom')[0].getAttribute('prst')).toBe(
        'roundRect',
      );
      expect(props.getElementsByTagNameNS('*', 'gd')[0].getAttribute('fmla')).toBe('val 35000');
      expect(props.getElementsByTagNameNS('*', 'ln')[0].getAttribute('w')).toBe('23813');
      expect(props.getElementsByTagNameNS('*', 'prstDash')[0].getAttribute('val')).toBe(
        TEXT_LINE_DASHES[index].replace(/^longDash/, 'lgDash'),
      );
      expect(
        Array.from(props.getElementsByTagNameNS('*', 'alpha')).map((alpha) =>
          alpha.getAttribute('val'),
        ),
      ).toEqual(['20000', '40000']);
    });
    const again = await importPptx(bytes);
    again.deck.slides[0].elements.forEach((text, index) => {
      expect(text).toMatchObject({
        opacity: 1,
        textOpacity: 0.3,
        decoration: {
          fill: { opacity: 0.2 },
          line: { opacity: 0.4, dash: TEXT_LINE_DASHES[index] },
        },
      });
    });
  });

  it('retains native PowerPoint attached outlines from the original COM-authored probe', async () => {
    const bytes = await readFile(
      'tests/fixtures/powerpoint-text-frame-attached-outline-probe.pptx',
    );
    const result = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const texts = result.deck.slides.flatMap((s) => s.elements).filter((e) => e.type === 'text');
    const outlined = texts.filter((e) => e.decoration?.line?.color === '#4f6a72');
    expect(outlined).toHaveLength(11);
    expect(outlined.find((e) => e.name === 'Asymmetric insets')).toMatchObject({
      decoration: { line: { opacity: 1, width: 4 / 3, dash: 'solid' } },
    });
    expect(result.warnings.join(' ')).not.toContain('decorations are not imported');
  });

  it('imports the original nine-slide PowerPoint decoration fixture with native caps, joins, long dashes and placeholder inheritance', async () => {
    const bytes = await readFile('tests/fixtures/powerpoint-text-decoration.pptx');
    const result = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.deck.slides).toHaveLength(9);
    const texts = result.deck.slides.flatMap((s) => s.elements).filter((e) => e.type === 'text');
    const find = (name: string) => {
      const element = texts.find((e) => e.name === name);
      expect(element, name).toBeDefined();
      return element!;
    };
    expect(find('Partial alpha')).toMatchObject({
      opacity: 1,
      decoration: {
        fill: { opacity: 0.5 },
        line: { opacity: 0.75, width: 8, cap: 'flat', join: 'round' },
      },
    });
    expect(find('Zero fill alpha').decoration?.fill?.opacity).toBe(0);
    expect(find('Zero line alpha').decoration?.line?.opacity).toBe(0);
    expect(find('Native dash Square dot').decoration?.line).toMatchObject({
      dash: 'dot',
      cap: 'square',
    });
    expect(find('Native dash Round dot').decoration?.line).toMatchObject({
      dash: 'dot',
      cap: 'round',
    });
    expect(find('Native dash Long dash').decoration?.line?.dash).toBe('longDash');
    expect(find('Native dash Long dash dot').decoration?.line?.dash).toBe('longDashDot');
    expect(find('Round default').decoration).toMatchObject({
      shape: 'roundRect',
      cornerRadius: 0.16667,
      line: { join: 'miter', miterLimit: 8 },
    });
    expect(find('Round forty percent').decoration?.cornerRadius).toBe(0.4);
    expect(find('Ellipse text region').decoration?.shape).toBe('ellipse');
    expect(find('Triangle text region').decoration?.shape).toBe('triangle');
    expect(find('Layout fill with local line override').decoration).toMatchObject({
      fill: { color: '#efece9' },
      line: { color: '#0000ff', width: 8 },
    });
    for (const index of [2, 3])
      expect(find(`Master decoration placeholder ${index}`).decoration).toMatchObject({
        fill: { color: '#e7f2e6' },
        line: { color: '#174f99', width: 20 / 3 },
      });
    expect(result.warnings.join(' ')).not.toContain('unsupported text-box border dashes');
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it('retains the independently rendered XML decoration probe through export, including all dash tokens and edge overrides', async () => {
    const bytes = await readFile('tests/fixtures/powerpoint-text-decoration-probe.pptx');
    const result = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const texts = result.deck.slides.flatMap((s) => s.elements).filter((e) => e.type === 'text');
    const find = (name: string) => {
      const element = texts.find((e) => e.name === name);
      expect(element, name).toBeDefined();
      return element!;
    };
    for (const dash of TEXT_LINE_DASHES)
      expect(
        find(`XML dash ${dash.replace(/^longDash/, 'lgDash')}`).decoration?.line,
      ).toMatchObject({ dash, cap: 'flat' });
    expect(find('Centered thick rectangle').decoration?.line?.join).toBe('bevel');
    expect(find('Triangle text region').decoration?.line).toMatchObject({
      join: 'miter',
      miterLimit: 2,
      width: 16,
    });
    expect(find('Theme style 1').decoration).toEqual({ shape: 'rect', fill: null, line: null });
    expect(find('Theme style 2').decoration?.fill).toEqual({ color: '#ffffff', opacity: 1 });
    expect(find('Layout inherited title decoration').textFrame?.paragraphSpacingAtEdges).toBe(true);
    expect(find('Layout fill with local line override').textFrame?.paragraphSpacingAtEdges).toBe(
      false,
    );
    expect(find('Master decoration placeholder 2').textFrame?.paragraphSpacingAtEdges).toBe(true);
    expect(find('Master decoration placeholder 3').textFrame?.paragraphSpacingAtEdges).toBe(false);
    for (const fit of ['none', 'shrink', 'resize'])
      for (const flag of ['default', 'false', 'true'])
        expect(find(`Edge ${fit} ${flag}`).textFrame?.paragraphSpacingAtEdges).toBe(
          flag === 'true',
        );
    const again = await importPptx(await buffer(await exportPptx(result.deck)));
    const actual = again.deck.slides.flatMap((s) => s.elements).filter((e) => e.type === 'text');
    expect(actual).toHaveLength(texts.length);
    texts.forEach((text, index) =>
      expect(actual[index], text.name).toMatchObject({
        text: text.text,
        decoration: text.decoration,
        textFrame: text.textFrame,
      }),
    );
    expect(result.warnings.join(' ')).not.toMatch(
      /unsupported text-box border dashes|Special spacing|decorations are not imported/,
    );
  });

  it.each([
    ['<a:lumMod val="50000"/>', '#800000'],
    ['<a:lumMod val="50000"/><a:lumOff val="50000"/>', '#ff8080'],
    ['<a:satMod val="0"/>', '#808080'],
    ['<a:tint val="25000"/>', '#ffe1e1'],
    ['<a:shade val="25000"/>', '#890000'],
  ])(
    'resolves decoration color transforms %s in the specified color model',
    async (transform, expected) => {
      const result = await importPptx(
        await fixture((zip) =>
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              textShape('Color').replace(
                '</p:spPr>',
                `<a:solidFill><a:srgbClr val="FF0000">${transform}<a:alpha val="80%"/><a:alphaMod val="50000"/><a:alphaOff val="10%"/></a:srgbClr></a:solidFill></p:spPr>`,
              ),
            ),
          ),
        ),
      );
      expect((result.deck.slides[0].elements[0] as TextElement).decoration?.fill).toEqual({
        color: expected,
        opacity: 0.5,
      });
    },
  );

  it('matches independently measured native tint/shade colors and sequential transform order', async () => {
    // scripts/prepare-gradient-color-probe.mjs and the isolated PowerPoint probe
    // measured these RGBs without using the OpenDeck exporter or color resolver.
    const cases = [
      ['FF0000', '<a:shade val="25000"/>', '#890000'],
      ['FF0000', '<a:shade val="50000"/>', '#bc0000'],
      ['808080', '<a:shade val="50000"/>', '#5c5c5c'],
      ['808080', '<a:tint val="50000"/>', '#cdcdcd'],
      ['808080', '<a:shade val="50000"/><a:tint val="50000"/>', '#c4c4c4'],
      ['808080', '<a:tint val="50000"/><a:shade val="50000"/>', '#969696'],
    ];
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            cases
              .map(([base, transform], index) =>
                textShape('Native color', String(index + 2)).replace(
                  '</p:spPr>',
                  `<a:solidFill><a:srgbClr val="${base}">${transform}</a:srgbClr></a:solidFill></p:spPr>`,
                ),
              )
              .join(''),
          ),
        ),
      ),
    );
    expect(
      result.deck.slides[0].elements.map(
        (element) => (element as TextElement).decoration?.fill?.color,
      ),
    ).toEqual(cases.map((entry) => entry[2]));
  });

  it('materializes theme style paint and partial line inheritance from slide, layout, and master', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        const target = placeholderText(
          'idx="1"',
          '<a:bodyPr/>',
          '<p:spPr><a:ln w="19050"/></p:spPr>',
        );
        const layout = placeholderText(
          'idx="1" type="body"',
          '<a:bodyPr/>',
          '<p:spPr><a:ln><a:prstDash val="longDashDot"/></a:ln></p:spPr>',
        );
        const master = placeholderText(
          'idx="7" type="body"',
          '<a:bodyPr/>',
          '<p:spPr><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 30000"/></a:avLst></a:prstGeom></p:spPr>',
        ).replace(
          '<p:txBody>',
          '<p:style><a:fillRef idx="1"><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:fillRef><a:lnRef idx="1"><a:srgbClr val="2468AC"/></a:lnRef></p:style><p:txBody>',
        );
        zip.file('ppt/slides/slide12.xml', slide(target));
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${layout}</p:spTree></p:cSld></p:sldLayout>`,
        );
        zip.file(
          'ppt/slideMasters/slideMaster1.xml',
          `<p:sldMaster ${ns}><p:cSld><p:spTree>${master}</p:spTree></p:cSld></p:sldMaster>`,
        );
        zip.file(
          'ppt/theme/theme1.xml',
          `<a:theme ${ns}><a:themeElements><a:clrScheme name="Paint"><a:accent1><a:srgbClr val="FF0000"/></a:accent1></a:clrScheme><a:fmtScheme name="Paint"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"><a:alpha val="70000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="57150"><a:solidFill><a:schemeClr val="phClr"><a:alpha val="60000"/></a:schemeClr></a:solidFill><a:prstDash val="dot"/></a:ln></a:lnStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
        );
      }),
    );
    const text = result.deck.slides[0].elements[0] as TextElement;
    expect(text.decoration).toEqual({
      shape: 'roundRect',
      cornerRadius: 0.3,
      fill: { color: '#800000', opacity: 0.7 },
      line: { color: '#2468ac', opacity: 0.6, width: 2, dash: 'longDashDot' },
    });
    expect(
      (await importPptx(await buffer(await exportPptx(result.deck)))).deck.slides[0].elements[0],
    ).toMatchObject({ decoration: text.decoration });
  });

  it.each([
    '<a:noFill/><a:ln><a:noFill/></a:ln>',
    '<a:noFill/><a:ln w="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>',
  ])(
    'treats local noFill and zero widths as explicit inherited overrides: %s',
    async (properties) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(placeholderText('idx="1"', '<a:bodyPr/>', `<p:spPr>${properties}</p:spPr>`)),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill><a:ln w="95250"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></p:spPr>')}</p:spTree></p:cSld></p:sldLayout>`,
          );
        }),
      );
      const decoration = (result.deck.slides[0].elements[0] as TextElement).decoration!;
      expect(decoration.fill).toBeNull();
      if (properties.includes('w="0"')) {
        expect(decoration.line).toMatchObject({ color: '#000000', width: 0 });
        expect(result.warnings.join(' ')).toContain('hairlines');
      } else expect(decoration.line).toBeNull();
    },
  );

  it.each([
    ['', 'spcFirstLastPara="1"', '', true],
    ['spcFirstLastPara="0"', 'spcFirstLastPara="1"', '', false],
    ['', '', 'spcFirstLastPara="true"', true],
    ['', 'spcFirstLastPara="false"', 'spcFirstLastPara="1"', false],
  ] as const)(
    'inherits paragraph edge spacing independently, preserving explicit false (%s, %s, %s)',
    async (local, layout, master, expected) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(placeholderText('idx="1"', `<a:bodyPr ${local}/>`)),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1" type="body"', `<a:bodyPr ${layout}/>`)}</p:spTree></p:cSld></p:sldLayout>`,
          );
          zip.file(
            'ppt/slideMasters/slideMaster1.xml',
            `<p:sldMaster ${ns}><p:cSld><p:spTree>${placeholderText('idx="7" type="body"', `<a:bodyPr ${master}/>`)}</p:spTree></p:cSld></p:sldMaster>`,
          );
        }),
      );
      expect(
        (result.deck.slides[0].elements[0] as TextElement).textFrame?.paragraphSpacingAtEdges,
      ).toBe(expected);
      const bytes = await buffer(await exportPptx(result.deck));
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
      expect(xml).toContain(`spcFirstLastPara="${expected ? 1 : 0}"`);
      expect(result.warnings.join(' ')).not.toContain('Special spacing');
      expect((await importPptx(bytes)).deck.slides[0].elements[0]).toMatchObject({
        textFrame: { paragraphSpacingAtEdges: expected },
      });
    },
  );

  it.each([
    ['<a:pattFill prst="pct50"/>', 'paints are not retained'],
    [
      '<a:ln w="12700" cmpd="dbl"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>',
      'border compound styles',
    ],
    [
      '<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:custDash/></a:ln>',
      'unsupported text-box border dashes',
    ],
    [
      '<a:prstGeom prst="triangle"><a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst></a:prstGeom>',
      'geometry adjustments',
    ],
  ])('warns about actual unsupported attached decoration: %s', async (properties, warning) => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(textShape('Warning').replace('</p:spPr>', `${properties}</p:spPr>`)),
        ),
      ),
    );
    expect(result.warnings.join(' ')).toContain(warning);
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it.each(['linear', 'path'] as const)(
    'round-trips editable %s gradients across text, outlines, ordinary shapes, and slide backgrounds',
    async (kind) => {
      const gradient: GradientFill = {
        kind,
        stops: [
          { position: 0, color: '#ff0000', opacity: 0.5 },
          { position: 0.4, color: '#00ff00', opacity: 0.25 },
          { position: 0.4, color: '#0000ff', opacity: 1 },
          { position: 1, color: '#ffffff', opacity: 0.8 },
        ],
        ...(kind === 'linear'
          ? { angle: 37.5, scaled: true }
          : {
              path: 'rect' as const,
              fillToRect: { left: -0.2, top: 0.5, right: 0.8, bottom: 0.5 },
            }),
        tileRect: { left: -0.3, top: 0, right: 0.15 },
        flip: 'xy',
        rotateWithShape: false,
      };
      const deck = sample();
      const text = deck.slides[0].elements[0] as TextElement;
      text.opacity = 0.5;
      text.decoration = {
        shape: 'ellipse',
        fill: { color: '#112233', opacity: 0.8, gradient },
        line: { color: '#445566', opacity: 0.6, width: 3, dash: 'dash', gradient },
      };
      const shape = deck.slides[0].elements[1];
      if (shape.type !== 'shape') throw new Error('Test shape missing');
      shape.opacity = 0.5;
      shape.fillGradient = gradient;
      shape.fillOpacity = 0.6;
      shape.strokeGradient = gradient;
      shape.strokeOpacity = 0.7;
      deck.slides[0].backgroundGradient = gradient;
      deck.slides[0].backgroundOpacity = 0.9;
      const before = structuredClone(deck);
      const bytes = await buffer(await exportPptx(deck));
      expect(deck).toEqual(before);
      const zip = await JSZip.loadAsync(bytes);
      const xml = new DOMParser().parseFromString(
        await zip.file('ppt/slides/slide1.xml')!.async('string'),
        'application/xml',
      );
      expect(xml.getElementsByTagNameNS('*', 'gradFill')).toHaveLength(5);
      expect(
        Array.from(
          xml.getElementsByTagNameNS('*', 'gradFill')[0].getElementsByTagNameNS('*', 'gs'),
        ).map((stop) => stop.getAttribute('pos')),
      ).toEqual(['0', '40000', '40000', '100000']);
      const result = await importPptx(bytes);
      const texts = result.deck.slides[0].elements.filter((e) => e.type === 'text');
      const shapes = result.deck.slides[0].elements.filter((e) => e.type === 'shape');
      const effective = (factor: number): GradientFill => ({
        ...gradient,
        stops: gradient.stops.map((stop) => ({
          ...stop,
          opacity: Number((stop.opacity * factor).toFixed(12)),
        })),
      });
      expect(texts[0].decoration?.fill).toEqual({
        color: '#ff0000',
        opacity: 1,
        gradient: effective(0.4),
      });
      expect(texts[0].decoration?.line?.gradient).toEqual(effective(0.3));
      expect(shapes[0]).toMatchObject({
        opacity: 1,
        fillGradient: effective(0.3),
        strokeGradient: effective(0.35),
      });
      expect(result.deck.slides[0].backgroundGradient).toEqual(effective(0.9));
      expect(result.deck.slides[0].backgroundOpacity).toBeUndefined();
      expect(() => validateDeck(result.deck)).not.toThrow();
    },
  );

  it.each(['circle', 'rect', 'shape'] as const)(
    'preserves %s path metadata with absent versus empty focus rectangles and signed percentage offsets',
    async (path) => {
      const paint = `<a:gradFill rotWithShape="0" flip="none"><a:gsLst><a:gs pos="0%"><a:srgbClr val="123456"/></a:gs><a:gs pos="100%"><a:srgbClr val="ABCDEF"/></a:gs></a:gsLst><a:path path="${path}"><a:fillToRect/></a:path><a:tileRect l="-20%" r="25000"/></a:gradFill>`;
      const result = await importPptx(
        await fixture((zip) =>
          zip.file(
            'ppt/slides/slide12.xml',
            slide(textShape('Path').replace('</p:spPr>', `${paint}</p:spPr>`)),
          ),
        ),
      );
      const gradient = (result.deck.slides[0].elements[0] as TextElement).decoration?.fill
        ?.gradient;
      expect(gradient).toMatchObject({
        kind: 'path',
        path,
        fillToRect: {},
        tileRect: { left: -0.2, right: 0.25 },
        rotateWithShape: false,
        flip: 'none',
      });
      const again = await importPptx(await buffer(await exportPptx(result.deck)));
      expect((again.deck.slides[0].elements[0] as TextElement).decoration?.fill?.gradient).toEqual(
        gradient,
      );
    },
  );

  it('inherits gradient stops as a whole while merging supported local linear attributes and preserving an explicit empty tile rectangle', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            placeholderText(
              'idx="1"',
              '<a:bodyPr/>',
              '<p:spPr><a:gradFill rotWithShape="0"><a:lin scaled="0"/><a:tileRect/></a:gradFill></p:spPr>',
            ),
          ),
        );
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:gradFill flip="x" rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="accent1"/></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst><a:lin ang="1800000" scaled="1"/><a:tileRect l="25000"/></a:gradFill></p:spPr>')}</p:spTree></p:cSld></p:sldLayout>`,
        );
      }),
    );
    expect((result.deck.slides[0].elements[0] as TextElement).decoration?.fill?.gradient).toEqual({
      kind: 'linear',
      stops: [
        { position: 0, color: '#9a4b13', opacity: 1 },
        { position: 1, color: '#ffffff', opacity: 1 },
      ],
      angle: 30,
      scaled: false,
      rotateWithShape: false,
      flip: 'x',
      tileRect: {},
    });
  });

  it.each(['', '<a:gs pos="30000"><a:srgbClr val="224466"/></a:gs>'])(
    'preserves an explicitly empty or single gradient stop list without inheriting ancestor stops: %s',
    async (stops) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              placeholderText(
                'idx="1"',
                '<a:bodyPr/>',
                `<p:spPr><a:gradFill><a:gsLst>${stops}</a:gsLst></a:gradFill></p:spPr>`,
              ),
            ),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="1"', '<a:bodyPr/>', '<p:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="00FF00"/></a:gs></a:gsLst><a:path path="circle"/></a:gradFill></p:spPr>')}</p:spTree></p:cSld></p:sldLayout>`,
          );
        }),
      );
      const gradient = (result.deck.slides[0].elements[0] as TextElement).decoration?.fill
        ?.gradient;
      expect(gradient?.kind).toBe('path');
      expect(gradient?.stops).toHaveLength(stops ? 1 : 0);
      expect(result.warnings.join(' ')).toContain('fewer than two stops');
      expect(pptxExportWarnings(result.deck).join(' ')).toContain('equivalent two-stop solid ramp');
      const before = structuredClone(result.deck);
      const bytes = await buffer(await exportPptx(result.deck));
      expect(result.deck).toEqual(before);
      const expectedStops = [0, 1].map((position) => ({
        position,
        color: stops ? '#224466' : '#000000',
        opacity: 1,
      }));
      expect((await importPptx(bytes)).deck.slides[0].elements[0]).toMatchObject({
        decoration: { fill: { gradient: { ...gradient, stops: expectedStops } } },
      });
    },
  );

  it('resolves gradient background references through the theme matrix and uses the reference color at each inherited stop', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(textShape('Background')).replace(
            '<p:spTree>',
            '<p:bg><p:bgRef idx="1001"><a:srgbClr val="FF0000"/></p:bgRef></p:bg><p:spTree>',
          ),
        );
        zip.file(
          'ppt/theme/theme1.xml',
          `<a:theme ${ns}><a:themeElements><a:fmtScheme name="Gradient"><a:bgFillStyleLst><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
        );
      }),
    );
    expect(result.deck.slides[0].backgroundGradient).toEqual({
      kind: 'linear',
      angle: 90,
      stops: [
        { position: 0, color: '#bc0000', opacity: 1 },
        { position: 1, color: '#ffbcbc', opacity: 1 },
      ],
    });
    expect(result.warnings.join(' ')).not.toContain('style-reference slide backgrounds');
  });

  it('keeps solid companion shape opacity independent of gradient stop alpha', async () => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            textShape('')
              .replace(' txBox="1"', '')
              .replace(/<p:txBody>[\s\S]*<\/p:txBody>/, '')
              .replace(
                '</p:spPr>',
                '<a:solidFill><a:srgbClr val="ABCDEF"><a:alpha val="30000"/></a:srgbClr></a:solidFill><a:ln w="19050"><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst><a:lin/></a:gradFill></a:ln></p:spPr>',
              ),
          ),
        ),
      ),
    );
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      type: 'shape',
      opacity: 1,
      fillOpacity: 0.3,
      strokeGradient: {
        stops: [
          { position: 0, color: '#000000', opacity: 0.4 },
          { position: 1, color: '#ffffff', opacity: 1 },
        ],
      },
    });
    const again = await importPptx(await buffer(await exportPptx(result.deck)));
    expect(again.deck.slides[0].elements[0]).toMatchObject({
      opacity: 1,
      fillOpacity: 0.3,
      strokeGradient: { stops: [{ opacity: 0.4 }, { opacity: 1 }] },
    });
  });

  it('preserves unsorted and duplicate gradient stop positions and warns on malformed numeric input', async () => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            textShape('Stops').replace(
              '</p:spPr>',
              '<a:gradFill><a:gsLst><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="invalid"><a:srgbClr val="000000"/></a:gs><a:gs pos="-20%"><a:srgbClr val="FF0000"/></a:gs></a:gsLst><a:lin ang="-60000" scaled="false"/><a:tileRect l="invalid" t="999999999999%"/></a:gradFill></p:spPr>',
            ),
          ),
        ),
      ),
    );
    expect(
      (result.deck.slides[0].elements[0] as TextElement).decoration?.fill?.gradient,
    ).toMatchObject({
      kind: 'linear',
      angle: 359,
      scaled: false,
      stops: [{ position: 1 }, { position: 0 }, { position: 0 }],
      tileRect: { left: 0, top: 21474.83647 },
    });
    expect(result.warnings.join(' ')).toMatch(/Invalid or missing gradient stop position/);
    expect(result.warnings.join(' ')).toContain('outside');
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it('defaults malformed gradient angles and bounds oversized stop lists without sorting retained entries', async () => {
    const stops = Array.from(
      { length: 257 },
      (_, index) => `<a:gs pos="${index % 2 ? 100000 : 0}"><a:srgbClr val="123456"/></a:gs>`,
    ).join('');
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            textShape('Bounded').replace(
              '</p:spPr>',
              `<a:gradFill><a:gsLst>${stops}</a:gsLst><a:lin ang="12.5"/></a:gradFill></p:spPr>`,
            ),
          ),
        ),
      ),
    );
    const gradient = (result.deck.slides[0].elements[0] as TextElement).decoration!.fill!.gradient!;
    expect(gradient.angle).toBe(0);
    expect(gradient.stops).toHaveLength(256);
    expect(gradient.stops.slice(0, 4).map((stop) => stop.position)).toEqual([0, 1, 0, 1]);
    expect(result.warnings.join(' ')).toContain('exceeded 256 stops');
    expect(result.warnings.join(' ')).toContain('Invalid gradient angle');
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it('retains a visibly painted empty placeholder instead of dropping its gradient', async () => {
    const result = await importPptx(
      await fixture((zip) =>
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            placeholderText(
              'idx="1"',
              '<a:bodyPr/>',
              '<p:spPr><a:gradFill><a:lin ang="0"/></a:gradFill></p:spPr>',
            ).replace('Frame text', ''),
          ),
        ),
      ),
    );
    expect(result.deck.slides[0].elements).toHaveLength(1);
    expect(result.deck.slides[0].elements[0]).toMatchObject({
      type: 'text',
      text: '',
      decoration: { fill: { gradient: { kind: 'linear', angle: 0 } } },
    });
  });

  it.each([
    ['<a:noFill/>', undefined, 0],
    [
      '<a:solidFill><a:srgbClr val="ABCDEF"><a:alpha val="30000"/></a:srgbClr></a:solidFill>',
      undefined,
      0.3,
    ],
    ['<a:gradFill><a:lin scaled="0"/></a:gradFill>', false, undefined],
    ['', true, undefined],
  ])(
    'resolves slide background paint inheritance with explicit stopping paint: %s',
    async (local, scaled, opacity) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(textShape('Background')).replace(
              '<p:spTree>',
              `<p:bg><p:bgPr>${local}</p:bgPr></p:bg><p:spTree>`,
            ),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="112233"/></a:gs><a:gs pos="100000"><a:srgbClr val="445566"/></a:gs></a:gsLst><a:lin ang="1200000" scaled="1"/></a:gradFill></p:bgPr></p:bg><p:spTree/></p:cSld></p:sldLayout>`,
          );
        }),
      );
      const background = result.deck.slides[0];
      expect(background.backgroundOpacity).toBe(opacity);
      if (scaled === undefined) expect(background.backgroundGradient).toBeUndefined();
      else
        expect(background.backgroundGradient).toEqual({
          kind: 'linear',
          angle: 20,
          scaled,
          stops: [
            { position: 0, color: '#112233', opacity: 1 },
            { position: 1, color: '#445566', opacity: 1 },
          ],
        });
      const again = (await importPptx(await buffer(await exportPptx(result.deck)))).deck.slides[0];
      expect(again.backgroundOpacity).toBe(background.backgroundOpacity);
      expect(again.backgroundGradient).toEqual(background.backgroundGradient);
    },
  );

  it('imports independently authored native gradients including theme paints and inherited layout/master backgrounds', async () => {
    const bytes = await readFile('tests/fixtures/powerpoint-gradients.pptx');
    const result = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.deck.slides).toHaveLength(9);
    const shapes = result.deck.slides
      .flatMap((entry) => entry.elements)
      .filter((entry) => entry.type === 'shape');
    const texts = result.deck.slides
      .flatMap((entry) => entry.elements)
      .filter((entry) => entry.type === 'text');
    const shape = (name: string) => shapes.find((entry) => entry.name === name)!;
    const text = (name: string) => texts.find((entry) => entry.name === name)!;
    expect(shape('Linear 30').fillGradient).toMatchObject({
      angle: 30,
      scaled: true,
      rotateWithShape: true,
    });
    // COM authored the midpoint after its endpoints; preserve the original list order.
    expect(shape('Linear 30').fillGradient?.stops.map((stop) => stop.position)).toEqual([
      0, 1, 0.5,
    ]);
    expect(shape('Center Rectangle').fillGradient).toMatchObject({
      kind: 'path',
      path: 'rect',
      fillToRect: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
      tileRect: {},
    });
    expect(shape('Corner variant 1').fillGradient).toMatchObject({
      fillToRect: { right: 1, bottom: 1 },
      tileRect: { left: -1, top: -1 },
    });
    expect(shape('Rotated 30 follow False').fillGradient?.rotateWithShape).toBe(false);
    // Independently measured COM stop colors in the frozen original fixture.
    // Theme tint must operate in linear light; mixing sRGB channels made these visibly too dark.
    for (const [style, colors] of [
      [22, ['#9b9b9b', '#8e8e8e', '#797979']],
      [23, ['#9cafbf', '#8fa3b4', '#7a95ab']],
      [24, ['#f5b8a4', '#f2ab96', '#f59e81']],
      [25, ['#9db49e', '#90a891', '#7b9c7d']],
    ] as const) {
      const gradient = shape(`Theme gradient style ${style}`).fillGradient!;
      expect(gradient).toMatchObject({ angle: 90, scaled: false });
      expect(gradient.stops.map((stop) => stop.color)).toEqual(colors);
    }
    expect(text('Attached text gradient').decoration?.fill?.gradient?.angle).toBe(0);
    expect(text('Layout inherited gradient').decoration?.fill?.gradient?.angle).toBe(30);
    expect(text('Local override gradient').decoration?.fill?.gradient?.angle).toBe(90);
    for (const name of ['Master gradient placeholder 2', 'Master gradient placeholder 3'])
      expect(text(name).decoration?.fill?.gradient?.angle).toBe(90);
    expect(result.deck.slides[5].backgroundGradient?.angle).toBe(30);
    expect(result.deck.slides[8].backgroundGradient?.angle).toBe(0);
    expect(() => validateDeck(result.deck)).not.toThrow();
    const gradients = (deck: Deck) =>
      deck.slides.map((entry) => ({
        background: entry.backgroundGradient,
        paints: entry.elements.map((element) =>
          element.type === 'shape'
            ? [element.fillGradient, element.strokeGradient]
            : element.type === 'text'
              ? [element.decoration?.fill?.gradient, element.decoration?.line?.gradient]
              : [],
        ),
      }));
    const again = await importPptx(await buffer(await exportPptx(result.deck)));
    expect(gradients(again.deck)).toEqual(gradients(result.deck));
  });

  it('preserves native-opened XML gradient probes, including omitted defaults, duplicate stops, and outlines', async () => {
    const bytes = await readFile('tests/fixtures/powerpoint-gradient-probe.pptx');
    const result = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.deck.slides).toHaveLength(11);
    const shapes = result.deck.slides
      .flatMap((entry) => entry.elements)
      .filter((entry) => entry.type === 'shape');
    const shape = (name: string) => shapes.find((entry) => entry.name === name)!;
    expect(shape('XML scaled false30').fillGradient?.scaled).toBe(false);
    expect(shape('XML scaled true30').fillGradient?.scaled).toBe(true);
    expect(shape('XML scaled absent30').fillGradient?.scaled).toBeUndefined();
    expect(shape('XML absent stop list').fillGradient?.stops).toEqual([
      { position: 0, color: '#000000', opacity: 1 },
      { position: 1, color: '#FFFFFF', opacity: 1 },
    ]);
    expect(
      shape('XML duplicate hard stops').fillGradient?.stops.map((stop) => stop.position),
    ).toEqual([0, 0.4, 0.4, 1]);
    expect(shape('XML circle on rectangle').fillGradient?.path).toBe('circle');
    expect(shape('XML shape on triangle').fillGradient?.path).toBe('shape');
    expect(shape('XML fillToRect absent').fillGradient?.fillToRect).toBeUndefined();
    expect(shape('XML fillToRect empty').fillGradient?.fillToRect).toEqual({});
    expect(shape('XML path kind absent').fillGradient?.path).toBeUndefined();
    expect(shape('XML circle absent focus').fillGradient?.fillToRect).toBeUndefined();
    expect(shape('XML circle empty focus').fillGradient?.fillToRect).toEqual({});
    expect(shape('XML gradient missing flags').fillGradient).toEqual({
      kind: 'linear',
      angle: 30,
      stops: shape('XML duplicate hard stops').fillGradient!.stops,
    });
    const outline = result.deck.slides[5].elements.find(
      (entry) => entry.name === 'XML attached gradient outline',
    ) as TextElement;
    expect(outline.decoration?.line?.gradient?.stops).toHaveLength(3);
    expect(shape('XML gradient outline on rectangle').strokeGradient).toMatchObject({
      angle: 90,
      scaled: false,
    });
    const paints = (deck: Deck) =>
      JSON.stringify(
        deck.slides.map((entry) => ({
          background: entry.backgroundGradient,
          paints: entry.elements.map((element) =>
            element.type === 'shape'
              ? [element.fillGradient, element.strokeGradient]
              : element.type === 'text'
                ? [element.decoration?.fill?.gradient, element.decoration?.line?.gradient]
                : [],
          ),
        })),
      ).toLowerCase();
    const again = await importPptx(await buffer(await exportPptx(result.deck)));
    expect(JSON.parse(paints(again.deck))).toEqual(JSON.parse(paints(result.deck)));
    expect(() => validateDeck(again.deck)).not.toThrow();
  });

  it.each([
    ['<a:normAutofit/>', { mode: 'shrink', fontScale: 1, lineSpacingReduction: 0 }],
    [
      '<a:normAutofit fontScale="80000" lnSpcReduction="10000"/>',
      { mode: 'shrink', fontScale: 0.8, lineSpacingReduction: 0.1 },
    ],
    [
      '<a:normAutofit fontScale="80.000%" lnSpcReduction="10.000%"/>',
      { mode: 'shrink', fontScale: 0.8, lineSpacingReduction: 0.1 },
    ],
    ['<a:spAutoFit/>', { mode: 'resize' }],
  ])('preserves the inherited autofit choice %s without baking sizes', async (fit, expected) => {
    const result = await importPptx(
      await fixture((zip) => {
        zip.file('ppt/slides/slide12.xml', slide(placeholderText('idx="3"', '<a:bodyPr/>')));
        zip.file(
          'ppt/slideLayouts/slideLayout1.xml',
          `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="3" type="body"', `<a:bodyPr>${fit}</a:bodyPr>`)}</p:spTree></p:cSld></p:sldLayout>`,
        );
      }),
    );
    const text = result.deck.slides[0].elements[0] as TextElement;
    expect(text.autoFit).toEqual(expected);
    expect(text.fontSize).toBe(24);
    expect(result.warnings.join(' ')).toContain('Automatic text fitting can reflow differently');
    expect(result.warnings.join(' ')).not.toMatch(/not applied|behavior is not retained/);
  });

  it.each([
    [
      '',
      '<a:normAutofit fontScale="70000" lnSpcReduction="20000"/>',
      { mode: 'shrink', fontScale: 0.7, lineSpacingReduction: 0.2 },
    ],
    ['<a:noAutofit/>', '<a:normAutofit fontScale="70000"/>', { mode: 'none' }],
    ['<a:noAutofit/>', '<a:spAutoFit/>', { mode: 'none' }],
    [
      '<a:normAutofit/>',
      '<a:normAutofit fontScale="70000" lnSpcReduction="20000"/>',
      { mode: 'shrink', fontScale: 1, lineSpacingReduction: 0 },
    ],
    [
      '<a:normAutofit fontScale="81234" lnSpcReduction="0"/>',
      '<a:spAutoFit/>',
      { mode: 'shrink', fontScale: 0.81234, lineSpacingReduction: 0 },
    ],
    ['<a:spAutoFit/>', '<a:normAutofit fontScale="70000"/>', { mode: 'resize' }],
    ['', '', { mode: 'none' }],
  ])(
    'resolves the nearest entire fit choice and then its own defaults: local=%s master=%s',
    async (local, master, expected) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(placeholderText('idx="2"', `<a:bodyPr>${local}</a:bodyPr>`)),
          );
          zip.file(
            'ppt/slideLayouts/slideLayout1.xml',
            `<p:sldLayout ${ns}><p:cSld><p:spTree>${placeholderText('idx="2"', '<a:bodyPr/>')}</p:spTree></p:cSld></p:sldLayout>`,
          );
          zip.file(
            'ppt/slideMasters/slideMaster1.xml',
            `<p:sldMaster ${ns}><p:cSld><p:spTree>${placeholderText('idx="1" type="body"', `<a:bodyPr>${master}</a:bodyPr>`)}</p:spTree></p:cSld></p:sldMaster>`,
          );
        }),
      );
      const text = result.deck.slides[0].elements[0] as TextElement;
      expect(text.autoFit).toEqual(expected);
      if (expected.mode === 'none')
        expect(result.warnings.join(' ')).not.toContain('Automatic text fitting');
    },
  );

  it.each([
    ['0', '-20000', 0.01, 0, 'outside the supported range'],
    ['200000', '13200001', 1, 132, 'outside the supported range'],
    ['1000', '13200000', 0.01, 132, null],
    ['81.23456%', '12.34567%', 0.8123456, 0.1234567, null],
    ['NaN', 'Infinity', 1, 0, 'Invalid autofit'],
    ['', '', 1, 0, 'Invalid autofit'],
    ['0x1000', '1e4', 1, 0, 'Invalid autofit'],
  ])(
    'normalizes autofit values safely: fontScale=%s reduction=%s',
    async (font, reduction, expectedFont, expectedReduction, warning) => {
      const result = await importPptx(
        await fixture((zip) => {
          zip.file(
            'ppt/slides/slide12.xml',
            slide(
              textShape('Scaled').replace(
                '<a:bodyPr/>',
                `<a:bodyPr><a:normAutofit fontScale="${font}" lnSpcReduction="${reduction}"/></a:bodyPr>`,
              ),
            ),
          );
        }),
      );
      const text = result.deck.slides[0].elements[0] as TextElement;
      expect(text.autoFit?.mode).toBe('shrink');
      if (text.autoFit?.mode !== 'shrink') throw new Error('Expected normal autofit');
      expect(text.autoFit.fontScale).toBeCloseTo(expectedFont as number, 12);
      expect(text.autoFit.lineSpacingReduction).toBeCloseTo(expectedReduction as number, 12);
      if (warning) expect(result.warnings.join(' ')).toContain(warning);
      else
        expect(result.warnings.join(' ')).not.toMatch(
          /Invalid autofit|outside the supported range/,
        );
      const again = (await importPptx(await buffer(await exportPptx(result.deck)))).deck.slides[0]
        .elements[0] as TextElement;
      expect(again.autoFit).toEqual(text.autoFit);
    },
  );

  it.each<TextAutoFit>([
    { mode: 'none' },
    { mode: 'shrink', fontScale: 0.81234, lineSpacingReduction: 0.15 },
    { mode: 'resize' },
  ])(
    'exports exactly one native fit choice for $mode while retaining base fonts and box geometry',
    async (autoFit) => {
      const deck = sample();
      const text = deck.slides[0].elements[0] as TextElement;
      text.autoFit = autoFit;
      text.paragraphs = [
        {
          runs: [
            { text: 'Large', fontSize: 40 },
            { text: ' small', fontSize: 20 },
          ],
          lineSpacing: 1.5,
        },
      ];
      text.text = plainText(text.paragraphs);
      deck.slides[0].elements = [text];
      const bytes = await buffer(await exportPptx(deck));
      const zip = await JSZip.loadAsync(bytes);
      const xml = new DOMParser().parseFromString(
        await zip.file('ppt/slides/slide1.xml')!.async('string'),
        'application/xml',
      );
      const body = xml.getElementsByTagNameNS('*', 'bodyPr')[0];
      const choices = Array.from(body.children).filter((node) =>
        ['noAutofit', 'normAutofit', 'spAutoFit'].includes(node.localName),
      );
      expect(choices).toHaveLength(1);
      expect(choices[0].localName).toBe(
        autoFit.mode === 'shrink'
          ? 'normAutofit'
          : autoFit.mode === 'resize'
            ? 'spAutoFit'
            : 'noAutofit',
      );
      if (autoFit.mode === 'shrink') {
        expect(choices[0].getAttribute('fontScale')).toBe('81234');
        expect(choices[0].getAttribute('lnSpcReduction')).toBe('15000');
      }
      expect(
        Array.from(xml.getElementsByTagNameNS('*', 'rPr')).map((node) => node.getAttribute('sz')),
      ).toEqual(['4000', '2000']);
      expect(xml.getElementsByTagNameNS('*', 'spcPct')[0].getAttribute('val')).toBe('150000');
      const imported = await importPptx(bytes);
      expect(imported.deck.slides[0].elements[0]).toMatchObject({
        autoFit,
        x: text.x,
        y: text.y,
        width: text.width,
        height: text.height,
      });
      const again = imported.deck.slides[0].elements[0] as TextElement;
      expect(again.paragraphs?.[0].runs.map((run) => run.fontSize)).toEqual([40, 20]);
      expect(again.paragraphs?.[0].lineSpacing).toBe(1.5);
      expect(imported.deck.slides[0].notes).toBe(deck.slides[0].notes);
    },
  );

  it('preserves fixed-point line spacing including zero independently from normal autofit factors', async () => {
    const result = await importPptx(
      await fixture((zip) => {
        const text = textShape('Scaled')
          .replace(
            '<a:bodyPr/>',
            '<a:bodyPr><a:normAutofit fontScale="80000" lnSpcReduction="20000"/></a:bodyPr>',
          )
          .replace(
            '<a:pPr algn="r"/>',
            '<a:pPr algn="r"><a:lnSpc><a:spcPts val="3750"/></a:lnSpc></a:pPr>',
          )
          .replace(
            '</p:txBody>',
            '<a:p><a:pPr><a:lnSpc><a:spcPts val="0"/></a:lnSpc></a:pPr><a:endParaRPr sz="1600"/></a:p></p:txBody>',
          );
        zip.file('ppt/slides/slide12.xml', slide(text));
      }),
    );
    const text = result.deck.slides[0].elements[0] as TextElement;
    expect(text.autoFit).toEqual({ mode: 'shrink', fontScale: 0.8, lineSpacingReduction: 0.2 });
    expect(text.paragraphs?.map((p) => p.lineSpacingPoints)).toEqual([37.5, 0]);
    expect(text.paragraphs?.map((p) => p.lineSpacing)).toEqual([undefined, undefined]);
    expect(text.paragraphs?.[0].runs[0].fontSize).toBe(28);
    expect(result.warnings.join(' ')).not.toContain('Fixed-point line spacing is converted');
    const bytes = await buffer(await exportPptx(result.deck));
    const zip = await JSZip.loadAsync(bytes);
    const xml = new DOMParser().parseFromString(
      await zip.file('ppt/slides/slide1.xml')!.async('string'),
      'application/xml',
    );
    const lines = Array.from(xml.getElementsByTagNameNS('*', 'lnSpc'));
    expect(lines.map((line) => line.firstElementChild?.localName)).toEqual(['spcPts', 'spcPts']);
    expect(lines.map((line) => line.firstElementChild?.getAttribute('val'))).toEqual(['3750', '0']);
    const again = (await importPptx(bytes)).deck.slides[0].elements[0] as TextElement;
    expect(again.paragraphs).toEqual(text.paragraphs);
    expect(again.autoFit).toEqual(text.autoFit);
  });

  it('imports native PowerPoint fit modes without inventing saved scales absent from the windowless COM fixture', async () => {
    const source = await readFile('tests/fixtures/powerpoint-autofit.pptx');
    const imported = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    expect(imported.deck.slides).toHaveLength(7);
    const texts = imported.deck.slides
      .flatMap((slide) => slide.elements)
      .filter((e) => e.type === 'text');
    const find = (name: string) => texts.find((e) => e.name === name)!;
    for (const name of [
      'Plain shrink',
      'Mixed shrink',
      'Bulleted shrink',
      'Spaced shrink',
      'Default-scale normal fit',
      'Inherited normal default scale',
    ])
      expect(find(name)?.autoFit, name).toEqual({
        mode: 'shrink',
        fontScale: 1,
        lineSpacingReduction: 0,
      });
    for (const name of ['No fit baseline', 'Local no-fit overrides inherited normal'])
      expect(find(name)?.autoFit, name).toEqual({ mode: 'none' });
    for (const name of [
      'Wrapped shape resize',
      'No-wrap shape resize',
      'Resize top anchor',
      'Resize middle anchor',
      'Resize bottom anchor',
      'Resize rotated top',
      'Resize rotated middle',
      'Resize rotated bottom',
    ])
      expect(find(name)?.autoFit, name).toEqual({ mode: 'resize' });
    expect(find('No-wrap shape resize').textFrame?.wrap).toBe('none');
    expect(
      ['Resize rotated top', 'Resize rotated middle', 'Resize rotated bottom'].map(
        (name) => find(name).rotation,
      ),
    ).toEqual([30, 30, 30]);
    expect(
      ['Resize top anchor', 'Resize middle anchor', 'Resize bottom anchor'].map(
        (name) => find(name).verticalAlign,
      ),
    ).toEqual(['top', 'middle', 'bottom']);
    expect(find('Probe fixed line spacing').paragraphs?.[0]).toMatchObject({
      lineSpacingPoints: 36,
    });
    expect(find('Probe fixed line spacing').paragraphs?.[0].lineSpacing).toBeUndefined();
    expect(
      find('Plain shrink')
        .paragraphs?.flatMap((p) => p.runs)
        .every((run) => run.fontSize === 30),
    ).toBe(true);
    expect(
      new Set(
        find('Mixed shrink')
          .paragraphs?.flatMap((p) => p.runs)
          .map((run) => run.fontSize),
      ),
    ).toEqual(new Set([42, 30, 20]));
  });

  it('preserves the native-rendered XML saved-scale probe factors, nominal rich fonts, spacing and geometry through PPTX export', async () => {
    const source = await readFile('tests/fixtures/powerpoint-autofit-saved-scale-probe.pptx');
    const imported = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    const texts = imported.deck.slides
      .flatMap((slide) => slide.elements)
      .filter((e) => e.type === 'text');
    const find = (name: string) => texts.find((e) => e.name === name)!;
    for (const name of ['Plain shrink', 'Mixed shrink', 'Bulleted shrink', 'Spaced shrink'])
      expect(find(name)?.autoFit, name).toEqual({
        mode: 'shrink',
        fontScale: 0.6,
        lineSpacingReduction: 0.2,
      });
    for (const name of [
      'Inherited normal default scale',
      'Probe scale and reduction',
      'Probe fixed line spacing',
      'Probe percent-string values',
    ])
      expect(find(name)?.autoFit, name).toEqual({
        mode: 'shrink',
        fontScale: 0.8,
        lineSpacingReduction: 0.2,
      });
    expect(find('Probe scale only').autoFit).toEqual({
      mode: 'shrink',
      fontScale: 0.8,
      lineSpacingReduction: 0,
    });
    expect(find('Local no-fit overrides inherited normal').autoFit).toEqual({ mode: 'none' });
    expect(find('Probe fixed line spacing').paragraphs?.[0].lineSpacingPoints).toBe(36);
    expect(find('Probe percent-string values').paragraphs?.[0].lineSpacing).toBe(1.5);
    expect(find('Spaced shrink').paragraphs?.[0]).toMatchObject({
      lineSpacing: 1.5,
      spaceBefore: 6,
      spaceAfter: 12,
    });
    expect(find('Probe paragraph spacing').paragraphs?.[0]).toMatchObject({
      spaceBefore: 10,
      spaceAfter: 20,
    });
    expect(
      new Set(
        find('Mixed shrink')
          .paragraphs?.flatMap((p) => p.runs)
          .map((run) => run.fontSize),
      ),
    ).toEqual(new Set([42, 30, 20]));
    const bytes = await buffer(await exportPptx(imported.deck));
    const again = await importPptx(bytes);
    for (let index = 0; index < imported.deck.slides.length; index++) {
      const projection = (deck: Deck) =>
        deck.slides[index].elements
          .filter((e) => e.type === 'text')
          .map((e) => ({
            name: e.name,
            autoFit: e.autoFit,
            paragraphs: e.paragraphs,
            x: e.x,
            y: e.y,
            width: e.width,
            height: e.height,
            rotation: e.rotation,
            textFrame: e.textFrame,
            verticalAlign: e.verticalAlign,
          }));
      expect(projection(again.deck)).toEqual(projection(imported.deck));
      expect(again.deck.slides[index].notes).toBe(imported.deck.slides[index].notes);
    }
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
      paragraphSpacingAtEdges: false,
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

  it.each(['contain', 'cover', 'stretch'] as const)(
    'exports %s using real pixel dimensions while retaining the full editable picture frame',
    async (fit) => {
      const deck = sample();
      const image = deck.slides[0].elements.find((element) => element.type === 'image')!;
      const raster = await readFile('tests/fixtures/picture-geometry-calibration.png');
      Object.assign(image, {
        src: `data:image/png;base64,${raster.toString('base64')}`,
        fit,
        x: 96,
        y: 192,
        width: 300,
        height: 300,
        opacity: 0.123456,
        alt: '',
      });
      deck.slides[0].elements = [image];
      const before = structuredClone(deck);
      const bytes = await buffer(await exportPptx(deck));
      expect(deck).toEqual(before);
      const again = (await importPptx(bytes)).deck.slides[0].elements[0] as ImageElement;
      expect(again).toMatchObject({
        x: 96,
        y: 192,
        width: 300,
        height: 300,
        fit: 'stretch',
        orientation: 'encoded',
        opacity: 0.123456,
        alt: '',
        src: image.src,
      });
      if (fit === 'contain') {
        expect(again.crop).toBeUndefined();
        expect(again.fillRect).toEqual({ left: 0, top: 0.25, right: 0, bottom: 0.25 });
      } else if (fit === 'cover') {
        expect(again.crop).toEqual({ left: 0.25, top: 0, right: 0.25, bottom: 0 });
        expect(again.fillRect).toBeUndefined();
      } else {
        expect(again.crop).toBeUndefined();
        expect(again.fillRect).toBeUndefined();
      }
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
      expect(xml).toContain('cx="2857500" cy="2857500"');
    },
  );

  it('preserves precise picture transforms, independent signed rectangles, explicit false flips, and embedded bytes', async () => {
    const deck = sample();
    const image = deck.slides[0].elements.find((element) => element.type === 'image')!;
    Object.assign(image, {
      x: 50000,
      y: -50000,
      width: 0.01,
      height: 99999,
      rotation: 720,
      orientation: 'encoded',
      fit: 'cover',
      crop: { left: -0.125, top: 0.1234567, right: 0 },
      fillRect: { top: 0.2, right: -0.3 },
      flipH: false,
      flipV: true,
    });
    deck.slides[0].elements = [image];
    const again = (await importPptx(await buffer(await exportPptx(deck)))).deck.slides[0]
      .elements[0] as ImageElement;
    expect(again).toMatchObject({
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      rotation: 720,
      crop: image.crop,
      fillRect: image.fillRect,
      flipH: false,
      flipV: true,
      src: image.src,
      orientation: 'encoded',
    });
    expect(pptxExportWarnings(deck).join(' ')).not.toContain('library unit limit');
  });

  it('materializes legacy EXIF display orientation once on export without changing the native source', async () => {
    const deck = sample();
    const image = deck.slides[0].elements.find((element) => element.type === 'image')!;
    const raster = await readFile('tests/fixtures/picture-geometry-exif-6.jpg');
    Object.assign(image, {
      src: `data:image/jpeg;base64,${raster.toString('base64')}`,
      fit: 'stretch',
      rotation: 37,
      flipH: true,
      crop: { left: 0.1, top: 0.2, right: -0.1 },
      fillRect: { bottom: 0.15 },
    });
    deck.slides[0].elements = [image];
    const before = structuredClone(image);
    const expected = materializeImageOrientation(image, 6);
    const again = (await importPptx(await buffer(await exportPptx(deck)))).deck.slides[0]
      .elements[0] as ImageElement;
    expect(image).toEqual(before);
    const { id, ...properties } = expected;
    expect(id).toBe(image.id);
    expect(again).toMatchObject(properties);
    expect(readImageDimensions(again.src)?.orientation).toBe(6);
  });

  it.each(['powerpoint-picture-geometry', 'powerpoint-picture-geometry-probe'])(
    'retains independent native picture geometry, raw raster axes, crop/fill rectangles and transparency from %s',
    async (name) => {
      const source = await readFile(`tests/fixtures/${name}.pptx`);
      const imported = await importPptx(
        source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
      );
      expect(imported.deck.slides).toHaveLength(9);
      const pictures = (deck: Deck) =>
        deck.slides
          .flatMap((slide) => slide.elements)
          .filter((element) => element.type === 'image');
      const initial = pictures(imported.deck);
      expect(initial).toHaveLength(36);
      expect(
        initial.every((picture) => picture.fit === 'stretch' && picture.orientation === 'encoded'),
      ).toBe(true);
      if (name === 'powerpoint-picture-geometry') {
        const find = (name: string) => initial.find((picture) => picture.name === name)!;
        expect(find('Asymmetric crop').crop).toEqual({
          left: 0.2,
          top: 0.1,
          right: 0.05,
          bottom: 0.25,
        });
        expect(find('Negative all edges').crop).toEqual({
          left: -0.25,
          top: -0.25,
          right: -0.25,
          bottom: -0.25,
        });
        expect(find('Rotate30 horizontal')).toMatchObject({ rotation: 30, flipH: true });
        expect(find('EXIF orientation 6')).toMatchObject({ rotation: 90 });
        expect(find('EXIF orientation 7')).toMatchObject({ rotation: 270, flipV: true });
        expect(readImageDimensions(find('EXIF orientation 6').src)).toMatchObject({
          width: 800,
          height: 400,
          orientation: 6,
        });
        expect(imported.warnings.join(' ')).toContain('Picture masks');
      } else {
        const find = (name: string) => initial.find((picture) => picture.name === name)!;
        expect(find('XML absent source rectangle').crop).toBeUndefined();
        expect(find('XML empty source rectangle').crop).toEqual({});
        expect(find('XML fill inset').fillRect).toEqual({
          left: 0.15,
          top: 0.2,
          right: 0.05,
          bottom: 0.1,
        });
        expect(find('XML percentage source').crop).toEqual({
          left: 0.2,
          top: 0.1,
          right: 0.05,
          bottom: 0.25,
        });
        expect(find('XML fill outset').fillRect).toEqual({
          left: -0.25,
          top: -0.25,
          right: -0.25,
          bottom: -0.25,
        });
        expect(find('XML image opacity fifty').opacity).toBe(0.5);
        expect(find('XML raw EXIF 6')).toMatchObject({ rotation: 0, orientation: 'encoded' });
        expect(readImageDimensions(find('XML raw EXIF 6').src)?.orientation).toBe(6);
        expect(imported.warnings.join(' ')).toContain('unspecified picture-fill modes');
        expect(imported.warnings.join(' ')).toContain('fixed fill rotation');
      }
      const output = await importPptx(await buffer(await exportPptx(imported.deck)));
      const canonical = (values: ImageElement[]) =>
        values.map(({ id, ...element }) => ({ ...element, id: undefined }));
      expect(canonical(pictures(output.deck))).toEqual(canonical(initial));
      expect(() => validateDeck(output.deck)).not.toThrow();
    },
    20000,
  );

  it.each([
    ['<a:tile/>', '', '', 'Tiled or unspecified picture-fill modes'],
    ['', '', '', 'Tiled or unspecified picture-fill modes'],
    ['<a:stretch/>', '<a:prstGeom prst="ellipse"/>', '', 'Picture masks'],
    [
      '<a:stretch/>',
      '<a:ln><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>',
      '',
      'Attached picture fills and borders',
    ],
    ['<a:stretch/>', '', '<a:duotone/>', 'Picture effects'],
    ['<a:srcRect l="75000" r="25000"/><a:stretch/>', '', '', 'Empty or inverted source cropping'],
    ['<a:srcRect l="100000" r="100000"/><a:stretch/>', '', '', 'Empty or inverted source cropping'],
    [
      '<a:stretch><a:fillRect t="50000" b="50000"/></a:stretch>',
      '',
      '',
      'Empty or inverted picture fill rectangles',
    ],
    [
      '<a:srcRect l="bad" r="999999999999%"/><a:stretch/>',
      '',
      '',
      'offsets outside the supported range',
    ],
  ])(
    'reports unsupported or degenerate picture mapping without losing the embedded source: %s %s %s',
    async (mapping, properties, effects, warning) => {
      const bytes = await fixture((zip) => {
        zip.file(
          'ppt/slides/slide12.xml',
          slide(
            `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture" descr="Raster"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="img">${effects}</a:blip>${mapping}</p:blipFill><p:spPr><a:xfrm flipH="true" flipV="false"><a:off x="914400" y="457200"/><a:ext cx="3657600" cy="914400"/></a:xfrm>${properties}</p:spPr></p:pic>`,
          ),
        );
        zip.file(
          'ppt/slides/_rels/slide12.xml.rels',
          rels(relationship('img', 'image', '../media/image.png')),
        );
        zip.file('ppt/media/image.png', png.split(',')[1], { base64: true });
      });
      const result = await importPptx(bytes);
      expect(result.warnings.join(' ')).toContain(warning);
      expect(result.warnings.join(' ')).not.toContain('without the flip');
      expect(result.deck.slides[0].elements[0]).toMatchObject({
        src: png,
        fit: 'stretch',
        orientation: 'encoded',
        flipH: true,
        flipV: false,
      });
      expect(() => validateDeck(result.deck)).not.toThrow();
    },
  );

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
