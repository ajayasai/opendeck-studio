import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { contrastText, validateDeck } from './model';
import type {
  Deck,
  ElementBase,
  ImportResult,
  ShapeElement,
  Slide,
  SlideElement,
  Theme,
} from './types';

// ECMA-376: Open Packaging Conventions and PresentationML. Import deliberately
// creates an editable subset; it is not a lossless OOXML round-trip engine.
const EMU = 9525;
const MAX_INPUT = 50 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
const MAX_PART = 20 * 1024 * 1024;
const MAX_XML = 5 * 1024 * 1024;
const imagePattern = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
const identifier = () => crypto.randomUUID();
const hex = (color: string, fallback = 'FFFFFF') =>
  /^#[\da-f]{6}$/i.test(color) ? color.slice(1) : fallback;
const number = (value: string | null | undefined, fallback = 0) =>
  value != null && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const children = (node: Element | Document | undefined | null, name: string): Element[] =>
  node ? Array.from(node.children).filter((child) => child.localName === name) : [];
const child = (node: Element | Document | undefined | null, name: string) =>
  children(node, name)[0];
const descendants = (node: Element | Document | undefined | null, name: string): Element[] =>
  node ? Array.from(node.getElementsByTagNameNS('*', name)) : [];
const descendant = (node: Element | Document | undefined | null, name: string) =>
  descendants(node, name)[0];
const attr = (node: Element | undefined | null, name: string) => node?.getAttribute(name) ?? null;
const relationshipId = (node: Element | undefined | null, name = 'id') =>
  node
    ? (Array.from(node.attributes).find(
        (a) => a.localName === name && a.namespaceURI?.endsWith('/relationships'),
      )?.value ?? node.getAttribute(`r:${name}`))
    : null;

export function pptxExportWarnings(deck: Deck): string[] {
  const warnings: string[] = [];
  if (deck.slides.some((s) => s.elements.some((e) => e.animation !== 'none')))
    warnings.push('Element entrance animations are not written to PPTX.');
  if (
    deck.slides.some((s) =>
      s.elements.some(
        (e) => (e.type === 'table' || e.type === 'chart') && (e.rotation !== 0 || e.opacity !== 1),
      ),
    )
  )
    warnings.push('Table and chart rotation/opacity are not preserved in PPTX.');
  warnings.push(
    'Fonts and text wrapping can differ between browsers and PowerPoint. Check the exported deck before presenting.',
  );
  return warnings;
}

export async function exportPptx(deck: Deck): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'OPENDECK', width: deck.width / 96, height: deck.height / 96 });
  pptx.layout = 'OPENDECK';
  pptx.author = 'OpenDeck Studio';
  pptx.subject = 'Created with OpenDeck Studio';
  pptx.title = deck.title;
  pptx.company = 'OpenDeck';
  pptx.theme = { headFontFace: deck.theme.fontFamily, bodyFontFace: deck.theme.fontFamily };
  for (const source of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(source.background) };
    slide.hidden = source.hidden;
    if (source.notes) slide.addNotes(source.notes);
    for (const element of source.elements) {
      const pos = {
        x: element.x / 96,
        y: element.y / 96,
        w: element.width / 96,
        h: element.height / 96,
        rotate: element.rotation,
        objectName: element.name,
      };
      const transparency = Math.round((1 - element.opacity) * 100);
      if (element.type === 'text') {
        slide.addText(element.text, {
          ...pos,
          fontSize: element.fontSize,
          fontFace: element.fontFamily,
          color: hex(element.color, '172E29'),
          bold: element.bold,
          italic: element.italic,
          underline: { style: element.underline ? 'sng' : 'none' },
          align: element.align,
          valign: element.verticalAlign,
          margin: 0,
          breakLine: false,
          paraSpaceAfter: 0,
          lineSpacingMultiple: 1.16,
          fit: 'none',
          isTextBox: true,
        });
      } else if (element.type === 'shape') {
        const shapes = {
          rect: pptx.ShapeType.rect,
          roundRect: pptx.ShapeType.roundRect,
          ellipse: pptx.ShapeType.ellipse,
          triangle: pptx.ShapeType.triangle,
          line: pptx.ShapeType.line,
          arrow: pptx.ShapeType.rightArrow,
        };
        const linear = element.shape === 'line' || element.shape === 'arrow';
        slide.addShape(linear ? pptx.ShapeType.line : shapes[element.shape], {
          ...pos,
          ...(linear ? { y: pos.y + pos.h / 2, h: 0 } : {}),
          fill: {
            color: hex(element.fill),
            transparency: element.fill === 'transparent' ? 100 : transparency,
          },
          line: {
            color: hex(
              linear && element.stroke === 'transparent' ? element.fill : element.stroke,
              '174F43',
            ),
            width: (linear ? Math.max(2, element.strokeWidth) : element.strokeWidth) * 0.75,
            endArrowType: element.shape === 'arrow' ? 'arrow' : undefined,
            transparency:
              !linear && (element.stroke === 'transparent' || element.strokeWidth === 0)
                ? 100
                : transparency,
          },
        });
      } else if (element.type === 'image') {
        if (!imagePattern.test(element.src))
          throw new Error('Only embedded PNG, JPEG, GIF, or WebP images can be exported.');
        // PptxGenJS handles the intrinsic raster ratio for contain/cover sizing.
        slide.addImage({
          ...pos,
          data: element.src,
          altText: element.alt,
          transparency,
          sizing: { type: element.fit, w: pos.w, h: pos.h },
        });
      } else if (element.type === 'table') {
        const rows = element.rows.map((row, ri) =>
          row.map((text) => ({
            text,
            options: {
              bold: element.header && ri === 0,
              fill: {
                color:
                  element.header && ri === 0 ? hex(element.fill) : ri % 2 ? 'F4F6EF' : 'FFFFFF',
              },
              color:
                element.header && ri === 0
                  ? hex(contrastText(element.fill))
                  : hex(element.color, '172E29'),
            },
          })),
        );
        slide.addTable(rows, {
          x: pos.x,
          y: pos.y,
          w: pos.w,
          h: pos.h,
          fontFace: deck.theme.fontFamily,
          fontSize: element.fontSize,
          margin: 5,
          border: { color: 'D8DED9', pt: 0.5 },
          rowH: pos.h / Math.max(1, rows.length),
          colW: Array(rows[0]?.length ?? 1).fill(pos.w / Math.max(1, rows[0]?.length ?? 1)),
          autoPage: false,
          valign: 'middle',
        });
      } else {
        const type = element.chartType;
        slide.addChart(
          type,
          [{ name: element.name || 'Series', labels: element.labels, values: element.values }],
          {
            x: pos.x,
            y: pos.y,
            w: pos.w,
            h: pos.h,
            chartColors:
              element.chartType === 'pie'
                ? [hex(element.color, '174F43'), 'A4CBB1', 'D8E8B4', 'F2C879', 'D38C6B', '97ACBA']
                : [hex(element.color, '174F43')],
            chartArea: { fill: { color: 'FFFFFF' }, roundedCorners: false },
            plotArea: { fill: { color: 'FFFFFF' } },
            showLegend: element.chartType === 'pie',
            showTitle: false,
            showValue: true,
            catAxisLabelColor: '6D7B73',
            valAxisLabelColor: '6D7B73',
            dataLabelColor: '33443E',
            catAxisLabelFontSize: 11,
            valAxisLabelFontSize: 10,
            lineDataSymbol: element.chartType === 'line' ? 'circle' : 'none',
            lineDataSymbolSize: 5,
            barDir: 'col',
            showSerName: false,
            showPercent: false,
          },
        );
      }
    }
  }
  // PptxGenJS does not expose slide transitions or text alpha. Write the small,
  // standard PresentationML additions after generation, leaving native objects editable.
  const zip = await JSZip.loadAsync(
    (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer,
  );
  for (const [index, source] of deck.slides.entries()) {
    const path = `ppt/slides/slide${index + 1}.xml`;
    let xml = await zip.file(path)!.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    child(doc.documentElement, 'cSld')?.setAttribute('name', source.name);
    const tableSources = source.elements.filter((e) => e.type === 'table');
    descendants(doc, 'tbl').forEach((table, tableIndex) =>
      child(table, 'tblPr')?.setAttribute('firstRow', tableSources[tableIndex]?.header ? '1' : '0'),
    );
    const textShapes = descendants(doc, 'sp').filter(
      (sp) => attr(descendant(sp, 'cNvSpPr'), 'txBox') === '1',
    );
    const textSources = source.elements.filter((e) => e.type === 'text');
    textShapes.forEach((shape, textIndex) => {
      const opacity = textSources[textIndex]?.opacity ?? 1;
      if (opacity === 1) return;
      for (const property of descendants(shape, 'rPr')) {
        const rgb = child(child(property, 'solidFill'), 'srgbClr');
        if (!rgb) continue;
        const alpha = doc.createElementNS(rgb.namespaceURI, 'a:alpha');
        alpha.setAttribute('val', String(Math.round(opacity * 100000)));
        rgb.appendChild(alpha);
      }
    });
    xml = new XMLSerializer().serializeToString(doc);
    if (source.transition !== 'none') {
      const transition = source.transition === 'fade' ? '<p:fade/>' : '<p:push dir="l"/>';
      xml = xml.replace('</p:sld>', `<p:transition spd="med">${transition}</p:transition></p:sld>`);
    }
    zip.file(path, xml);
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

/** Check central-directory sizes before any decompression; ZIP64 is rejected. */
function preflight(data: ArrayBuffer): void {
  if (data.byteLength > MAX_INPUT) throw new Error('PPTX files must be smaller than 50 MB.');
  const view = new DataView(data);
  let eocd = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === data.byteLength
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This is not a valid PPTX ZIP package.');
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (
    view.getUint16(eocd + 4, true) !== 0 ||
    view.getUint16(eocd + 6, true) !== 0 ||
    count > 5000 ||
    count === 0xffff ||
    offset + directorySize > eocd
  )
    throw new Error('Unsupported or oversized PPTX archive.');
  const end = offset + directorySize;
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('Invalid PPTX package directory.');
    const flags = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    expanded += size;
    if (flags & 1 || size > MAX_PART || expanded > MAX_EXPANDED)
      throw new Error('PPTX contains encrypted or oversized content.');
    if (offset + 46 + nameLength + extraLength + commentLength > end)
      throw new Error('Invalid PPTX directory entry.');
    const name = new TextDecoder().decode(new Uint8Array(data, offset + 46, nameLength));
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..'))
      throw new Error('Unsafe path in PPTX package.');
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) throw new Error('Invalid PPTX package directory size.');
}

interface Relation {
  target: string;
  type: string;
  external: boolean;
}
type Relations = Map<string, Relation>;
type Colors = Record<string, string>;
type Warn = (message: string) => void;
interface Transform {
  x: number;
  y: number;
  sx: number;
  sy: number;
  rotation: number;
}
const identity: Transform = { x: 0, y: 0, sx: 1, sy: 1, rotation: 0 };

function packagePath(base: string, target: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.includes('\\') || /[?#\0]/.test(target))
    throw new Error('Unsafe PPTX relationship target.');
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('PPTX relationship escapes its package.');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function color(node: Element | undefined | null, colors: Colors, fallback: string): string {
  if (!node) return fallback;
  const c = node.localName.endsWith('Clr')
    ? node
    : Array.from(node.children).find((c) =>
        ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(c.localName),
      );
  if (!c) return fallback;
  const aliases: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };
  const value = attr(c, 'val') ?? '';
  let rgb =
    c.localName === 'schemeClr'
      ? colors[aliases[value] ?? value]
      : c.localName === 'sysClr'
        ? attr(c, 'lastClr')
        : value;
  if (!rgb || !/^[\da-f]{6}$/i.test(rgb)) return fallback;
  let channels = [0, 2, 4].map((start) => parseInt(rgb!.slice(start, start + 2), 16));
  for (const modifier of Array.from(c.children)) {
    const fraction = number(attr(modifier, 'val')) / 100000;
    if (modifier.localName === 'tint') channels = channels.map((c) => c + (255 - c) * fraction);
    if (modifier.localName === 'shade' || modifier.localName === 'lumMod')
      channels = channels.map((c) => c * fraction);
    if (modifier.localName === 'lumOff') channels = channels.map((c) => c + 255 * fraction);
  }
  return `#${channels
    .map((c) =>
      Math.round(clamp(c, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function shapeGeometry(
  node: Element,
  fallback: Element | undefined,
  transform: Transform,
): Pick<ElementBase, 'x' | 'y' | 'width' | 'height' | 'rotation'> {
  const xfrm =
    child(child(node, 'spPr'), 'xfrm') ??
    child(node, 'xfrm') ??
    child(child(fallback, 'spPr'), 'xfrm');
  const off = child(xfrm, 'off');
  const ext = child(xfrm, 'ext');
  return {
    x: clamp(transform.x + (number(attr(off, 'x'), 80 * EMU) / EMU) * transform.sx, -20000, 20000),
    y: clamp(transform.y + (number(attr(off, 'y'), 80 * EMU) / EMU) * transform.sy, -20000, 20000),
    width: clamp((number(attr(ext, 'cx'), 600 * EMU) / EMU) * transform.sx, 1, 20000),
    height: clamp((number(attr(ext, 'cy'), 100 * EMU) / EMU) * transform.sy, 1, 20000),
    rotation: (((number(attr(xfrm, 'rot')) / 60000 + transform.rotation) % 360) + 360) % 360,
  };
}

function base(node: Element, fallback: Element | undefined, transform: Transform): ElementBase {
  const metadata = descendant(node, 'cNvPr');
  const alpha = descendant(child(node, 'spPr'), 'alpha');
  return {
    id: identifier(),
    name: (attr(metadata, 'name') ?? 'Imported object').slice(0, 256),
    ...shapeGeometry(node, fallback, transform),
    opacity: clamp(number(attr(alpha, 'val'), 100000) / 100000, 0, 1),
    locked: false,
    animation: 'none',
  };
}

function textContent(body: Element | undefined): string {
  return children(body, 'p')
    .map((paragraph) => {
      const pPr = child(paragraph, 'pPr');
      const bullet = child(pPr, 'buChar');
      const prefix = bullet
        ? `${attr(bullet, 'char') ?? '•'} `
        : child(pPr, 'buAutoNum')
          ? '• '
          : '';
      return (
        prefix +
        Array.from(paragraph.children)
          .map((run) =>
            run.localName === 'br'
              ? '\n'
              : ['r', 'fld'].includes(run.localName)
                ? descendants(run, 't')
                    .map((t) => t.textContent ?? '')
                    .join('')
                : '',
          )
          .join('')
      );
    })
    .join('\n');
}

function placeholder(node: Element, templates: Element[]): Element | undefined {
  const ph = descendant(node, 'ph');
  if (!ph) return undefined;
  const idx = attr(ph, 'idx') ?? '0';
  const type = attr(ph, 'type') ?? 'obj';
  return (
    templates.find((template) => {
      const candidate = descendant(template, 'ph');
      return candidate && (attr(candidate, 'idx') ?? '0') === idx;
    }) ?? templates.find((template) => (attr(descendant(template, 'ph'), 'type') ?? 'obj') === type)
  );
}

export async function importPptx(
  data: ArrayBuffer,
  fileName = 'Imported presentation',
): Promise<ImportResult> {
  preflight(data);
  const zip = await JSZip.loadAsync(data);
  const warningSet = new Set<string>();
  const warn: Warn = (message) => {
    if (warningSet.size < 100) warningSet.add(message);
  };
  let readBytes = 0;
  const xmlCache = new Map<string, Document>();
  async function read(path: string): Promise<Uint8Array | undefined> {
    const part = zip.file(path);
    if (!part) return undefined;
    return new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let total = 0;
      let failed = false;
      // JSZip documents this streaming API, but its bundled Object typing omits it.
      const stream = (
        part as JSZip.JSZipObject & {
          internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
        }
      ).internalStream('uint8array');
      stream.on('data', (chunk) => {
        total += chunk.byteLength;
        readBytes += chunk.byteLength;
        if (total > MAX_PART || readBytes > MAX_EXPANDED) {
          failed = true;
          stream.pause();
          reject(new Error('PPTX expanded content exceeds the import limit.'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        if (failed) return;
        const bytes = new Uint8Array(total);
        let position = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, position);
          position += chunk.length;
        }
        resolve(bytes);
      });
      stream.resume();
    });
  }
  async function xml(path: string): Promise<Document | undefined> {
    if (xmlCache.has(path)) return xmlCache.get(path);
    const bytes = await read(path);
    if (!bytes) return undefined;
    if (bytes.byteLength > MAX_XML)
      throw new Error('A PPTX XML part exceeds the 5 MB import limit.');
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : 'utf-8';
    const source = new TextDecoder(encoding).decode(bytes);
    if (/<!\s*(DOCTYPE|ENTITY)/i.test(source))
      throw new Error('PPTX XML declarations with entities are not supported.');
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (descendant(doc, 'parsererror')) throw new Error(`Malformed XML in ${path}.`);
    xmlCache.set(path, doc);
    return doc;
  }
  async function relationships(path: string): Promise<Relations> {
    const segments = path.split('/');
    const name = segments.pop();
    const doc = await xml(`${segments.join('/')}/_rels/${name}.rels`);
    const result: Relations = new Map();
    for (const entry of descendants(doc, 'Relationship')) {
      const external = attr(entry, 'TargetMode') === 'External';
      const target = attr(entry, 'Target') ?? '';
      result.set(attr(entry, 'Id') ?? '', {
        target: external ? target : packagePath(path, target),
        type: attr(entry, 'Type') ?? '',
        external,
      });
    }
    return result;
  }
  const rootRels = await xml('_rels/.rels');
  const officeRel = descendants(rootRels, 'Relationship').find((r) =>
    (attr(r, 'Type') ?? '').endsWith('/officeDocument'),
  );
  if (attr(officeRel, 'TargetMode') === 'External')
    throw new Error('External presentation documents are not supported.');
  const presentationPath = officeRel
    ? packagePath('', attr(officeRel, 'Target') ?? '')
    : 'ppt/presentation.xml';
  const presentation = await xml(presentationPath);
  if (!presentation || presentation.documentElement.localName !== 'presentation')
    throw new Error('No presentation was found in this file.');
  const presentationRels = await relationships(presentationPath);
  const size = descendant(presentation, 'sldSz');
  const width = number(attr(size, 'cx'), 12192000) / EMU;
  const height = number(attr(size, 'cy'), 6858000) / EMU;
  if (width < 100 || height < 100 || width > 10000 || height > 10000)
    throw new Error('Unsupported slide dimensions.');
  const core = await xml('docProps/core.xml');
  const title = descendant(core, 'title')?.textContent?.trim() || fileName.replace(/\.pptx$/i, '');
  const theme: Theme = {
    id: 'imported',
    name: 'Imported',
    background: '#ffffff',
    foreground: '#172e29',
    accent: '#174f43',
    muted: '#6b7771',
    fontFamily: 'Arial',
  };
  const deck: Deck = {
    schemaVersion: 1,
    id: identifier(),
    title: title.slice(0, 256),
    width,
    height,
    theme,
    slides: [],
    updatedAt: new Date().toISOString(),
  };
  const slideIds = children(child(presentation.documentElement, 'sldIdLst'), 'sldId');
  if (slideIds.length === 0 || slideIds.length > 300)
    throw new Error('Import supports presentations containing 1–300 slides.');
  if (Object.keys(zip.files).some((p) => /vbaProject|activeX|embeddings\//i.test(p)))
    warn('Macros, ActiveX controls, and embedded OLE objects are not imported or executed.');
  if (Object.keys(zip.files).some((p) => /comments|commentAuthors/i.test(p)))
    warn('Comments and review metadata are not imported.');

  for (const [slideIndex, slideId] of slideIds.entries()) {
    const rel = presentationRels.get(relationshipId(slideId) ?? '');
    if (!rel || rel.external || !rel.type.endsWith('/slide'))
      throw new Error(`Slide ${slideIndex + 1} has an invalid relationship.`);
    const slideDoc = await xml(rel.target);
    if (!slideDoc) throw new Error(`Slide ${slideIndex + 1} is missing.`);
    const slideRels = await relationships(rel.target);
    const layoutRel = Array.from(slideRels.values()).find(
      (r) => !r.external && r.type.endsWith('/slideLayout'),
    );
    const layout = layoutRel ? await xml(layoutRel.target) : undefined;
    const layoutRels = layoutRel
      ? await relationships(layoutRel.target)
      : new Map<string, Relation>();
    const masterRel = Array.from(layoutRels.values()).find(
      (r) => !r.external && r.type.endsWith('/slideMaster'),
    );
    const master = masterRel ? await xml(masterRel.target) : undefined;
    const masterRels = masterRel
      ? await relationships(masterRel.target)
      : new Map<string, Relation>();
    const themeRel = Array.from(masterRels.values()).find(
      (r) => !r.external && r.type.endsWith('/theme'),
    );
    const themeDoc = themeRel ? await xml(themeRel.target) : undefined;
    const colors: Colors = {
      dk1: '000000',
      lt1: 'FFFFFF',
      dk2: '172E29',
      lt2: 'F5F5F0',
      accent1: '174F43',
      accent2: 'E2B875',
      accent3: '6C8D7E',
      accent4: 'A57AA7',
      accent5: '5C8DA8',
      accent6: 'D7745B',
    };
    const scheme = descendant(themeDoc, 'clrScheme');
    if (scheme)
      for (const entry of Array.from(scheme.children))
        colors[entry.localName] = color(
          entry,
          colors,
          `#${colors[entry.localName] ?? '000000'}`,
        ).slice(1);
    const font = (
      attr(child(descendant(themeDoc, 'minorFont'), 'latin'), 'typeface') || 'Arial'
    ).slice(0, 128);
    if (slideIndex === 0) {
      theme.fontFamily = font;
      theme.accent = `#${colors.accent1}`;
      theme.foreground = `#${colors.dk1}`;
    }
    const templates = [...descendants(layout, 'sp'), ...descendants(master, 'sp')];
    const bg =
      child(child(slideDoc.documentElement, 'cSld'), 'bg') ??
      child(child(layout?.documentElement, 'cSld'), 'bg') ??
      child(child(master?.documentElement, 'cSld'), 'bg');
    const background = color(descendant(bg, 'solidFill'), colors, '#ffffff');
    if (descendant(bg, 'blipFill') || descendant(bg, 'gradFill') || descendant(bg, 'bgRef'))
      warn('Picture, gradient, and style-reference slide backgrounds are simplified.');
    const slide: Slide = {
      id: identifier(),
      name: (
        attr(child(slideDoc.documentElement, 'cSld'), 'name') || `Slide ${slideIndex + 1}`
      ).slice(0, 256),
      background,
      elements: [],
      notes: '',
      transition: 'none',
      hidden: attr(slideDoc.documentElement, 'show') === '0',
    };
    const transition = child(slideDoc.documentElement, 'transition');
    if (transition) {
      if (child(transition, 'fade')) slide.transition = 'fade';
      else if (child(transition, 'push')) {
        slide.transition = 'slide';
        if (attr(child(transition, 'push'), 'dir') !== 'l')
          warn('Push-transition direction is simplified.');
      } else warn('Some PowerPoint slide transitions are not supported.');
    }
    if (descendant(slideDoc, 'timing'))
      warn('PowerPoint object animations and timing are not imported.');
    if (descendant(slideDoc, 'hlinkClick') || descendant(slideDoc, 'hlinkHover'))
      warn('Hyperlinks and interactive actions are not imported.');
    if (descendant(slideDoc, 'videoFile') || descendant(slideDoc, 'audioFile'))
      warn('Embedded audio and video are not imported.');
    if (descendant(slideDoc, 'extLst')) warn('Vendor-specific drawing extensions may be omitted.');
    if (templates.some((sp) => !descendant(sp, 'ph')))
      warn('Decorative master/layout objects are not imported.');

    async function parseShape(node: Element, transform: Transform): Promise<void> {
      if (slide.elements.length >= 1000)
        throw new Error('A slide exceeds the 1,000-object import limit.');
      if (node.localName === 'grpSp') {
        const xfrm = child(child(node, 'grpSpPr'), 'xfrm');
        const off = child(xfrm, 'off');
        const ext = child(xfrm, 'ext');
        const chOff = child(xfrm, 'chOff');
        const chExt = child(xfrm, 'chExt');
        const sx = number(attr(ext, 'cx'), 1) / Math.max(1, number(attr(chExt, 'cx'), 1));
        const sy = number(attr(ext, 'cy'), 1) / Math.max(1, number(attr(chExt, 'cy'), 1));
        const group: Transform = {
          x:
            transform.x +
            ((number(attr(off, 'x')) - number(attr(chOff, 'x')) * sx) / EMU) * transform.sx,
          y:
            transform.y +
            ((number(attr(off, 'y')) - number(attr(chOff, 'y')) * sy) / EMU) * transform.sy,
          sx: sx * transform.sx,
          sy: sy * transform.sy,
          rotation: transform.rotation + number(attr(xfrm, 'rot')) / 60000,
        };
        warn(
          'Grouped objects are imported as individual editable objects; rotated/flipped groups may differ.',
        );
        for (const nested of Array.from(node.children))
          if (['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(nested.localName))
            await parseShape(nested, group);
        return;
      }
      const template = placeholder(node, templates);
      const geometry = base(node, template, transform);
      const properties = child(node, 'spPr');
      if (
        descendant(properties, 'gradFill') ||
        descendant(properties, 'pattFill') ||
        descendant(properties, 'effectLst') ||
        descendant(properties, 'custGeom')
      )
        warn('Gradients, patterns, effects, and custom geometry are simplified.');
      if (
        attr(descendant(properties, 'xfrm'), 'flipH') === '1' ||
        attr(descendant(properties, 'xfrm'), 'flipV') === '1'
      )
        warn('Flipped objects are imported without the flip.');
      if (node.localName === 'sp' || node.localName === 'cxnSp') {
        const body = child(node, 'txBody');
        const text = textContent(body);
        const preset =
          attr(child(properties, 'prstGeom'), 'prst') ??
          (node.localName === 'cxnSp' ? 'line' : 'rect');
        const shapeMap: Record<string, ShapeElement['shape']> = {
          rect: 'rect',
          roundRect: 'roundRect',
          ellipse: 'ellipse',
          triangle: 'triangle',
          line: 'line',
          rightArrow: 'arrow',
          straightConnector1: 'line',
        };
        const solidFill = child(properties, 'solidFill');
        const line = child(properties, 'ln');
        const isTextBox = attr(descendant(node, 'cNvSpPr'), 'txBox') === '1';
        if (!isTextBox && (!text || solidFill || line)) {
          if (!shapeMap[preset])
            warn(`Unsupported shape geometry “${preset}” was approximated by a rectangle.`);
          let kind = shapeMap[preset] ?? 'rect';
          const lineEnd = child(line, 'tailEnd') ?? child(line, 'headEnd');
          if (kind === 'line' && attr(lineEnd, 'type') && attr(lineEnd, 'type') !== 'none')
            kind = 'arrow';
          if (preset === 'rightArrow') warn('Filled block arrows are approximated as line arrows.');
          let lineGeometry = {};
          if (kind === 'line' || (kind === 'arrow' && preset !== 'rightArrow')) {
            const xfrm = child(properties, 'xfrm');
            const ext = child(xfrm, 'ext');
            const dx = (number(attr(ext, 'cx')) / EMU) * transform.sx;
            const dy = (number(attr(ext, 'cy')) / EMU) * transform.sy;
            const length = Math.max(1, Math.hypot(dx, dy));
            lineGeometry = {
              x: geometry.x + dx / 2 - length / 2,
              y: geometry.y + dy / 2 - 10,
              width: length,
              height: 20,
              rotation: geometry.rotation + (Math.atan2(dy, dx) * 180) / Math.PI,
            };
          }
          slide.elements.push({
            ...geometry,
            ...lineGeometry,
            type: 'shape',
            shape: kind,
            fill: child(properties, 'noFill')
              ? 'transparent'
              : color(solidFill, colors, text ? 'transparent' : theme.accent),
            stroke: child(line, 'noFill')
              ? 'transparent'
              : color(child(line, 'solidFill'), colors, 'transparent'),
            strokeWidth: child(line, 'noFill') ? 0 : clamp(number(attr(line, 'w')) / EMU, 0, 100),
          });
        }
        if (text || isTextBox) {
          const paragraphs = children(body, 'p');
          const first = paragraphs[0];
          const rPr =
            descendant(body, 'rPr') ??
            descendant(body, 'defRPr') ??
            descendant(child(template, 'txBody'), 'rPr') ??
            descendant(child(template, 'txBody'), 'defRPr');
          const props = child(first, 'pPr');
          const bodyPr = child(body, 'bodyPr');
          const fontSize = clamp(number(attr(rPr, 'sz'), 2400) / 100, 1, 400);
          const align = attr(props, 'algn');
          const anchor = attr(bodyPr, 'anchor');
          const fontFamily = (attr(child(rPr, 'latin'), 'typeface') || font).slice(0, 128);
          const styles = descendants(body, 'rPr').map((r) =>
            [
              attr(r, 'sz'),
              attr(r, 'b'),
              attr(r, 'i'),
              color(child(r, 'solidFill'), colors, theme.foreground),
              attr(child(r, 'latin'), 'typeface'),
            ].join('|'),
          );
          if (new Set(styles).size > 1)
            warn('Mixed character formatting within text boxes is flattened to the first style.');
          if (paragraphs.some((p) => child(child(p, 'pPr'), 'buAutoNum')))
            warn('Automatic numbered lists are converted to bullet text.');
          const alpha = descendant(child(rPr, 'solidFill'), 'alpha');
          slide.elements.push({
            ...geometry,
            id: identifier(),
            type: 'text',
            text: text.slice(0, 100000),
            fontSize,
            fontFamily: fontFamily.startsWith('+') ? font : fontFamily,
            color: color(child(rPr, 'solidFill'), colors, theme.foreground),
            bold: attr(rPr, 'b') === '1',
            italic: attr(rPr, 'i') === '1',
            underline: !!attr(rPr, 'u') && attr(rPr, 'u') !== 'none',
            align: align === 'ctr' ? 'center' : align === 'r' ? 'right' : 'left',
            verticalAlign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
            opacity: alpha
              ? clamp(number(attr(alpha, 'val'), 100000) / 100000, 0, 1)
              : geometry.opacity,
          });
        }
      } else if (node.localName === 'pic') {
        const blip = descendant(node, 'blip');
        const imageRel = slideRels.get(
          relationshipId(blip, 'embed') ?? relationshipId(blip, 'link') ?? '',
        );
        if (!imageRel || imageRel.external) {
          warn('Linked or missing images were skipped. No remote image was fetched.');
          return;
        }
        const extension = imageRel.target.split('.').pop()?.toLowerCase();
        const mime = extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension;
        if (!mime || !['png', 'jpeg', 'gif', 'webp'].includes(mime)) {
          warn(
            'Unsupported vector or raster images (including SVG, EMF, WMF, and TIFF) were skipped.',
          );
          return;
        }
        const bytes = await read(imageRel.target);
        if (!bytes) {
          warn('A missing image was skipped.');
          return;
        }
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        const crop = descendant(node, 'srcRect');
        if (crop && ['l', 'r', 't', 'b'].some((key) => number(attr(crop, key)) !== 0))
          warn('Image cropping is approximated by fitting the full image to its frame.');
        const alpha = child(blip, 'alphaModFix');
        slide.elements.push({
          ...geometry,
          type: 'image',
          src: `data:image/${mime};base64,${btoa(binary)}`,
          alt: (attr(descendant(node, 'cNvPr'), 'descr') ?? '').slice(0, 2000),
          fit: 'contain',
          opacity: alpha
            ? clamp(number(attr(alpha, 'amt'), 100000) / 100000, 0, 1)
            : geometry.opacity,
        });
      } else if (node.localName === 'graphicFrame') {
        const table = descendant(node, 'tbl');
        const chart = descendant(node, 'chart');
        if (table) {
          const tableRows = children(table, 'tr');
          const rows = tableRows.map((row) =>
            children(row, 'tc').map((cell) => textContent(child(cell, 'txBody')).slice(0, 10000)),
          );
          if (rows.length > 100 || rows.some((r) => r.length > 40))
            throw new Error('A table exceeds the 100-row / 40-column import limit.');
          if (rows.length && rows[0].length) {
            const columns = Math.max(...rows.map((r) => r.length));
            for (const row of rows) while (row.length < columns) row.push('');
            const header = attr(child(table, 'tblPr'), 'firstRow') === '1';
            const rPr = descendant(tableRows[header && tableRows.length > 1 ? 1 : 0], 'rPr');
            const headerFill = child(child(children(tableRows[0], 'tc')[0], 'tcPr'), 'solidFill');
            if (
              descendants(table, 'tc').some(
                (c) =>
                  attr(c, 'gridSpan') ||
                  attr(c, 'rowSpan') ||
                  attr(c, 'hMerge') === '1' ||
                  attr(c, 'vMerge') === '1',
              )
            )
              warn('Merged table cells are flattened into a rectangular grid.');
            warn('Table styling and unequal row/column sizes are simplified.');
            slide.elements.push({
              ...geometry,
              type: 'table',
              rows,
              header,
              color: color(child(rPr, 'solidFill'), colors, theme.foreground),
              fill: color(headerFill, colors, theme.accent),
              fontSize: clamp(number(attr(rPr, 'sz'), 1600) / 100, 1, 400),
            });
          }
        } else if (chart) {
          const chartRel = slideRels.get(relationshipId(chart) ?? '');
          if (!chartRel || chartRel.external) {
            warn('A linked or missing chart was skipped.');
            return;
          }
          const chartDoc = await xml(chartRel.target);
          const plot = descendant(chartDoc, 'plotArea');
          const chartNode =
            plot &&
            Array.from(plot.children).find((n) =>
              ['barChart', 'lineChart', 'pieChart'].includes(n.localName),
            );
          if (!chartNode) {
            warn('An unsupported chart type was skipped.');
            return;
          }
          const series = children(chartNode, 'ser');
          const first = series[0];
          if (!first) return;
          if (series.length > 1) warn('Only the first data series of each chart is imported.');
          const cacheValues = (container: Element | undefined) =>
            descendants(container, 'pt')
              .sort((a, b) => number(attr(a, 'idx')) - number(attr(b, 'idx')))
              .map((pt) => child(pt, 'v')?.textContent ?? '');
          const labels = cacheValues(child(first, 'cat')).map((label) => label.slice(0, 1000));
          const values = cacheValues(child(first, 'val')).map((value) =>
            clamp(number(value), -1e12, 1e12),
          );
          if (!values.length) {
            warn('A chart without cached values was skipped.');
            return;
          }
          if (values.length > 1000)
            throw new Error('A chart exceeds the 1,000-point import limit.');
          while (labels.length < values.length) labels.push(`Item ${labels.length + 1}`);
          let chartType: 'pie' | 'line' | 'bar' =
            chartNode.localName === 'pieChart'
              ? 'pie'
              : chartNode.localName === 'lineChart'
                ? 'line'
                : 'bar';
          if (
            chartType === 'pie' &&
            (values.some((value) => value < 0) || !values.some((value) => value > 0))
          ) {
            chartType = 'bar';
            warn(
              'A pie chart with negative or all-zero values was imported as a bar chart so its data remains visible.',
            );
          }
          slide.elements.push({
            ...geometry,
            type: 'chart',
            chartType,
            labels: labels.slice(0, values.length),
            values,
            color: color(child(child(first, 'spPr'), 'solidFill'), colors, theme.accent),
          });
          warn('Chart styling, axes, and workbook links are simplified to editable cached data.');
        } else warn('SmartArt, equations, and other unsupported graphic objects were skipped.');
      }
    }
    const tree = child(child(slideDoc.documentElement, 'cSld'), 'spTree');
    for (const shape of Array.from(tree?.children ?? []))
      if (['sp', 'cxnSp', 'pic', 'graphicFrame', 'grpSp'].includes(shape.localName))
        await parseShape(shape, identity);
    const notesRel = Array.from(slideRels.values()).find(
      (r) => !r.external && r.type.endsWith('/notesSlide'),
    );
    if (notesRel) {
      const notes = await xml(notesRel.target);
      slide.notes = descendants(notes, 'sp')
        .filter((sp) => attr(descendant(sp, 'ph'), 'type') === 'body')
        .map((sp) => textContent(child(sp, 'txBody')))
        .join('\n')
        .slice(0, 100000);
    }
    deck.slides.push(slide);
  }
  warn(
    'PPTX import is an editable approximation. Font substitution, text wrapping, and inherited styles can differ; keep the original file.',
  );
  return { deck: validateDeck(deck), warnings: Array.from(warningSet) };
}
