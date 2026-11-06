// Explicit XML controls derived only from the sanitized original project fixture.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/picture-geometry-powerpoint');
await mkdir(evidence, { recursive: true });
const input = await readFile(resolve(root, 'tests/fixtures/powerpoint-picture-geometry.pptx'));
const zip = await JSZip.loadAsync(input);
const dom = new JSDOM();
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const parse = (s) => new dom.window.DOMParser().parseFromString(s, 'application/xml');
const serial = (n) => new dom.window.XMLSerializer().serializeToString(n);
const children = (n, name) => Array.from(n.children).filter((x) => x.localName === name);
const child = (n, name) => children(n, name)[0];
const desc = (n, name) => Array.from(n.getElementsByTagNameNS('*', name));
const changes = [];
function element(doc, name, attrs = {}) {
  const n = doc.createElementNS(A, `a:${name}`);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
function change(
  pic,
  name,
  { source, fill, tile, removeMode, rotateWithShape, transform, alpha } = {},
) {
  const doc = pic.ownerDocument,
    bf = child(pic, 'blipFill');
  const original = desc(pic, 'cNvPr')[0].getAttribute('name');
  desc(pic, 'cNvPr')[0].setAttribute('name', name);
  if (source !== undefined) {
    for (const n of children(bf, 'srcRect')) n.remove();
    if (source !== null)
      bf.insertBefore(
        element(doc, 'srcRect', source),
        Array.from(bf.children).find((n) => ['stretch', 'tile'].includes(n.localName)) ?? null,
      );
  }
  if (removeMode) {
    for (const n of Array.from(bf.children).filter((n) =>
      ['stretch', 'tile'].includes(n.localName),
    ))
      n.remove();
  }
  if (fill !== undefined) {
    for (const n of children(bf, 'tile')) n.remove();
    let stretch = child(bf, 'stretch');
    if (!stretch) {
      stretch = element(doc, 'stretch');
      bf.append(stretch);
    }
    for (const n of children(stretch, 'fillRect')) n.remove();
    if (fill !== null) stretch.append(element(doc, 'fillRect', fill));
  }
  if (tile !== undefined) {
    for (const n of Array.from(bf.children).filter((n) =>
      ['stretch', 'tile'].includes(n.localName),
    ))
      n.remove();
    bf.append(element(doc, 'tile', tile));
  }
  if (rotateWithShape !== undefined) bf.setAttribute('rotWithShape', String(rotateWithShape));
  if (transform) {
    const xfrm = child(child(pic, 'spPr'), 'xfrm');
    for (const [k, v] of Object.entries(transform)) {
      if (v === null) xfrm.removeAttribute(k);
      else if (k === 'width') child(xfrm, 'ext').setAttribute('cx', String(v * 12700));
      else xfrm.setAttribute(k, String(v));
    }
  }
  if (alpha !== undefined) {
    const blip = child(bf, 'blip');
    for (const n of children(blip, 'alphaModFix')) n.remove();
    blip.insertBefore(element(doc, 'alphaModFix', { amt: alpha }), blip.firstChild);
  }
  changes.push({
    original,
    name,
    source,
    fill,
    tile,
    removeMode,
    rotateWithShape,
    transform,
    alpha,
  });
}
const documents = new Map();
for (let s = 1; s <= 9; s++)
  documents.set(s, parse(await zip.file(`ppt/slides/slide${s}.xml`).async('string')));
const pics = (s) => desc(documents.get(s), 'pic');
change(pics(1)[0], 'XML absent source rectangle', { source: null });
change(pics(1)[1], 'XML empty source rectangle', { source: {} });
change(pics(1)[2], 'XML fill inset', {
  source: {},
  fill: { l: 15000, t: 20000, r: 5000, b: 10000 },
});
const plans = [
  [
    'XML mixed source target',
    {
      source: { l: 20000, t: 10000, r: 5000, b: 25000 },
      fill: { l: 10000, t: 15000, r: 25000, b: 5000 },
    },
  ],
  ['XML fill outset', { source: {}, fill: { l: -25000, t: -25000, r: -25000, b: -25000 } }],
  ['XML far source window', { source: { l: 200000, r: -150000 }, fill: {} }],
  ['XML percentage source', { source: { l: '20%', t: '10%', r: '5%', b: '25%' }, fill: {} }],
  ['XML percentage target', { source: {}, fill: { l: '10%', t: '15%', r: '25%', b: '5%' } }],
  ['XML absent fill mode', { source: { l: 20000, t: 10000, r: 5000, b: 25000 }, removeMode: true }],
];
plans.forEach(([name, p], i) => change(pics(2)[i], name, p));
pics(3).forEach((pic, i) =>
  change(pic, `XML asymmetric target flip ${i}`, {
    fill: { l: 10000, t: 15000, r: 25000, b: 5000 },
  }),
);
pics(4).forEach((pic, i) =>
  change(pic, `XML rotate fill ${i}`, { rotateWithShape: i % 2 === 0 ? '0' : '1' }),
);
change(pics(5)[0], 'XML contain using source', { source: { t: -50000, b: -50000 }, fill: {} });
change(pics(5)[1], 'XML contain using target', {
  source: {},
  fill: { t: 25000, b: 25000 },
  transform: { width: 170 },
});
change(pics(5)[2], 'XML inset target plus crop', {
  source: { l: 30000, t: 10000, r: 10000, b: 20000 },
  fill: { l: 20000, t: 20000, r: 20000, b: 20000 },
});
change(pics(5)[3], 'XML absent fill rectangle', { source: {}, fill: null });
change(pics(7)[2], 'XML image opacity fifty', { alpha: 50000 });
for (const s of [8, 9])
  pics(s).forEach((pic, i) =>
    change(pic, `XML raw EXIF ${(s - 8) * 4 + i + 1}`, {
      transform: { rot: null, flipH: null, flipV: null },
    }),
  );
for (const [s, doc] of documents) zip.file(`ppt/slides/slide${s}.xml`, serial(doc));
for (let s = 1; s <= 9; s++) {
  const path = `ppt/notesSlides/notesSlide${s}.xml`,
    entry = zip.file(path);
  if (entry) {
    const doc = parse(await entry.async('string'));
    const first = desc(doc, 't')[0];
    if (first)
      first.textContent = 'XML-derived OpenDeck picture geometry probe. ' + first.textContent;
    zip.file(path, serial(doc));
  }
}
const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(resolve(root, 'tests/fixtures/powerpoint-picture-geometry-probe.pptx'), output);
await writeFile(
  resolve(evidence, 'fixture-provenance.json'),
  JSON.stringify(
    {
      kind: 'Explicit XML-derived copy of an original project PowerPoint-authored fixture',
      sourceSha256: createHash('sha256').update(input).digest('hex'),
      probeSha256: createHash('sha256').update(output).digest('hex'),
      slides: 9,
      changes,
    },
    null,
    2,
  ) + '\n',
);
// Keep deliberately degenerate cases out of the committed probe until native opening is assessed.
const edges = [
  ['source-zero', { source: { l: 50000, r: 50000 } }],
  ['source-inverted', { source: { l: 80000, r: 40000 } }],
  ['fill-zero', { fill: { l: 50000, r: 50000 } }],
  ['fill-inverted', { fill: { l: 80000, r: 40000 } }],
  ['tile-default', { source: {}, tile: {} }],
  [
    'tile-negative',
    {
      source: { l: -25000, t: -25000, r: -25000, b: -25000 },
      tile: { sx: 50000, sy: 50000, tx: 254000, ty: 127000, flip: 'xy', algn: 'ctr' },
    },
  ],
];
for (const [name, options] of edges) {
  const edge = await JSZip.loadAsync(input);
  const doc = parse(await edge.file('ppt/slides/slide1.xml').async('string'));
  change(desc(doc, 'pic')[0], `Ignored ${name}`, options);
  edge.file('ppt/slides/slide1.xml', serial(doc));
  await writeFile(
    resolve(evidence, `edge-${name}.pptx`),
    await edge.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
}
console.log(
  JSON.stringify({
    probe: 'tests/fixtures/powerpoint-picture-geometry-probe.pptx',
    sha256: createHash('sha256').update(output).digest('hex'),
    changes: changes.length - edges.length,
  }),
);
dom.window.close();
