import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportPptx, importPptx, pptxExportWarnings } from './pptx';
import type { Deck, ElementBase, Theme } from './types';
import { validateDeck } from './model';
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

  it('reports unsupported animations and mixed formatting', async () => {
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
    expect(result.warnings.join(' ')).toContain('Mixed character formatting');
    expect(result.warnings.join(' ')).toContain('animations');
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
