import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { contrastText, validateDeck } from './model';
import { getParagraphs, plainText, safeHyperlink } from './richText';
import { resolveTextFrame } from './textFrame';
import { resolveAutoFit } from './textFit';
import { gradientRenderingWarnings } from './gradient';
import { readImageDimensions } from './imageDimensions';
import { fitToRects, imageGeometry } from './imageGeometry';
import { materializeImageOrientation } from './imageOrientation';
import {
  DEFAULT_TEXT_CORNER_RADIUS,
  resolveTextDecoration,
  TEXT_LINE_DASHES,
} from './textDecoration';
import type {
  Deck,
  ElementBase,
  ImportResult,
  ShapeElement,
  Slide,
  SlideElement,
  Theme,
  TextElement,
  TextParagraph,
  TextRun,
  TextAutoFit,
  TextDecoration,
  GradientFill,
  RelativeGradientRect,
  ImageElement,
  ImageRect,
} from './types';

// ECMA-376: Open Packaging Conventions and PresentationML. Import deliberately
// creates an editable subset; it is not a lossless OOXML round-trip engine.
const EMU = 9525;
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MAX_INPUT = 50 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
const MAX_PART = 20 * 1024 * 1024;
const MAX_XML = 5 * 1024 * 1024;
const imagePattern = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
const verticalClipWarning =
  'PowerPoint can omit whole lines that cross the inset content bottom when vertical overflow is clipped; browser clipping may show partial or additional lines.';
const autoFitWarning =
  'Automatic text fitting can reflow differently in other applications because font metrics and line layout differ.';
const nativeDash = (dash: string) => dash.replace(/^longDash/, 'lgDash');
const modelDash = (dash: string) => dash.replace(/^lgDash/, 'longDash');
const sparseGradientWarning =
  'Gradients with fewer than two stops are exported as an equivalent two-stop solid ramp so PowerPoint can open the file.';
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

function drawingNode(
  doc: Document,
  name: string,
  attributes: Record<string, string | number> = {},
): Element {
  const node = doc.createElementNS(DRAWING_NS, `a:${name}`);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** Office normally writes thousandths of a percent; retain finer percent input too. */
function fitPercentage(value: number): string {
  const units = value * 100000;
  return Math.abs(units - Math.round(units)) < 1e-7
    ? String(Math.round(units))
    : `${Number((value * 100).toPrecision(15))}%`;
}

function textRotationUnits(rotation: number): number {
  const units = Math.round(rotation * 60000);
  // DrawingML rot is a signed 32-bit angle; the native model permits more turns.
  // Keep a full turn nonzero because shape fitting distinguishes it from zero.
  return units >= -2147483648 && units <= 2147483647
    ? units
    : Math.round((rotation % 360 || Math.sign(rotation) * 360) * 60000);
}

function pictureRects(element: ImageElement): { crop?: ImageRect; fillRect?: ImageRect } {
  if (element.crop !== undefined || element.fillRect !== undefined || element.fit === 'stretch')
    return { crop: element.crop, fillRect: element.fillRect };
  const dimensions = readImageDimensions(element.src);
  const rectangles =
    dimensions &&
    fitToRects(element.width, element.height, dimensions.width, dimensions.height, element.fit);
  if (!rectangles)
    throw new Error(
      `Cannot determine embedded image dimensions for “${element.name}”; choose stretch or replace the unreadable image.`,
    );
  return rectangles;
}

function writePicture(doc: Document, picture: Element, source: ImageElement): void {
  source = materializeImageOrientation(source, readImageDimensions(source.src)?.orientation);
  const properties = child(picture, 'spPr');
  const fill = child(picture, 'blipFill');
  const blip = child(fill, 'blip');
  if (!properties || !fill || !blip) return;
  const transform = drawingNode(doc, 'xfrm', {
    ...(source.rotation !== 0 ? { rot: textRotationUnits(source.rotation) } : {}),
    ...(source.flipH !== undefined ? { flipH: source.flipH ? '1' : '0' } : {}),
    ...(source.flipV !== undefined ? { flipV: source.flipV ? '1' : '0' } : {}),
  });
  transform.append(
    drawingNode(doc, 'off', { x: Math.round(source.x * EMU), y: Math.round(source.y * EMU) }),
    drawingNode(doc, 'ext', {
      cx: Math.round(source.width * EMU),
      cy: Math.round(source.height * EMU),
    }),
  );
  const previous = child(properties, 'xfrm');
  if (previous) previous.replaceWith(transform);
  else properties.prepend(transform);
  // Derive display geometry without resizing the editable frame or changing source pixels.
  const rectangles = pictureRects(source);
  const rect = (name: string, value: ImageRect) =>
    drawingNode(
      doc,
      name,
      Object.fromEntries(
        Object.entries(value).map(([key, ratio]) => [key[0], fitPercentage(ratio!)]),
      ),
    );
  const stretch = drawingNode(doc, 'stretch');
  if (rectangles.fillRect !== undefined) stretch.appendChild(rect('fillRect', rectangles.fillRect));
  blip.replaceChildren(drawingNode(doc, 'alphaModFix', { amt: fitPercentage(source.opacity) }));
  fill.replaceChildren(
    blip,
    ...(rectangles.crop !== undefined ? [rect('srcRect', rectangles.crop)] : []),
    stretch,
  );
  // PptxGenJS substitutes its media filename when altText is empty.
  child(child(picture, 'nvPicPr'), 'cNvPr')?.setAttribute('descr', source.alt);
}

function writeGradient(doc: Document, gradient: GradientFill, opacity: number): Element {
  const node = drawingNode(doc, 'gradFill', {
    ...(gradient.flip !== undefined ? { flip: gradient.flip } : {}),
    ...(gradient.rotateWithShape !== undefined
      ? { rotWithShape: gradient.rotateWithShape ? '1' : '0' }
      : {}),
  });
  const stops = drawingNode(doc, 'gsLst');
  const sourceStops =
    gradient.stops.length >= 2
      ? gradient.stops
      : [
          { ...(gradient.stops[0] ?? { color: '#000000', opacity: 1 }), position: 0 },
          { ...(gradient.stops[0] ?? { color: '#000000', opacity: 1 }), position: 1 },
        ];
  for (const stop of sourceStops) {
    const entry = drawingNode(doc, 'gs', { pos: fitPercentage(stop.position) });
    const rgb = drawingNode(doc, 'srgbClr', { val: hex(stop.color) });
    rgb.appendChild(drawingNode(doc, 'alpha', { val: fitPercentage(stop.opacity * opacity) }));
    entry.appendChild(rgb);
    stops.appendChild(entry);
  }
  node.appendChild(stops);
  const rect = (name: string, value: RelativeGradientRect) =>
    drawingNode(
      doc,
      name,
      Object.fromEntries(
        (['left', 'top', 'right', 'bottom'] as const)
          .filter((side) => value[side] !== undefined)
          .map((side) => [side[0], fitPercentage(value[side]!)]),
      ),
    );
  if (gradient.kind === 'linear')
    node.appendChild(
      drawingNode(doc, 'lin', {
        ...(gradient.angle !== undefined
          ? { ang: Math.min(21599999, Math.round(gradient.angle * 60000)) }
          : {}),
        ...(gradient.scaled !== undefined ? { scaled: gradient.scaled ? '1' : '0' } : {}),
      }),
    );
  else {
    const path = drawingNode(
      doc,
      'path',
      gradient.path !== undefined ? { path: gradient.path } : {},
    );
    if (gradient.fillToRect !== undefined)
      path.appendChild(rect('fillToRect', gradient.fillToRect));
    node.appendChild(path);
  }
  if (gradient.tileRect !== undefined) node.appendChild(rect('tileRect', gradient.tileRect));
  return node;
}

function writePaint(doc: Document, value: TextDecoration['fill'], opacity = 1): Element {
  if (!value) return drawingNode(doc, 'noFill');
  if (value.gradient) return writeGradient(doc, value.gradient, value.opacity * opacity);
  const fill = drawingNode(doc, 'solidFill');
  const rgb = drawingNode(doc, 'srgbClr', { val: hex(value.color) });
  rgb.appendChild(drawingNode(doc, 'alpha', { val: fitPercentage(value.opacity * opacity) }));
  fill.appendChild(rgb);
  return fill;
}

function replacePaint(parent: Element, paint: Element): void {
  const previous = paintChild(parent);
  if (previous) previous.replaceWith(paint);
  else if (parent.localName === 'ln') parent.prepend(paint);
  else
    parent.insertBefore(
      paint,
      Array.from(parent.children).find((child) =>
        ['ln', 'effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'].includes(child.localName),
      ) ?? null,
    );
}

function writeTextBody(
  doc: Document,
  shape: Element,
  source: TextElement,
  relations: Document,
): void {
  const body = child(shape, 'txBody');
  if (!body) return;
  const properties = child(shape, 'spPr');
  if (properties) {
    // PptxGenJS treats numeric positions/sizes >=100 as already being EMUs.
    // Write the native geometry explicitly, including very small/large boxes.
    const transform = child(properties, 'xfrm') ?? drawingNode(doc, 'xfrm');
    if (source.rotation !== 0)
      transform.setAttribute('rot', String(textRotationUnits(source.rotation)));
    else transform.removeAttribute('rot');
    transform.replaceChildren(
      drawingNode(doc, 'off', { x: Math.round(source.x * EMU), y: Math.round(source.y * EMU) }),
      drawingNode(doc, 'ext', {
        cx: Math.round(source.width * EMU),
        cy: Math.round(source.height * EMU),
      }),
    );
    if (!transform.parentNode) properties.prepend(transform);
    const decoration = resolveTextDecoration(source);
    const preset = drawingNode(doc, 'prstGeom', { prst: decoration.shape });
    const adjustments = drawingNode(doc, 'avLst');
    if (decoration.shape === 'roundRect')
      adjustments.appendChild(
        drawingNode(doc, 'gd', {
          name: 'adj',
          fmla: `val ${Math.round((decoration.cornerRadius ?? DEFAULT_TEXT_CORNER_RADIUS) * 100000)}`,
        }),
      );
    preset.appendChild(adjustments);
    const paint = (value: TextDecoration['fill']) => writePaint(doc, value, source.opacity);
    const line = drawingNode(doc, 'ln', { w: Math.round((decoration.line?.width ?? 0) * EMU) });
    if (decoration.line?.cap)
      line.setAttribute(
        'cap',
        decoration.line.cap === 'round' ? 'rnd' : decoration.line.cap === 'square' ? 'sq' : 'flat',
      );
    line.appendChild(paint(decoration.line));
    if (decoration.line)
      line.appendChild(drawingNode(doc, 'prstDash', { val: nativeDash(decoration.line.dash) }));
    if (decoration.line?.join)
      line.appendChild(
        drawingNode(
          doc,
          decoration.line.join,
          decoration.line.join === 'miter' && decoration.line.miterLimit !== undefined
            ? { lim: fitPercentage(decoration.line.miterLimit) }
            : {},
        ),
      );
    properties.replaceChildren(transform, preset, paint(decoration.fill), line);
  }
  const frame = resolveTextFrame(source);
  const bodyPr = drawingNode(doc, 'bodyPr', {
    lIns: Math.round(frame.insets.left * EMU),
    rIns: Math.round(frame.insets.right * EMU),
    tIns: Math.round(frame.insets.top * EMU),
    bIns: Math.round(frame.insets.bottom * EMU),
    wrap: frame.wrap,
    horzOverflow: frame.horizontalOverflow,
    vertOverflow: frame.verticalOverflow,
    spcFirstLastPara: frame.paragraphSpacingAtEdges === false ? '0' : '1',
  });
  bodyPr.setAttribute(
    'anchor',
    source.verticalAlign === 'middle' ? 'ctr' : source.verticalAlign === 'bottom' ? 'b' : 't',
  );
  const autoFit = resolveAutoFit(source);
  bodyPr.appendChild(
    autoFit.mode === 'shrink'
      ? drawingNode(doc, 'normAutofit', {
          fontScale: fitPercentage(autoFit.fontScale),
          lnSpcReduction: fitPercentage(autoFit.lineSpacingReduction),
        })
      : drawingNode(doc, autoFit.mode === 'resize' ? 'spAutoFit' : 'noAutofit'),
  );
  body.replaceChildren(bodyPr, drawingNode(doc, 'lstStyle'));
  const linkIds = new Map<string, string>();
  const usedIds = new Set(descendants(relations, 'Relationship').map((r) => attr(r, 'Id')));
  for (const rel of descendants(relations, 'Relationship')) {
    if (
      (attr(rel, 'Type') ?? '').endsWith('/hyperlink') &&
      attr(rel, 'TargetMode') === 'External'
    ) {
      const target = attr(rel, 'Target') ?? '';
      if (safeHyperlink(target)) linkIds.set(target, attr(rel, 'Id') ?? '');
    }
  }
  function hyperlinkId(url: string): string | undefined {
    const target = url;
    if (!safeHyperlink(target)) return undefined;
    if (linkIds.has(target)) return linkIds.get(target);
    let id = 1;
    while (usedIds.has(`rIdOpenDeckLink${id}`)) id++;
    const key = `rIdOpenDeckLink${id}`;
    usedIds.add(key);
    linkIds.set(target, key);
    const relation = relations.createElementNS(PACKAGE_NS, 'Relationship');
    relation.setAttribute('Id', key);
    relation.setAttribute('Type', `${RELATIONSHIP_NS}/hyperlink`);
    relation.setAttribute('Target', target);
    relation.setAttribute('TargetMode', 'External');
    relations.documentElement.appendChild(relation);
    return key;
  }
  function runProperties(name: 'rPr' | 'defRPr' | 'endParaRPr', run: Partial<TextRun>): Element {
    const props = drawingNode(doc, name, {
      lang: 'en-US',
      sz: Math.round((run.fontSize ?? source.fontSize) * 100),
      b: (run.bold ?? source.bold) ? '1' : '0',
      i: (run.italic ?? source.italic) ? '1' : '0',
      u: (run.underline ?? source.underline) ? 'sng' : 'none',
    });
    const fill = drawingNode(doc, 'solidFill');
    const rgb = drawingNode(doc, 'srgbClr', { val: hex(run.color ?? source.color, '172E29') });
    const textAlpha = source.opacity * (source.textOpacity ?? 1);
    if (textAlpha < 1)
      rgb.appendChild(drawingNode(doc, 'alpha', { val: fitPercentage(textAlpha) }));
    fill.appendChild(rgb);
    props.appendChild(fill);
    props.appendChild(drawingNode(doc, 'latin', { typeface: run.fontFamily ?? source.fontFamily }));
    if (run.hyperlink) {
      const id = hyperlinkId(run.hyperlink);
      if (id) {
        const link = drawingNode(doc, 'hlinkClick');
        link.setAttributeNS(RELATIONSHIP_NS, 'r:id', id);
        props.appendChild(link);
      }
    }
    return props;
  }
  let numberingStarts: Array<number | undefined> = [];
  let numberingValues: Array<number | undefined> = [];
  for (const paragraph of getParagraphs(source)) {
    const node = drawingNode(doc, 'p');
    const props = drawingNode(doc, 'pPr', {
      algn:
        paragraph.align === 'center'
          ? 'ctr'
          : paragraph.align === 'right'
            ? 'r'
            : paragraph.align === 'left'
              ? 'l'
              : source.align === 'center'
                ? 'ctr'
                : source.align === 'right'
                  ? 'r'
                  : 'l',
    });
    const spacing = drawingNode(doc, 'lnSpc');
    spacing.appendChild(
      paragraph.lineSpacingPoints !== undefined
        ? drawingNode(doc, 'spcPts', { val: Math.round(paragraph.lineSpacingPoints * 100) })
        : drawingNode(doc, 'spcPct', { val: Math.round((paragraph.lineSpacing ?? 1.16) * 100000) }),
    );
    props.appendChild(spacing);
    for (const [name, value] of [
      ['spcBef', paragraph.spaceBefore ?? 0],
      ['spcAft', paragraph.spaceAfter ?? 0],
    ] as const) {
      const space = drawingNode(doc, name);
      space.appendChild(drawingNode(doc, 'spcPts', { val: Math.round(value * 100) }));
      props.appendChild(space);
    }
    if (paragraph.bullet) {
      const bullet = paragraph.bullet;
      numberingStarts.length = bullet.level + 1;
      numberingValues.length = bullet.level + 1;
      const sequenceStart =
        bullet.kind === 'number' ? (bullet.start ?? numberingStarts[bullet.level] ?? 1) : undefined;
      numberingStarts[bullet.level] = sequenceStart;
      const displayedNumber =
        bullet.kind === 'number'
          ? (bullet.start ?? (numberingValues[bullet.level] ?? 0) + 1)
          : undefined;
      numberingValues[bullet.level] = displayedNumber;
      const size = paragraph.runs[0]?.fontSize ?? source.fontSize;
      const markerWidth =
        displayedNumber === undefined
          ? 1.2
          : Math.max(1.5, String(displayedNumber).length * 0.6 + 0.7);
      props.setAttribute('lvl', String(bullet.level));
      props.setAttribute(
        'marL',
        String(Math.round((bullet.level * 1.4 + markerWidth) * size * 12700)),
      );
      props.setAttribute('indent', String(-Math.round(size * markerWidth * 12700)));
      props.appendChild(drawingNode(doc, 'buClrTx'));
      props.appendChild(drawingNode(doc, 'buSzTx'));
      props.appendChild(drawingNode(doc, 'buFontTx'));
      props.appendChild(
        bullet.kind === 'number'
          ? drawingNode(doc, 'buAutoNum', { type: 'arabicPeriod', startAt: sequenceStart! })
          : drawingNode(doc, 'buChar', { char: bullet.character ?? '•' }),
      );
    } else {
      numberingStarts = [];
      numberingValues = [];
      props.appendChild(drawingNode(doc, 'buNone'));
    }
    props.appendChild(runProperties('defRPr', {}));
    node.appendChild(props);
    for (const run of paragraph.runs) {
      run.text.split('\n').forEach((part, index) => {
        if (index > 0) {
          const br = drawingNode(doc, 'br');
          br.appendChild(runProperties('rPr', run));
          node.appendChild(br);
        }
        if (!part) return;
        const runNode = drawingNode(doc, 'r');
        runNode.appendChild(runProperties('rPr', run));
        const text = drawingNode(doc, 't');
        text.textContent = part;
        runNode.appendChild(text);
        node.appendChild(runNode);
      });
    }
    node.appendChild(runProperties('endParaRPr', paragraph.runs.at(-1) ?? {}));
    body.appendChild(node);
  }
}

export function pptxExportWarnings(deck: Deck): string[] {
  const warnings: string[] = [];
  const gradients: Array<{ gradient: GradientFill; opacity: number }> = [];
  for (const slide of deck.slides) {
    if (slide.backgroundGradient)
      gradients.push({ gradient: slide.backgroundGradient, opacity: slide.backgroundOpacity ?? 1 });
    for (const element of slide.elements) {
      if (element.type === 'text') {
        for (const paint of [element.decoration?.fill, element.decoration?.line])
          if (paint?.gradient)
            gradients.push({ gradient: paint.gradient, opacity: paint.opacity * element.opacity });
      } else if (element.type === 'shape') {
        if (element.fillGradient)
          gradients.push({
            gradient: element.fillGradient,
            opacity: (element.fillOpacity ?? 1) * element.opacity,
          });
        if (element.strokeGradient)
          gradients.push({
            gradient: element.strokeGradient,
            opacity: (element.strokeOpacity ?? 1) * element.opacity,
          });
        if (element.shape === 'arrow' && (element.strokeGradient || element.fillGradient))
          warnings.push(
            'Gradient bounds around arrowheads are approximated; PowerPoint can extend the gradient beyond the line bounds.',
          );
      } else if (element.type === 'image') {
        const dimensions = readImageDimensions(element.src);
        const encoded = materializeImageOrientation(element, dimensions?.orientation);
        if (Math.abs(encoded.x) > 100000 || Math.abs(encoded.y) > 100000)
          warnings.push(
            'Materializing picture orientation places its frame outside the native coordinate bounds; re-import can limit those coordinates.',
          );
        const layout = imageGeometry(encoded, dimensions);
        if (layout?.reason) warnings.push(layout.reason);
        if (!layout)
          warnings.push(
            'An image has unreadable dimensions; contain/cover export requires a readable embedded raster.',
          );
        if (textRotationUnits(element.rotation) !== Math.round(element.rotation * 60000))
          warnings.push(
            'Picture rotations beyond the DrawingML angle range use an equivalent angle in PPTX.',
          );
      }
    }
  }
  for (const { gradient, opacity } of gradients) {
    if (gradient.stops.length < 2) warnings.push(sparseGradientWarning);
    warnings.push(
      ...gradientRenderingWarnings(
        opacity === 1
          ? gradient
          : {
              ...gradient,
              stops: gradient.stops.map((stop) => ({ ...stop, opacity: stop.opacity * opacity })),
            },
      ),
    );
  }
  if (
    deck.slides.some((slide) =>
      slide.elements.some((element) => {
        if (element.type === 'text' || element.type === 'image') return false;
        const linear =
          element.type === 'shape' && (element.shape === 'line' || element.shape === 'arrow');
        // Match the actual inch arguments, including centered horizontal lines.
        // Negative positions take the library's inches path and are unaffected.
        return [
          element.x / 96,
          element.y / 96 + (linear ? element.height / 96 / 2 : 0),
          element.width / 96,
          linear ? 0 : element.height / 96,
        ].some((value) => value >= 100);
      }),
    )
  )
    warnings.push(
      'Shapes, tables, or charts with positive positions or dimensions of 9,600 px or more may be misplaced or resized in PPTX export because of a library unit limit.',
    );
  if (
    deck.slides.some((slide) =>
      slide.elements.some(
        (element) =>
          element.type === 'text' && resolveTextFrame(element).verticalOverflow === 'clip',
      ),
    )
  )
    warnings.push(verticalClipWarning);
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
  for (const text of deck.slides
    .flatMap((slide) => slide.elements)
    .filter((element) => element.type === 'text')) {
    if (text.decoration?.line?.join === 'miter' && (text.decoration.line.miterLimit ?? 8) < 1)
      warnings.push(
        'Miter limits below 1 are retained in PPTX, but browser outlines use a minimum limit of 1.',
      );
    if (textRotationUnits(text.rotation) !== Math.round(text.rotation * 60000))
      warnings.push(
        'Text rotations beyond the DrawingML angle range use an equivalent angle in PPTX; a full turn remains nonzero.',
      );
    if (resolveAutoFit(text).mode !== 'none') warnings.push(autoFitWarning);
    if (getParagraphs(text).some((paragraph) => paragraph.runs.some((run) => run.hyperlink)))
      warnings.push(
        'PowerPoint may display hyperlinks using its theme link colors even when an explicit run color is stored.',
      );
    let starts: Array<number | undefined> = [];
    for (const paragraph of getParagraphs(text)) {
      if (!paragraph.bullet) {
        starts = [];
        continue;
      }
      const bullet = paragraph.bullet;
      starts.length = bullet.level + 1;
      if (bullet.kind === 'bullet') {
        starts[bullet.level] = undefined;
        continue;
      }
      if (bullet.start !== undefined && starts[bullet.level] === bullet.start) {
        warnings.push(
          'An adjacent numbered-list restart at the same sequence base may continue numbering in PowerPoint. Separate the sequences with an unnumbered paragraph to preserve the restart.',
        );
        break;
      }
      starts[bullet.level] = bullet.start ?? starts[bullet.level] ?? 1;
    }
  }
  warnings.push(
    'Fonts and text wrapping can differ between browsers and PowerPoint. Check the exported deck before presenting.',
  );
  return [...new Set(warnings)];
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
        slide.addText(element.text || ' ', {
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
        // Postprocessing writes source/target rectangles using actual raster dimensions.
        slide.addImage({
          ...pos,
          data: element.src,
          altText: element.alt,
          transparency,
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
    const relPath = `ppt/slides/_rels/slide${index + 1}.xml.rels`;
    const relXml = await zip.file(relPath)?.async('string');
    const relations = new DOMParser().parseFromString(
      relXml ?? `<Relationships xmlns="${PACKAGE_NS}"/>`,
      'application/xml',
    );
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
      const textSource = textSources[textIndex];
      if (textSource) writeTextBody(doc, shape, textSource, relations);
    });
    const imageSources = source.elements.filter((element) => element.type === 'image');
    descendants(doc, 'pic').forEach((picture, imageIndex) => {
      if (imageSources[imageIndex]) writePicture(doc, picture, imageSources[imageIndex]);
    });
    const ordinaryShapes = descendants(doc, 'sp').filter(
      (sp) => attr(descendant(sp, 'cNvSpPr'), 'txBox') !== '1',
    );
    const ordinarySources = source.elements.filter((element) => element.type === 'shape');
    ordinaryShapes.forEach((shape, shapeIndex) => {
      const element = ordinarySources[shapeIndex];
      const properties = child(shape, 'spPr');
      if (!element || !properties) return;
      const linear = element.shape === 'line' || element.shape === 'arrow';
      if (element.fillGradient !== undefined || element.fillOpacity !== undefined)
        replacePaint(
          properties,
          writePaint(
            doc,
            element.fill === 'transparent' && !element.fillGradient
              ? null
              : {
                  color: element.fill,
                  opacity: element.fillOpacity ?? 1,
                  gradient: element.fillGradient,
                },
            element.opacity,
          ),
        );
      const useFill = linear && element.stroke === 'transparent' && !element.strokeGradient;
      const gradient = element.strokeGradient ?? (useFill ? element.fillGradient : undefined);
      const alpha = useFill ? element.fillOpacity : element.strokeOpacity;
      if (gradient !== undefined || alpha !== undefined) {
        const line = child(properties, 'ln') ?? drawingNode(doc, 'ln');
        if (!line.parentNode) properties.appendChild(line);
        replacePaint(
          line,
          writePaint(
            doc,
            !linear && (element.stroke === 'transparent' || element.strokeWidth === 0) && !gradient
              ? null
              : {
                  color: useFill ? element.fill : element.stroke,
                  opacity: alpha ?? 1,
                  gradient,
                },
            element.opacity,
          ),
        );
      }
    });
    if (source.backgroundGradient !== undefined || source.backgroundOpacity !== undefined) {
      const root = child(doc.documentElement, 'cSld');
      if (root) {
        const bg = child(root, 'bg') ?? doc.createElementNS(PRESENTATION_NS, 'p:bg');
        const props = doc.createElementNS(PRESENTATION_NS, 'p:bgPr');
        props.appendChild(
          writePaint(doc, {
            color: source.background,
            opacity: source.backgroundOpacity ?? 1,
            gradient: source.backgroundGradient,
          }),
        );
        bg.replaceChildren(props);
        if (!bg.parentNode) root.prepend(bg);
      }
    }
    zip.file(relPath, new XMLSerializer().serializeToString(relations));
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
      ? (colors[value] ?? colors[aliases[value] ?? value])
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

type Paint = NonNullable<TextDecoration['fill']>;
interface PaintCandidate {
  node?: Element;
  reference?: Element;
  none?: boolean;
  unresolved?: boolean;
}
const paintNames = ['noFill', 'solidFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'];
const paintChild = (node: Element | undefined) =>
  node && Array.from(node.children).find((entry) => paintNames.includes(entry.localName));

function percentage(value: string | null, fallback = 0): number {
  if (value?.trim().endsWith('%')) return number(value.trim().slice(0, -1), fallback * 100) / 100;
  return number(value, fallback * 100000) / 100000;
}

function paintReference(
  ref: Element | undefined,
  kind: 'fill' | 'ln',
  themeDoc: Document | undefined,
): PaintCandidate | undefined {
  if (!ref) return undefined;
  const idx = number(attr(ref, 'idx'), -1);
  if (idx === 0 || (kind === 'fill' && idx === 1000)) return { none: true };
  const matrix = descendant(themeDoc, 'fmtScheme');
  const list = child(
    matrix,
    kind === 'ln' ? 'lnStyleLst' : idx > 1000 ? 'bgFillStyleLst' : 'fillStyleLst',
  );
  const style = list?.children[idx - (idx > 1000 && kind === 'fill' ? 1001 : 1)];
  return style ? { node: style, reference: ref } : { none: true, unresolved: true };
}

function shapePaintCandidates(
  nodes: Array<Element | undefined>,
  themeDoc: Document | undefined,
): { fill: PaintCandidate[]; line: PaintCandidate[] } {
  const fill: PaintCandidate[] = [],
    line: PaintCandidate[] = [];
  for (const node of nodes) {
    const properties = child(node, 'spPr');
    const directFill = paintChild(properties),
      directLine = child(properties, 'ln');
    if (directFill) fill.push({ node: directFill });
    const fillRef = paintReference(child(child(node, 'style'), 'fillRef'), 'fill', themeDoc);
    if (fillRef) fill.push(fillRef);
    if (directLine) line.push({ node: directLine });
    const lineRef = paintReference(child(child(node, 'style'), 'lnRef'), 'ln', themeDoc);
    if (lineRef) line.push(lineRef);
  }
  return { fill, line };
}

function readGradient(candidates: PaintCandidate[], colors: Colors, warn: Warn): GradientFill {
  const ratio = (value: string | null, fallback: number, label: string): number => {
    const source = value?.trim() ?? '';
    if (!/^[+-]?\d+$/.test(source) && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(source)) {
      warn(`Invalid or missing gradient ${label} used its default value.`);
      return fallback;
    }
    const result = percentage(source, fallback);
    if (!Number.isFinite(result)) {
      warn(`Invalid gradient ${label} used its default value.`);
      return fallback;
    }
    return result;
  };
  const chain: PaintCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.none || candidate.node?.localName !== 'gradFill') break;
    chain.push(candidate);
  }
  const firstAttr = (nodes: Array<Element | undefined>, name: string) =>
    nodes.map((node) => attr(node, name)).find((value) => value !== null);
  const nodes = chain.map((candidate) => candidate.node);
  const choiceNodes: Element[] = [];
  for (const node of nodes) {
    const choice =
      node && Array.from(node.children).find((entry) => ['lin', 'path'].includes(entry.localName));
    if (!choice) continue;
    if (choiceNodes[0] && choice.localName !== choiceNodes[0].localName) break;
    choiceNodes.push(choice);
  }
  const gradient: GradientFill = {
    kind: choiceNodes[0]?.localName === 'path' ? 'path' : 'linear',
    stops: [],
  };
  const listSource = chain.find((candidate) => child(candidate.node, 'gsLst'));
  if (!listSource)
    gradient.stops = [
      { position: 0, color: '#000000', opacity: 1 },
      { position: 1, color: '#FFFFFF', opacity: 1 },
    ];
  else {
    const entries = children(child(listSource.node, 'gsLst'), 'gs');
    if (entries.length > 256) warn('A gradient exceeded 256 stops; extra stops were omitted.');
    if (entries.length < 2)
      warn(
        'A gradient has fewer than two stops; PowerPoint requires a normalized two-stop ramp when this file is exported.',
      );
    const placeholder = listSource.reference
      ? decorationColor(listSource.reference, colors, warn)
      : undefined;
    gradient.stops = entries.slice(0, 256).map((entry) => {
      const position = ratio(attr(entry, 'pos'), 0, 'stop position');
      if (position < 0 || position > 1)
        warn('Gradient stop positions outside 0–100% were limited.');
      return {
        position: clamp(position, 0, 1),
        ...decorationColor(entry, colors, warn, placeholder),
      };
    });
  }
  const boolean = (value: string | undefined, name: string): boolean | undefined => {
    if (value === undefined) return undefined;
    if (['0', '1', 'false', 'true'].includes(value)) return value === '1' || value === 'true';
    warn(`Invalid gradient ${name} used false.`);
    return false;
  };
  const flip = firstAttr(nodes, 'flip');
  if (flip !== undefined) {
    if (['none', 'x', 'y', 'xy'].includes(flip)) gradient.flip = flip as GradientFill['flip'];
    else {
      warn('An unsupported gradient tile flip was imported as none.');
      gradient.flip = 'none';
    }
  }
  const rotate = boolean(firstAttr(nodes, 'rotWithShape'), 'rotation behavior');
  if (rotate !== undefined) gradient.rotateWithShape = rotate;
  const readRect = (rect: Element): RelativeGradientRect => {
    const result: RelativeGradientRect = {};
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      const value = attr(rect, side[0]);
      if (value === null) continue;
      const offset = ratio(value, 0, 'rectangle offset');
      if (offset < -21474.83648 || offset > 21474.83647)
        warn('Gradient rectangle offsets outside the supported range were limited.');
      result[side] = clamp(offset, -21474.83648, 21474.83647);
    }
    return result;
  };
  if (gradient.kind === 'linear') {
    const angle = firstAttr(choiceNodes, 'ang');
    if (angle !== undefined) {
      const valid = /^[+-]?\d+$/.test(angle.trim()) && Number.isFinite(Number(angle));
      if (!valid) warn('Invalid gradient angle used zero.');
      const value = valid ? Number(angle) / 60000 : 0;
      if (value < 0 || value >= 360) warn('A gradient angle outside one turn was normalized.');
      gradient.angle = value >= 0 && value < 360 ? value : ((value % 360) + 360) % 360;
    }
    const scaled = boolean(firstAttr(choiceNodes, 'scaled'), 'angle scaling');
    if (scaled !== undefined) gradient.scaled = scaled;
  } else {
    const path = firstAttr(choiceNodes, 'path');
    if (path !== undefined) {
      if (['circle', 'rect', 'shape'].includes(path)) gradient.path = path as GradientFill['path'];
      else {
        warn('An unsupported gradient path was imported as a shape path.');
        gradient.path = 'shape';
      }
    }
    const focus = choiceNodes.map((node) => child(node, 'fillToRect')).find(Boolean);
    if (focus) gradient.fillToRect = readRect(focus);
  }
  const tile = nodes.map((node) => child(node, 'tileRect')).find(Boolean);
  if (tile) gradient.tileRect = readRect(tile);
  for (const warning of gradientRenderingWarnings(gradient)) warn(warning);
  return gradient;
}

function readPaintCandidates(
  candidates: PaintCandidate[],
  colors: Colors,
  warn: Warn,
): Paint | null {
  const candidate = candidates[0];
  if (candidate?.unresolved)
    warn('An unresolved theme decoration reference was imported without its paint.');
  if (!candidate || candidate.none || candidate.node?.localName === 'noFill') return null;
  if (candidate.node?.localName === 'gradFill') {
    const gradient = readGradient(candidates, colors, warn);
    return { color: gradient.stops[0]?.color ?? '#000000', opacity: 1, gradient };
  }
  if (candidate.node?.localName !== 'solidFill') {
    warn('Pattern, picture, and group paints are not retained.');
    return null;
  }
  for (const source of candidates) {
    if (source.none || source.node?.localName !== 'solidFill') break;
    if (Array.from(source.node.children).some((entry) => entry.localName.endsWith('Clr')))
      return decorationColor(
        source.node,
        colors,
        warn,
        source.reference ? decorationColor(source.reference, colors, warn) : undefined,
      );
  }
  return decorationColor(candidate.node, colors, warn);
}

/** Materialize solid DrawingML paint; luminance/saturation operate in HSL, not RGB. */
function decorationColor(
  node: Element | undefined,
  colors: Colors,
  warn: Warn,
  placeholder?: Paint,
): Paint {
  const c = node?.localName.endsWith('Clr')
    ? node
    : node && Array.from(node.children).find((n) => n.localName.endsWith('Clr'));
  if (!c) {
    if (placeholder) return placeholder;
    warn(
      'An incomplete solid color had no supported inherited value; the theme background color was used.',
    );
    return { color: `#${colors.bg1 ?? colors.lt1 ?? 'FFFFFF'}`, opacity: 1 };
  }
  const aliases: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };
  const value = attr(c, 'val') ?? '';
  const preset: Record<string, string> = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    yellow: 'FFFF00',
    cyan: '00FFFF',
    magenta: 'FF00FF',
  };
  let rgb =
    c.localName === 'schemeClr'
      ? value === 'phClr'
        ? placeholder?.color.slice(1)
        : (colors[value] ?? colors[aliases[value]])
      : c.localName === 'sysClr'
        ? attr(c, 'lastClr')
        : c.localName === 'prstClr'
          ? preset[value]
          : value;
  let opacity = c.localName === 'schemeClr' && value === 'phClr' ? (placeholder?.opacity ?? 1) : 1;
  let channels: number[];
  const fromHsl = (hue: number, saturation: number, luminance: number): number[] => {
    const h = ((hue % 1) + 1) % 1;
    const s = clamp(saturation, 0, 1),
      l = clamp(luminance, 0, 1);
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((offset) => {
      const k = (offset + h * 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    });
  };
  const toHsl = (): number[] => {
    const [r, g, b] = channels;
    const hi = Math.max(...channels),
      lo = Math.min(...channels),
      delta = hi - lo;
    const l = (hi + lo) / 2;
    const h =
      delta === 0
        ? 0
        : hi === r
          ? ((g - b) / delta + 6) % 6
          : hi === g
            ? (b - r) / delta + 2
            : (r - g) / delta + 4;
    return [h / 6, delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)), l];
  };
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  if (c.localName === 'hslClr')
    channels = fromHsl(
      number(attr(c, 'hue')) / 21600000,
      percentage(attr(c, 'sat')),
      percentage(attr(c, 'lum')),
    );
  else if (c.localName === 'scrgbClr') {
    channels = ['r', 'g', 'b'].map((key) => srgb(clamp(percentage(attr(c, key)), 0, 1)));
  } else {
    if (!rgb || !/^[\da-f]{6}$/i.test(rgb)) {
      warn('An unsupported or unresolved decoration color was replaced with black.');
      rgb = '000000';
    }
    channels = [0, 2, 4].map((start) => parseInt(rgb!.slice(start, start + 2), 16) / 255);
  }
  for (const modifier of Array.from(c.children)) {
    const kind = modifier.localName,
      fraction = percentage(attr(modifier, 'val'));
    if (kind === 'alpha') opacity = fraction;
    else if (kind === 'alphaMod') opacity *= fraction;
    else if (kind === 'alphaOff') opacity += fraction;
    // Native theme-stop probes confirm tint/shade mix linear-light channels;
    // HSL luminance transforms above/below remain a different operation.
    else if (kind === 'tint')
      channels = channels.map((v) => srgb(clamp(linear(v) * fraction + 1 - fraction, 0, 1)));
    else if (kind === 'shade')
      channels = channels.map((v) => srgb(clamp(linear(v) * fraction, 0, 1)));
    else if (/^(lum|sat|hue)(Mod|Off)?$/.test(kind)) {
      const hsl = toHsl(),
        index = kind.startsWith('hue') ? 0 : kind.startsWith('sat') ? 1 : 2;
      const amount =
        index === 0 && !kind.endsWith('Mod') ? number(attr(modifier, 'val')) / 21600000 : fraction;
      hsl[index] = kind.endsWith('Mod')
        ? hsl[index] * amount
        : kind.endsWith('Off')
          ? hsl[index] + amount
          : amount;
      channels = fromHsl(hsl[0], hsl[1], hsl[2]);
    } else if (/^(red|green|blue)(Mod|Off)?$/.test(kind)) {
      const index = kind.startsWith('red') ? 0 : kind.startsWith('green') ? 1 : 2;
      channels[index] = kind.endsWith('Mod')
        ? channels[index] * fraction
        : kind.endsWith('Off')
          ? channels[index] + fraction
          : fraction;
    } else if (kind === 'inv') channels = channels.map((v) => 1 - v);
    else if (kind === 'comp') {
      const hsl = toHsl();
      channels = fromHsl(hsl[0] + 0.5, hsl[1], hsl[2]);
    } else warn(`Decoration color transform “${kind}” is not retained.`);
    channels = channels.map((v) => clamp(v, 0, 1));
    opacity = clamp(opacity, 0, 1);
  }
  return {
    color: `#${channels
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`,
    opacity,
  };
}

/** Resolve each supported property independently; explicit noFill is a stopping value. */
function readDecoration(
  nodes: Array<Element | undefined>,
  colors: Colors,
  themeDoc: Document | undefined,
  warn: Warn,
): TextDecoration {
  const { fill: fillCandidates, line: lineCandidates } = shapePaintCandidates(nodes, themeDoc);
  const fill = readPaintCandidates(fillCandidates, colors, warn);
  const linePaint = lineCandidates
    .map((candidate) =>
      candidate.none ? candidate : { ...candidate, node: paintChild(candidate.node) },
    )
    .filter((candidate) => candidate.none || candidate.node);
  const paint = readPaintCandidates(linePaint, colors, warn);
  const lineAttr = (name: string) =>
    lineCandidates.map((c) => attr(c.node, name)).find((v) => v !== null);
  const lineChoice = (names: string[]) =>
    lineCandidates.flatMap((c) =>
      c.node ? Array.from(c.node.children).filter((entry) => names.includes(entry.localName)) : [],
    )[0];
  let line: TextDecoration['line'] = null;
  if (paint) {
    const width = number(lineAttr('w')) / EMU;
    if (width < 0 || width > 100)
      warn('Text-box border widths outside the supported range were limited to 0–100 pixels.');
    if (width === 0)
      warn(
        'Zero-width or unspecified painted borders are device-dependent hairlines; their appearance can differ.',
      );
    const dash = lineChoice(['prstDash', 'custDash']);
    const dashName = modelDash(attr(dash, 'val') ?? 'solid');
    if (
      dash?.localName === 'custDash' ||
      !TEXT_LINE_DASHES.includes(dashName as NonNullable<TextDecoration['line']>['dash'])
    )
      warn('Custom or unsupported text-box border dashes are imported as solid lines.');
    line = {
      ...paint,
      width: clamp(width, 0, 100),
      dash: TEXT_LINE_DASHES.includes(dashName as NonNullable<TextDecoration['line']>['dash'])
        ? (dashName as NonNullable<TextDecoration['line']>['dash'])
        : 'solid',
    };
    const cap = lineAttr('cap');
    if (cap !== undefined) {
      if (['flat', 'rnd', 'sq'].includes(cap))
        line.cap = cap === 'rnd' ? 'round' : cap === 'sq' ? 'square' : 'flat';
      else warn('An unsupported text-box border cap was imported as flat.');
    }
    const join = lineChoice(['miter', 'bevel', 'round']);
    if (join) {
      line.join = join.localName as NonNullable<TextDecoration['line']>['join'];
      if (join.localName === 'miter' && attr(join, 'lim') !== null) {
        const limit = percentage(attr(join, 'lim'), 8);
        if (limit < 0 || limit > 21474.83647)
          warn('Text-box miter limits outside the supported range were limited.');
        line.miterLimit = clamp(limit, 0, 21474.83647);
        if (line.miterLimit < 1)
          warn(
            'Miter limits below 1 are retained in PPTX, but browser outlines use a minimum limit of 1.',
          );
      }
    }
    if (
      (lineAttr('cmpd') ?? 'sng') !== 'sng' ||
      (lineAttr('algn') ?? 'ctr') !== 'ctr' ||
      ['headEnd', 'tailEnd'].some((name) => {
        const end = lineChoice([name]);
        return end && (attr(end, 'type') ?? 'none') !== 'none';
      })
    )
      warn('Text-box border compound styles, alignment, and arrowheads are simplified.');
  }
  const geometry = nodes
    .map((node) => child(node, 'spPr'))
    .map(
      (props) =>
        props &&
        Array.from(props.children).find((entry) =>
          ['prstGeom', 'custGeom'].includes(entry.localName),
        ),
    )
    .find(Boolean);
  const preset = attr(geometry, 'prst') ?? 'rect';
  const supported =
    ['rect', 'roundRect', 'ellipse', 'triangle'].includes(preset) &&
    geometry?.localName !== 'custGeom';
  if (!supported)
    warn(`Unsupported text-container geometry “${preset}” uses a rectangular text frame.`);
  const decoration: TextDecoration = {
    shape: supported ? (preset as TextDecoration['shape']) : 'rect',
    fill,
    line,
  };
  if (decoration.shape === 'roundRect') {
    const adjustment = children(child(geometry, 'avLst'), 'gd').find(
      (entry) => attr(entry, 'name') === 'adj',
    );
    const formula = attr(adjustment, 'fmla');
    const match = formula?.match(/^val\s+([+-]?\d+)$/);
    if (formula && !match)
      warn('A formula-based rounded-corner adjustment was replaced with the default radius.');
    const radius = match ? Number(match[1]) / 100000 : DEFAULT_TEXT_CORNER_RADIUS;
    if (radius < 0 || radius > 0.5)
      warn('Rounded-corner adjustments outside the supported range were limited.');
    decoration.cornerRadius = clamp(radius, 0, 0.5);
    if (children(child(geometry, 'avLst'), 'gd').some((entry) => attr(entry, 'name') !== 'adj'))
      warn('Additional shape geometry adjustments are not retained.');
  } else if (
    children(child(geometry, 'avLst'), 'gd').some(
      (entry) =>
        !(
          decoration.shape === 'triangle' &&
          attr(entry, 'name') === 'adj' &&
          /^val\s+50000$/.test(attr(entry, 'fmla') ?? '')
        ),
    )
  )
    warn('Non-default shape geometry adjustments are not retained.');
  return decoration;
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
    x: clamp(
      transform.x + (number(attr(off, 'x'), 80 * EMU) / EMU) * transform.sx,
      -100000,
      100000,
    ),
    y: clamp(
      transform.y + (number(attr(off, 'y'), 80 * EMU) / EMU) * transform.sy,
      -100000,
      100000,
    ),
    width: clamp((number(attr(ext, 'cx'), 600 * EMU) / EMU) * transform.sx, 0.01, 100000),
    height: clamp((number(attr(ext, 'cy'), 100 * EMU) / EMU) * transform.sy, 0.01, 100000),
    rotation: clamp(number(attr(xfrm, 'rot')) / 60000 + transform.rotation, -360000, 360000),
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

function layoutPlaceholderFor(node: Element, templates: Element[]): Element | undefined {
  const ph = descendant(node, 'ph');
  if (!ph) return undefined;
  const idx = attr(ph, 'idx') ?? '0';
  // PowerPoint matches slide placeholders to layout placeholders by idx only.
  // A type fallback can pick a different content box or even a decorative shape.
  return templates.find((template) => {
    const candidate = descendant(template, 'ph');
    return candidate && (attr(candidate, 'idx') ?? '0') === idx;
  });
}

function masterPlaceholderFor(
  layout: Element | undefined,
  templates: Element[],
): Element | undefined {
  const ph = descendant(layout, 'ph');
  if (!ph) return undefined;
  const type = attr(ph, 'type') ?? 'obj';
  // Layout-to-master inheritance uses the placeholder's role, not its idx.
  const masterType =
    type === 'ctrTitle'
      ? 'title'
      : ['obj', 'subTitle', 'pic', 'chart', 'clipArt', 'dgm', 'media', 'tbl'].includes(type)
        ? 'body'
        : type;
  return templates.find((template) => {
    const candidate = descendant(template, 'ph');
    return candidate && (attr(candidate, 'type') ?? 'obj') === masterType;
  });
}

function readTextBodyProperties(
  bodies: Array<Element | undefined>,
  warn: Warn,
): Pick<TextElement, 'textFrame' | 'verticalAlign' | 'autoFit'> {
  const cascade = bodies.map((body) => child(body, 'bodyPr'));
  // Resolve each attribute independently. A local zero or false is an override,
  // while an absent attribute continues through layout/master to OOXML defaults.
  const effective = (name: string) =>
    cascade.map((node) => attr(node, name)).find((value) => value !== null) ?? null;
  const enabled = (name: string) => ['1', 'true'].includes(effective(name) ?? '');
  const inset = (name: string, fallback: number): number => {
    const value = number(effective(name), fallback) / EMU;
    if (value < -10000 || value > 10000)
      warn('Text-box insets outside the supported range were limited to ±10,000 pixels.');
    return clamp(value, -10000, 10000);
  };
  const overflow = (name: 'horzOverflow' | 'vertOverflow'): 'overflow' | 'clip' => {
    const value = effective(name) ?? 'overflow';
    if (value === 'overflow' || value === 'clip') return value;
    if (name === 'vertOverflow' && value === 'ellipsis') {
      warn(
        'Vertical text overflow with ellipsis is imported as clipping; ellipsis markers are omitted.',
      );
      return 'clip';
    }
    warn('An unsupported text-overflow mode was imported as overflow.');
    return 'overflow';
  };
  const wrap = effective('wrap') ?? 'square';
  if (wrap !== 'square' && wrap !== 'none')
    warn('An unsupported text-wrapping mode was imported as square wrapping.');
  const anchor = effective('anchor') ?? 't';
  if (!['t', 'ctr', 'b'].includes(anchor))
    warn('Distributed or justified vertical text anchoring is imported as top alignment.');
  if (enabled('anchorCtr'))
    warn(
      'Horizontal centering of the complete text block is not retained; paragraph alignment is kept.',
    );
  if ((effective('vert') ?? 'horz') !== 'horz' || number(effective('rot')) !== 0)
    warn('Vertical and rotated text layout is imported as horizontal text.');
  if (number(effective('numCol'), 1) > 1)
    warn(
      'Multi-column text is imported as a single column; column spacing and direction are not retained.',
    );
  if (enabled('compatLnSpc')) warn('Legacy compatible text line spacing may differ.');
  if (enabled('upright')) warn('Keeping text upright inside a rotated shape is not retained.');
  const warp = cascade.map((node) => child(node, 'prstTxWarp')).find(Boolean);
  if (warp && attr(warp, 'prst') !== 'textNoShape')
    warn('Warped text is imported with a rectangular text layout.');

  // Autofit is a choice, not three independent inherited properties: an explicit
  // local noAutofit must suppress either auto-fit choice on the layout/master.
  const fit = cascade.flatMap((node) =>
    node
      ? Array.from(node.children).filter((entry) =>
          ['noAutofit', 'normAutofit', 'spAutoFit'].includes(entry.localName),
        )
      : [],
  )[0];
  let autoFit: TextAutoFit = { mode: fit?.localName === 'spAutoFit' ? 'resize' : 'none' };
  if (fit?.localName === 'normAutofit') {
    const factor = (name: string, fallback: number, min: number, max: number): number => {
      const value = attr(fit, name)?.trim();
      if (value === undefined) return fallback;
      const percent = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value);
      const numeric = /^[+-]?\d+$/.test(value);
      const parsed = percent
        ? Number(value.slice(0, -1)) / 100
        : numeric
          ? Number(value) / 100000
          : NaN;
      if (!Number.isFinite(parsed)) {
        warn(`Invalid autofit ${name} used its default value.`);
        return fallback;
      }
      if (parsed < min || parsed > max)
        warn(`Autofit ${name} outside the supported range was limited to ${min}–${max}.`);
      return clamp(parsed, min, max);
    };
    autoFit = {
      mode: 'shrink',
      fontScale: factor('fontScale', 1, 0.01, 1),
      lineSpacingReduction: factor('lnSpcReduction', 0, 0, 132),
    };
  }
  if (autoFit.mode !== 'none') warn(autoFitWarning);
  const verticalOverflow = overflow('vertOverflow');
  if (verticalOverflow === 'clip') warn(verticalClipWarning);
  return {
    autoFit,
    textFrame: {
      insets: {
        top: inset('tIns', 45720),
        right: inset('rIns', 91440),
        bottom: inset('bIns', 45720),
        left: inset('lIns', 91440),
      },
      wrap: wrap === 'none' ? 'none' : 'square',
      horizontalOverflow: overflow('horzOverflow'),
      verticalOverflow,
      paragraphSpacingAtEdges: enabled('spcFirstLastPara'),
    },
    verticalAlign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
  };
}

/** Resolve the supported DrawingML text cascade from nearest to most distant. */
function readParagraphs(
  body: Element | undefined,
  inheritedBodies: Array<Element | undefined>,
  masterStyle: Element | undefined,
  defaultStyle: Element | undefined,
  colors: Colors,
  font: string,
  majorFont: string,
  relations: Relations,
  warn: Warn,
  textAlphas?: number[],
): TextParagraph[] {
  const firstDefinedAttribute = (nodes: Array<Element | undefined>, name: string) =>
    nodes.map((node) => attr(node, name)).find((value) => value !== null) ?? null;
  const firstChild = (nodes: Array<Element | undefined>, name: string) =>
    nodes.map((node) => child(node, name)).find(Boolean);
  const listStyle = (target: Element | undefined, level: number) =>
    child(child(target, 'lstStyle'), `lvl${level + 1}pPr`);
  const paragraphs = children(body, 'p').map((paragraph) => {
    const local = child(paragraph, 'pPr');
    const inheritedParagraphProps = inheritedBodies.map((target) =>
      child(children(target, 'p')[0], 'pPr'),
    );
    const level = clamp(
      Math.trunc(number(firstDefinedAttribute([local, ...inheritedParagraphProps], 'lvl'))),
      0,
      8,
    );
    const cascade = [
      local,
      listStyle(body, level),
      ...inheritedBodies.flatMap((target) => [
        child(children(target, 'p')[0], 'pPr'),
        listStyle(target, level),
      ]),
      child(masterStyle, `lvl${level + 1}pPr`),
      child(defaultStyle, `lvl${level + 1}pPr`),
      child(defaultStyle, 'defPPr'),
    ];
    const defaults = cascade.map((props) => child(props, 'defRPr'));
    const readRun = (runNode: Element | undefined, text: string): TextRun => {
      const direct = child(runNode, 'rPr');
      const styles = [direct, runNode ? undefined : child(paragraph, 'endParaRPr'), ...defaults];
      const typeface = attr(firstChild(styles, 'latin'), 'typeface') || font;
      const family = typeface.startsWith('+mj')
        ? majorFont
        : typeface.startsWith('+mn')
          ? font
          : typeface;
      const bold = firstDefinedAttribute(styles, 'b');
      const italic = firstDefinedAttribute(styles, 'i');
      const underline = firstDefinedAttribute(styles, 'u');
      const runPaint = styles.map((style) => paintChild(style)).find(Boolean);
      if (runPaint && !['solidFill', 'noFill'].includes(runPaint.localName))
        warn(
          'Gradient, pattern, and picture glyph paints are not retained; text uses a solid color.',
        );
      textAlphas?.push(
        runPaint?.localName === 'noFill'
          ? 0
          : runPaint?.localName === 'solidFill'
            ? decorationColor(runPaint, colors, warn).opacity
            : 1,
      );
      const run: TextRun = {
        text,
        fontSize: clamp(number(firstDefinedAttribute(styles, 'sz'), 2400) / 100, 1, 1000),
        fontFamily: family.slice(0, 128),
        color: color(
          firstChild(styles, 'solidFill'),
          colors,
          `#${colors.tx1 ?? colors.dk1 ?? '172e29'}`,
        ),
        bold: bold === '1' || bold === 'true',
        italic: italic === '1' || italic === 'true',
        underline: underline !== null && underline !== 'none',
      };
      const link = child(direct, 'hlinkClick');
      if (link) {
        const relation = relations.get(relationshipId(link) ?? '');
        if (
          relation?.external &&
          relation.type.endsWith('/hyperlink') &&
          safeHyperlink(relation.target) &&
          !attr(link, 'action')
        )
          run.hyperlink = relation.target;
        else
          warn(
            'Unsafe, internal, or action-based hyperlinks were omitted; only external HTTP, HTTPS, and mailto text links are retained.',
          );
      }
      if (
        styles.some(
          (style) =>
            (attr(style, 'baseline') && attr(style, 'baseline') !== '0') ||
            (attr(style, 'strike') && attr(style, 'strike') !== 'noStrike') ||
            (attr(style, 'cap') && attr(style, 'cap') !== 'none'),
        ) ||
        firstChild(styles, 'highlight')
      )
        warn(
          'Superscript, subscript, strike-through, capitalization effects, and text highlights are simplified.',
        );
      return run;
    };
    const runs: TextRun[] = [];
    for (const runNode of Array.from(paragraph.children)) {
      if (runNode.localName === 'r' || runNode.localName === 'fld') {
        runs.push(
          readRun(
            runNode,
            children(runNode, 't')
              .map((text) => text.textContent ?? '')
              .join(''),
          ),
        );
        if (runNode.localName === 'fld')
          warn('Dynamic text fields are imported as their current editable text values.');
      } else if (runNode.localName === 'br') runs.push(readRun(runNode, '\n'));
    }
    if (!runs.length) runs.push(readRun(undefined, ''));
    const align = firstDefinedAttribute(cascade, 'algn');
    if (align && !['l', 'ctr', 'r'].includes(align))
      warn('Justified and distributed paragraph alignment is simplified to left alignment.');
    const result: TextParagraph = {
      runs,
      align: align === 'ctr' ? 'center' : align === 'r' ? 'right' : 'left',
    };
    const bulletRule = cascade
      .map(
        (props) =>
          props &&
          Array.from(props.children).find((node) =>
            ['buNone', 'buChar', 'buAutoNum', 'buBlip'].includes(node.localName),
          ),
      )
      .find(Boolean);
    if (bulletRule?.localName === 'buAutoNum') {
      result.bullet = {
        kind: 'number',
        level,
        ...(attr(bulletRule, 'startAt') !== null
          ? { start: clamp(Math.trunc(number(attr(bulletRule, 'startAt'), 1)), 1, 32767) }
          : {}),
      };
      if (attr(bulletRule, 'type') !== 'arabicPeriod')
        warn('Non-decimal numbering styles are normalized to decimal numbers with periods.');
    } else if (bulletRule?.localName === 'buChar') {
      let character = attr(bulletRule, 'char') || '•';
      const bulletFont = attr(firstChild(cascade, 'buFont'), 'typeface');
      if (
        /\p{Co}/u.test(character) ||
        (bulletFont && /wingdings|webdings|symbol/i.test(bulletFont))
      ) {
        character = '•';
        warn('Font-specific bullet symbols are replaced with a standard bullet.');
      }
      if (character.length > 8 || /[\u0000-\u001f\u007f]/.test(character)) character = '•';
      result.bullet = { kind: 'bullet', level, character };
    } else if (bulletRule?.localName === 'buBlip') {
      result.bullet = { kind: 'bullet', level, character: '•' };
      warn('Picture bullets are replaced with a standard bullet.');
    }
    if (
      result.bullet &&
      (firstDefinedAttribute(cascade, 'marL') !== null ||
        firstDefinedAttribute(cascade, 'indent') !== null)
    )
      warn('Exact bullet margins and hanging indents are normalized from the list level.');
    const size = runs[0].fontSize ?? 24;
    const lineSpacing = firstChild(cascade, 'lnSpc');
    const percent = child(lineSpacing, 'spcPct');
    const points = child(lineSpacing, 'spcPts');
    if (points) {
      const value = number(attr(points, 'val'), size * 100) / 100;
      if (value < 0 || value > 1000)
        warn('Fixed-point line spacing outside the supported range was limited to 0–1,000 points.');
      result.lineSpacingPoints = clamp(value, 0, 1000);
    } else {
      result.lineSpacing = clamp(
        percent ? number(attr(percent, 'val'), 100000) / 100000 : 1,
        0.5,
        10,
      );
    }
    for (const [name, key] of [
      ['spcBef', 'spaceBefore'],
      ['spcAft', 'spaceAfter'],
    ] as const) {
      const spacing = firstChild(cascade, name);
      const points = child(spacing, 'spcPts');
      const percent = child(spacing, 'spcPct');
      result[key] = clamp(
        points
          ? number(attr(points, 'val')) / 100
          : percent
            ? (number(attr(percent, 'val')) / 100000) * size
            : 0,
        0,
        1000,
      );
      if (percent)
        warn(
          'Percentage paragraph spacing is converted to points using the first run’s font size.',
        );
    }
    if (firstChild(cascade, 'tabLst')) warn('Custom text tab stops are not preserved.');
    return result;
  });
  // PowerPoint repeats the sequence's startAt on each adjacent numbered paragraph.
  // Native documents instead store start only where a sequence starts or restarts.
  let activeStarts: Array<number | undefined> = [];
  for (const paragraph of paragraphs) {
    const bullet = paragraph.bullet;
    if (!bullet) {
      activeStarts = [];
      continue;
    }
    activeStarts.length = bullet.level + 1;
    if (bullet.kind !== 'number') {
      activeStarts[bullet.level] = undefined;
      continue;
    }
    const start = bullet.start ?? activeStarts[bullet.level] ?? 1;
    if (activeStarts[bullet.level] === start) delete bullet.start;
    else if (start !== 1 || bullet.start !== undefined) bullet.start = start;
    activeStarts[bullet.level] = start;
  }
  return paragraphs;
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
    const majorFont = (
      attr(child(descendant(themeDoc, 'majorFont'), 'latin'), 'typeface') || font
    ).slice(0, 128);
    for (const mapping of [
      child(master?.documentElement, 'clrMap'),
      child(child(layout?.documentElement, 'clrMapOvr'), 'overrideClrMapping'),
      child(child(slideDoc.documentElement, 'clrMapOvr'), 'overrideClrMapping'),
    ]) {
      if (mapping)
        for (const entry of Array.from(mapping.attributes))
          if (colors[entry.value]) colors[entry.localName] = colors[entry.value];
    }
    if (slideIndex === 0) {
      theme.fontFamily = font;
      theme.accent = `#${colors.accent1}`;
      theme.foreground = `#${colors.dk1}`;
    }
    const layoutTemplates = descendants(layout, 'sp');
    const masterTemplates = descendants(master, 'sp');
    const backgrounds = [slideDoc, layout, master].map((doc) =>
      child(child(doc?.documentElement, 'cSld'), 'bg'),
    );
    const backgroundCandidates: PaintCandidate[] = [];
    for (const bg of backgrounds) {
      const paint = paintChild(child(bg, 'bgPr'));
      if (paint) backgroundCandidates.push({ node: paint });
      const ref = paintReference(child(bg, 'bgRef'), 'fill', themeDoc);
      if (ref) backgroundCandidates.push(ref);
    }
    const backgroundPaint = readPaintCandidates(backgroundCandidates, colors, warn);
    const background = backgroundPaint?.color ?? '#ffffff';
    const slide: Slide = {
      id: identifier(),
      name: (
        attr(child(slideDoc.documentElement, 'cSld'), 'name') || `Slide ${slideIndex + 1}`
      ).slice(0, 256),
      background,
      ...(backgroundPaint?.gradient ? { backgroundGradient: backgroundPaint.gradient } : {}),
      ...(backgroundPaint
        ? backgroundPaint.opacity !== 1
          ? { backgroundOpacity: backgroundPaint.opacity }
          : {}
        : backgroundCandidates.length
          ? { backgroundOpacity: 0 }
          : {}),
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
    if (
      descendant(slideDoc, 'hlinkHover') ||
      descendants(slideDoc, 'cNvPr').some((properties) => descendant(properties, 'hlinkClick'))
    )
      warn('Hover links, shape hyperlinks, and interactive actions are not imported.');
    if (descendant(slideDoc, 'videoFile') || descendant(slideDoc, 'audioFile'))
      warn('Embedded audio and video are not imported.');
    if (descendant(slideDoc, 'extLst')) warn('Vendor-specific drawing extensions may be omitted.');
    if ([...layoutTemplates, ...masterTemplates].some((sp) => !descendant(sp, 'ph')))
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
      const layoutPlaceholder = layoutPlaceholderFor(node, layoutTemplates);
      const masterPlaceholder = masterPlaceholderFor(layoutPlaceholder, masterTemplates);
      const template = child(child(layoutPlaceholder, 'spPr'), 'xfrm')
        ? layoutPlaceholder
        : (masterPlaceholder ?? layoutPlaceholder);
      const geometry = base(node, template, transform);
      const properties = child(node, 'spPr');
      if (
        descendant(properties, 'pattFill') ||
        descendant(properties, 'effectLst') ||
        descendant(properties, 'custGeom')
      )
        warn('Patterns, effects, and custom geometry are simplified.');
      if (
        node.localName !== 'pic' &&
        (attr(descendant(properties, 'xfrm'), 'flipH') === '1' ||
          attr(descendant(properties, 'xfrm'), 'flipV') === '1')
      )
        warn('Flipped objects are imported without the flip.');
      if (node.localName === 'sp' || node.localName === 'cxnSp') {
        const body = child(node, 'txBody');
        const text = textContent(body);
        const shapeCascade = [node, layoutPlaceholder, masterPlaceholder];
        const inheritedPreset = shapeCascade
          .map((shape) => child(shape, 'spPr'))
          .map(
            (props) =>
              props &&
              Array.from(props.children).find((entry) =>
                ['prstGeom', 'custGeom'].includes(entry.localName),
              ),
          )
          .find(Boolean);
        const preset =
          attr(inheritedPreset, 'prst') ?? (node.localName === 'cxnSp' ? 'line' : 'rect');
        const shapeMap: Record<string, ShapeElement['shape']> = {
          rect: 'rect',
          roundRect: 'roundRect',
          ellipse: 'ellipse',
          triangle: 'triangle',
          line: 'line',
          rightArrow: 'arrow',
          straightConnector1: 'line',
        };
        const visibleFill = Array.from(properties?.children ?? []).some((entry) =>
          ['solidFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'].includes(entry.localName),
        );
        const line = child(properties, 'ln');
        const isTextBox = ['1', 'true'].includes(attr(descendant(node, 'cNvSpPr'), 'txBox') ?? '');
        const unifiedText =
          (text || isTextBox) &&
          ['rect', 'roundRect', 'ellipse', 'triangle'].includes(preset) &&
          inheritedPreset?.localName !== 'custGeom';
        if (!text && descendant(node, 'ph') && !visibleFill && !line) return;
        if (!unifiedText && !isTextBox) {
          const candidates = shapePaintCandidates(shapeCascade, themeDoc);
          const fillPaint = readPaintCandidates(candidates.fill, colors, warn);
          const strokePaint = readPaintCandidates(
            candidates.line
              .map((candidate) =>
                candidate.none ? candidate : { ...candidate, node: paintChild(candidate.node) },
              )
              .filter((candidate) => candidate.none || candidate.node),
            colors,
            warn,
          );
          const inheritedWidth = candidates.line
            .map((candidate) => attr(candidate.node, 'w'))
            .find((value) => value !== null);
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
            opacity: 1,
            fill: fillPaint?.color ?? 'transparent',
            stroke: strokePaint?.color ?? 'transparent',
            strokeWidth: strokePaint ? clamp(number(inheritedWidth) / EMU, 0, 100) : 0,
            ...(fillPaint?.gradient ? { fillGradient: fillPaint.gradient } : {}),
            ...(strokePaint?.gradient ? { strokeGradient: strokePaint.gradient } : {}),
            ...(fillPaint && fillPaint.opacity !== 1 ? { fillOpacity: fillPaint.opacity } : {}),
            ...(strokePaint && strokePaint.opacity !== 1
              ? { strokeOpacity: strokePaint.opacity }
              : {}),
          });
        }
        if (text || isTextBox) {
          const decoration = readDecoration(shapeCascade, colors, themeDoc, warn);
          if (!unifiedText && !isTextBox) {
            decoration.fill = null;
            decoration.line = null;
            warn(
              'Unsupported text-container shapes remain separate shape and text objects; their text region is approximated.',
            );
          }
          const placeholderType =
            attr(descendant(node, 'ph'), 'type') ??
            attr(descendant(layoutPlaceholder, 'ph'), 'type') ??
            (descendant(node, 'ph') ? 'obj' : undefined);
          const styleName =
            placeholderType === 'title' || placeholderType === 'ctrTitle'
              ? 'titleStyle'
              : placeholderType
                ? 'bodyStyle'
                : 'otherStyle';
          const textAlphas: number[] = [];
          const paragraphs = readParagraphs(
            body,
            [child(layoutPlaceholder, 'txBody'), child(masterPlaceholder, 'txBody')],
            child(child(master?.documentElement, 'txStyles'), styleName),
            child(presentation!.documentElement, 'defaultTextStyle'),
            colors,
            font,
            majorFont,
            slideRels,
            warn,
            textAlphas,
          );
          const first = paragraphs[0]?.runs[0];
          const bodyProperties = readTextBodyProperties(
            [body, child(layoutPlaceholder, 'txBody'), child(masterPlaceholder, 'txBody')],
            warn,
          );
          const textAlpha = textAlphas[0] ?? 1;
          if (new Set(textAlphas).size > 1)
            warn('Mixed per-run text opacity is flattened to the first text opacity.');
          slide.elements.push({
            ...geometry,
            id: identifier(),
            type: 'text',
            text: plainText(paragraphs),
            paragraphs,
            fontSize: first?.fontSize ?? 24,
            fontFamily: first?.fontFamily ?? font,
            color: first?.color ?? theme.foreground,
            bold: first?.bold ?? false,
            italic: first?.italic ?? false,
            underline: first?.underline ?? false,
            align: paragraphs[0]?.align ?? 'left',
            ...bodyProperties,
            decoration,
            opacity: 1,
            ...(textAlpha < 1 ? { textOpacity: textAlpha } : {}),
          });
        }
      } else if (node.localName === 'pic') {
        const pictureFill = child(node, 'blipFill');
        const blip = child(pictureFill, 'blip');
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
        const readRect = (rect: Element | undefined): ImageRect | undefined => {
          if (!rect) return undefined;
          const result: ImageRect = {};
          for (const key of ['left', 'top', 'right', 'bottom'] as const) {
            const raw = attr(rect, key[0]);
            if (raw === null) continue;
            const valid =
              /^[+-]?\d+$/.test(raw.trim()) || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(raw.trim());
            if (!valid) warn('Invalid picture rectangle offsets used zero.');
            const numeric = raw.trim().endsWith('%')
              ? Number(raw.trim().slice(0, -1)) / 100
              : Number(raw) / 100000;
            if (valid && !Number.isFinite(numeric))
              warn('Invalid picture rectangle offsets used zero.');
            const ratio = valid && Number.isFinite(numeric) ? numeric : 0;
            if (ratio < -21474.83648 || ratio > 21474.83647)
              warn('Picture rectangle offsets outside the supported range were limited.');
            result[key] = clamp(ratio, -21474.83648, 21474.83647);
          }
          return result;
        };
        const crop = readRect(child(pictureFill, 'srcRect'));
        const stretch = child(pictureFill, 'stretch');
        const fillRect = readRect(child(stretch, 'fillRect'));
        if (child(pictureFill, 'tile') || !stretch)
          warn(
            'Tiled or unspecified picture-fill modes are imported as a single stretched picture.',
          );
        if (['0', 'false'].includes(attr(pictureFill, 'rotWithShape') ?? ''))
          warn(
            'Pictures with fixed fill rotation are imported with the fill following the picture.',
          );
        const preset = child(properties, 'prstGeom');
        if (child(properties, 'custGeom') || (preset && attr(preset, 'prst') !== 'rect'))
          warn(
            'Picture masks are imported as rectangular frames; the original mask geometry is not retained.',
          );
        const outline = child(properties, 'ln');
        if (
          (outline && !child(outline, 'noFill') && (paintChild(outline) || child(node, 'style'))) ||
          (paintChild(properties) && !child(properties, 'noFill'))
        )
          warn('Attached picture fills and borders are not retained.');
        const unsupportedEffects = Array.from(blip?.children ?? []).some(
          (entry) => !['alphaModFix', 'extLst'].includes(entry.localName),
        );
        if (
          unsupportedEffects ||
          child(properties, 'effectDag') ||
          child(properties, 'effectLst')?.children.length
        )
          warn(
            'Picture effects, recoloring, and unsupported transparency operations are not retained.',
          );
        const transformNode = child(properties, 'xfrm') ?? child(child(template, 'spPr'), 'xfrm');
        const flip = (name: string): boolean | undefined => {
          const value = attr(transformNode, name);
          if (value === null) return undefined;
          if (!['0', '1', 'true', 'false'].includes(value))
            warn('An invalid picture flip used false.');
          return value === '1' || value === 'true';
        };
        const flipH = flip('flipH'),
          flipV = flip('flipV');
        const alpha = children(blip, 'alphaModFix').reduce((value, node) => {
          const raw = attr(node, 'amt');
          if (raw === null) return value;
          const valid =
            /^[+]?\d+$/.test(raw.trim()) || /^[+]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(raw.trim());
          if (!valid) warn('An invalid picture transparency multiplier used its default value.');
          return value * (valid ? percentage(raw, 1) : 1);
        }, 1);
        const picture: ImageElement = {
          ...geometry,
          type: 'image',
          src: `data:image/${mime};base64,${btoa(binary)}`,
          alt: (
            attr(descendant(node, 'cNvPr'), 'descr') ??
            attr(descendant(node, 'cNvPr'), 'title') ??
            ''
          ).slice(0, 2000),
          fit: 'stretch',
          orientation: 'encoded',
          ...(crop !== undefined ? { crop } : {}),
          ...(fillRect !== undefined ? { fillRect } : {}),
          ...(flipH !== undefined ? { flipH } : {}),
          ...(flipV !== undefined ? { flipV } : {}),
          opacity: clamp(alpha, 0, 1),
        };
        const layout = imageGeometry(picture);
        if (layout?.reason) warn(layout.reason);
        slide.elements.push(picture);
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
