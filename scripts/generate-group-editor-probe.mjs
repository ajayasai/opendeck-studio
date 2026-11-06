// Original editor-authored mixed relationship control and a separately XML-derived zero-extent probe.
// Outputs are ignored evidence only; no published fixtures or examples are modified.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
const root = fileURLToPath(new URL('..', import.meta.url)),
  evidence = resolve(root, 'test-results/group-powerpoint');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { exportPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const deck = JSON.parse(await readFile(resolve(root, 'examples/groups.opendeck'), 'utf8'));
  const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]),
    nodes = flatten(deck.slides.flatMap((s) => s.elements));
  let serial = 0;
  const base = (name, x, y, width, height) => ({
    id: 'group-editor-' + serial++,
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    animation: 'none',
  });
  const text = {
    ...structuredClone(nodes.find((n) => n.type === 'text' && n.text === 'Native ABC')),
    ...base('Grouped hyperlink text', 30, 30, 420, 60),
    text: 'Original grouped hyperlink',
    paragraphs: [
      { runs: [{ text: 'Original grouped hyperlink', hyperlink: 'https://example.org/' }] },
    ],
  };
  const picture = {
    ...structuredClone(nodes.find((n) => n.type === 'image')),
    ...base('Grouped original raster', 390, 130, 180, 90),
  };
  const table = {
    ...structuredClone(nodes.find((n) => n.type === 'table')),
    ...base('Grouped table values', 30, 130, 300, 150),
    rows: [
      ['Kind', 'Value'],
      ['Original', '42'],
    ],
  };
  const chart = {
    ...base('Grouped chart relationships', 30, 330, 350, 180),
    type: 'chart',
    chartType: 'bar',
    labels: ['Alpha', 'Beta', 'Gamma'],
    values: [4, 7, 3],
    color: '#14786E',
  };
  const inner = {
    ...base('Nested relationship group', 0, 0, 620, 300),
    type: 'group',
    childFrame: { x: 0, y: 0, width: 620, height: 300 },
    children: [text, table, picture],
  };
  const outer = {
    ...base('Editor mixed group', 100, 100, 1054, 442),
    type: 'group',
    rotation: 12,
    childFrame: { x: 0, y: 0, width: 850, height: 520 },
    children: [inner, chart],
  };
  const template = deck.slides[0];
  deck.title = 'Editor-authored native grouped relationship and picture controls';
  deck.slides = [
    {
      ...template,
      id: 'group-editor-slide',
      name: 'Mixed group controls',
      elements: [outer],
      notes:
        'Original project model: grouped chart, table, embedded original raster, and safe external text hyperlink. Native gate tests relationships and hierarchy, not unsupported chart styling.',
    },
  ];
  for (const [name, width, height, childHeight] of [
    ['Wide automatic fit', 1120, 180, 300],
    ['Tall automatic fit', 1050, 440, 200],
  ]) {
    const children = ['contain', 'cover', 'stretch'].map((fit, i) => {
      const p = {
        ...structuredClone(picture),
        ...base(name + ' ' + fit, 20 + i * 280, 10, 200, 180),
        fit,
      };
      delete p.crop;
      delete p.fillRect;
      return p;
    });
    const g = {
      ...base(name, 60, 140, width, height),
      type: 'group',
      childFrame: { x: 0, y: 0, width: 840, height: childHeight },
      children,
    };
    deck.slides.push({
      ...template,
      id: 'group-fit-' + name,
      name,
      elements: [g],
      notes:
        'Automatic image fit must use effective frame dimensions after nonuniform group resizing. Original project calibration pixels provide independent native color samples.',
    });
  }
  const exifChildren = [];
  for (let i = 0; i < 4; i++) {
    const orientation = i % 2 === 0 ? 6 : 7,
      bytes = await readFile(
        resolve(root, `tests/fixtures/picture-geometry-exif-${orientation}.jpg`),
      );
    const p = {
      ...structuredClone(picture),
      ...base('Grouped legacy EXIF ' + orientation + ' case' + i, 20 + i * 220, 30, 180, 200),
      src: 'data:image/jpeg;base64,' + bytes.toString('base64'),
      rotation: i % 2 === 0 ? 20 : -30,
      flipH: i < 2,
      flipV: i >= 2,
      crop: { left: 0.18, top: 0.08, right: 0.05, bottom: 0.22 },
      fillRect: { left: 0.08, top: 0.12, right: 0.17, bottom: 0.03 },
    };
    delete p.orientation;
    exifChildren.push(p);
  }
  deck.slides.push({
    ...template,
    id: 'group-exif-controls',
    name: 'Grouped legacy EXIF',
    elements: [
      {
        ...base('Legacy EXIF nonuniform reflected group', 60, 160, 1080, 360),
        type: 'group',
        flipH: true,
        childFrame: { x: 0, y: 0, width: 900, height: 400 },
        children: exifChildren,
      },
    ],
    notes:
      'Legacy browser-oriented JPEG6/7 pictures, asymmetric crop and destination rectangles, child flips/rotation and nonuniform reflected ancestor. Original encoded JPEG pixels are retained; native PNG colors validate materialization independently.',
  });
  const bytes = new Uint8Array(await (await exportPptx(deck)).arrayBuffer());
  await writeFile(
    resolve(evidence, 'editor-authored.opendeck'),
    JSON.stringify(deck, null, 2) + '\n',
  );
  await writeFile(resolve(evidence, 'editor-authored.pptx'), bytes);
  const source = await readFile(resolve(root, 'tests/fixtures/powerpoint-groups.pptx')),
    zip = await JSZip.loadAsync(source);
  const doc = new dom.window.DOMParser().parseFromString(
    await zip.file('ppt/slides/slide5.xml').async('string'),
    'application/xml',
  );
  const child = (n, name) => Array.from(n.children).find((n) => n.localName === name);
  for (const group of Array.from(doc.getElementsByTagNameNS('*', 'grpSp'))) {
    const name = child(child(group, 'nvGrpSpPr'), 'cNvPr').getAttribute('name'),
      xf = child(child(group, 'grpSpPr'), 'xfrm');
    if (name === 'Nested baseline') child(xf, 'ext').setAttribute('cx', String(600 * 12700));
    if (name === 'Nested baseline inner') child(xf, 'chExt').setAttribute('cx', '0');
  }
  zip.file('ppt/slides/slide5.xml', new dom.window.XMLSerializer().serializeToString(doc));
  await writeFile(
    resolve(evidence, 'nested-zero.pptx'),
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  const record = {
    editor: {
      slides: 4,
      groups: 5,
      leaves: 14,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    nestedZero: {
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      edits: 'Slide5 outerwidth400→600pt; inner chExt.cx→0; all other source XML unchanged',
    },
  };
  await writeFile(
    resolve(evidence, 'editor-generation.json'),
    JSON.stringify(record, null, 2) + '\n',
  );
  console.log(JSON.stringify(record));
} finally {
  await server.close();
  dom.window.close();
}
