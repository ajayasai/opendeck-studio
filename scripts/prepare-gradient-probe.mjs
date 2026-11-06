// Explicitly XML-derived gradient controls. The sanitized COM original is immutable.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/gradient-powerpoint');
await mkdir(evidence, { recursive: true });
const original = await readFile(resolve(root, 'tests/fixtures/powerpoint-gradients.pptx'));
const zip = await JSZip.loadAsync(original);
const dom = new JSDOM();
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const parse = (text) => new dom.window.DOMParser().parseFromString(text, 'application/xml');
const serialize = (node) => new dom.window.XMLSerializer().serializeToString(node);
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const child = (node, name) => Array.from(node.children).find((item) => item.localName === name);
const el = (doc, name, attrs = {}, namespace = A) => {
  const node = doc.createElementNS(
    namespace,
    `${namespace === A ? 'a' : namespace === P ? 'p' : ''}${namespace === A || namespace === P ? ':' : ''}${name}`,
  );
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
const docs = new Map();
const get = async (path) => {
  if (!docs.has(path)) docs.set(path, parse(await zip.file(path).async('string')));
  return docs.get(path);
};
const changes = [];
const shapeByName = (doc, name) => {
  const found = descendants(doc, 'sp').find(
    (shape) => descendants(shape, 'cNvPr')[0]?.getAttribute('name') === name,
  );
  assert.ok(found, `Expected original shape ${name}`);
  return found;
};
const stops = (doc, spec) => {
  const list = el(doc, 'gsLst');
  for (const stop of spec) {
    const node = el(doc, 'gs', { pos: stop.position });
    const color = el(doc, 'srgbClr', { val: stop.color });
    if (stop.alpha !== undefined) color.append(el(doc, 'alpha', { val: stop.alpha }));
    node.append(color);
    list.append(node);
  }
  return list;
};
const blackWhite = [
  { position: 0, color: '000000' },
  { position: 100000, color: 'FFFFFF' },
];
const three = [
  { position: 0, color: 'FF0000' },
  { position: 50000, color: '00FF00' },
  { position: 100000, color: '0000FF' },
];
const hardEdge = [
  { position: 0, color: 'FFFF00' },
  { position: 40000, color: 'FFFF00' },
  { position: 40000, color: '0070C0' },
  { position: 100000, color: '0070C0' },
];
function gradient(doc, spec = {}) {
  const node = el(doc, 'gradFill', spec.attributes ?? { flip: 'none', rotWithShape: '1' });
  if (spec.stops !== null) node.append(stops(doc, spec.stops ?? three));
  if (spec.linear) node.append(el(doc, 'lin', spec.linear));
  if (spec.path !== undefined) {
    const path = el(doc, 'path', spec.path === null ? {} : { path: spec.path });
    if (spec.focus !== undefined) path.append(el(doc, 'fillToRect', spec.focus));
    node.append(path);
  }
  if (spec.tile !== undefined) node.append(el(doc, 'tileRect', spec.tile));
  return node;
}
function replaceGradient(shape, name, spec, outline = false) {
  const doc = shape.ownerDocument;
  const props = child(shape, 'spPr');
  let parent = props;
  if (outline) {
    parent = child(props, 'ln');
    if (!parent) {
      parent = el(doc, 'ln');
      props.append(parent);
    }
    parent.setAttribute('w', '152400');
  }
  for (const node of Array.from(parent.children))
    if (
      ['solidFill', 'gradFill', 'noFill', 'blipFill', 'pattFill', 'grpFill'].includes(
        node.localName,
      )
    )
      node.remove();
  const node = gradient(doc, spec);
  if (outline) parent.prepend(node);
  else {
    const line = child(parent, 'ln');
    if (line) parent.insertBefore(node, line);
    else parent.append(node);
  }
  const nv = descendants(shape, 'cNvPr')[0];
  const originalName = nv.getAttribute('name');
  nv.setAttribute('name', name);
  changes.push({ originalName, name, outline, gradient: serialize(node) });
}

const slide1 = await get('ppt/slides/slide1.xml');
for (const [oldName, name, spec] of [
  [
    'Linear 0',
    'XML scaled false30',
    { linear: { ang: 1800000, scaled: 0 }, stops: hardEdge, tile: {} },
  ],
  [
    'Linear 30',
    'XML scaled true30',
    { linear: { ang: 1800000, scaled: 1 }, stops: hardEdge, tile: {} },
  ],
  ['Linear 45', 'XML scaled absent30', { linear: { ang: 1800000 }, stops: hardEdge, tile: {} }],
  [
    'Linear 90',
    'XML tile half flip none',
    {
      linear: { ang: 0, scaled: 1 },
      tile: { l: 50000 },
      attributes: { flip: 'none', rotWithShape: 1 },
    },
  ],
  [
    'Linear 180',
    'XML tile half flip x',
    {
      linear: { ang: 0, scaled: 1 },
      tile: { l: 50000 },
      attributes: { flip: 'x', rotWithShape: 1 },
    },
  ],
  [
    'Linear 270',
    'XML tile quarter flip xy',
    {
      linear: { ang: 0, scaled: 1 },
      tile: { l: 75000 },
      attributes: { flip: 'xy', rotWithShape: 1 },
    },
  ],
])
  replaceGradient(shapeByName(slide1, oldName), name, spec);

const slide2 = await get('ppt/slides/slide2.xml');
for (const [oldName, name, spec] of [
  // This PowerPoint build rejects explicit zero/one-child gsLst as corrupt.
  // Those negative controls remain ignored openability experiments, not this gate.
  [
    'Two endpoint black white',
    'XML absent stop list',
    { stops: null, linear: { ang: 0, scaled: 1 }, tile: {} },
  ],
  [
    'Two endpoint red blue',
    'XML one color two stops',
    {
      stops: [
        { position: 0, color: '18A0B5', alpha: 65000 },
        { position: 100000, color: '18A0B5', alpha: 65000 },
      ],
      linear: { ang: 0, scaled: 1 },
      tile: {},
    },
  ],
  [
    'Two stops last99percent',
    'XML duplicate hard stops',
    { stops: hardEdge, linear: { ang: 0, scaled: 1 }, tile: {} },
  ],
  [
    'Three symmetric stops',
    'XML ordinary alpha three stops',
    {
      stops: [
        { position: 0, color: 'FF0000', alpha: 0 },
        { position: 50000, color: '00FF00', alpha: 50000 },
        { position: 100000, color: '0000FF', alpha: 100000 },
      ],
      linear: { ang: 0, scaled: 1 },
      tile: {},
    },
  ],
  [
    'Four linear stops',
    'XML one hundred percent transparent',
    {
      stops: [
        { position: 0, color: 'FF0000', alpha: 0 },
        { position: 100000, color: '0000FF', alpha: 0 },
      ],
      linear: { ang: 0, scaled: 1 },
      tile: {},
    },
  ],
  [
    'Two stops alpha',
    'XML alpha constant blue',
    {
      stops: [
        { position: 0, color: '0000FF', alpha: 0 },
        { position: 100000, color: '0000FF', alpha: 100000 },
      ],
      linear: { ang: 0, scaled: 1 },
      tile: {},
    },
  ],
])
  replaceGradient(shapeByName(slide2, oldName), name, spec);

const slide3 = await get('ppt/slides/slide3.xml');
for (const [oldName, name, path] of [
  ['Center Rectangle', 'XML circle on rectangle', 'circle'],
  ['Center Ellipse', 'XML circle on ellipse', 'circle'],
  ['Center Triangle', 'XML shape on triangle', 'shape'],
  ['Center Round rectangle', 'XML shape on round rectangle', 'shape'],
])
  replaceGradient(shapeByName(slide3, oldName), name, {
    path,
    focus: { l: 50000, t: 50000, r: 50000, b: 50000 },
    tile: {},
    stops: three,
  });

const slide4 = await get('ppt/slides/slide4.xml');
for (const [oldName, name, spec] of [
  ['Corner variant 1', 'XML fillToRect absent', { path: 'rect', tile: {}, stops: three }],
  ['Corner variant 2', 'XML fillToRect empty', { path: 'rect', focus: {}, tile: {}, stops: three }],
  [
    'Corner variant 3',
    'XML path kind absent',
    { path: null, focus: { l: 50000, t: 50000, r: 50000, b: 50000 }, tile: {}, stops: three },
  ],
  [
    'Corner variant 4',
    'XML circle area focus',
    { path: 'circle', focus: { l: 25000, t: 25000, r: 25000, b: 25000 }, tile: {}, stops: three },
  ],
  [
    'Wide center rectangle variant2',
    'XML rect area focus',
    { path: 'rect', focus: { l: 25000, t: 25000, r: 25000, b: 25000 }, tile: {}, stops: three },
  ],
  [
    'Wide center ellipse variant2',
    'XML shape on ellipse',
    { path: 'shape', focus: { l: 50000, t: 50000, r: 50000, b: 50000 }, tile: {}, stops: three },
  ],
])
  replaceGradient(shapeByName(slide4, oldName), name, spec);

const slide5 = await get('ppt/slides/slide5.xml');
for (const angle of [0, 30, 90])
  for (const follow of [true, false]) {
    const oldName = `Rotated ${angle} follow ${follow ? 'True' : 'False'}`;
    replaceGradient(shapeByName(slide5, oldName), `XML circle rotated ${angle} follow ${follow}`, {
      path: 'circle',
      focus: { l: 25000, t: 50000, r: 75000, b: 50000 },
      tile: {},
      stops: three,
      attributes: { flip: 'none', rotWithShape: follow ? 1 : 0 },
    });
  }

const slide6 = await get('ppt/slides/slide6.xml');
replaceGradient(
  shapeByName(slide6, 'Attached text gradient'),
  'XML attached gradient outline',
  { linear: { ang: 0, scaled: 1 }, tile: {}, stops: three },
  true,
);
const slide7 = await get('ppt/slides/slide7.xml');
const themeShapes = descendants(slide7, 'sp').filter((shape) =>
  descendants(shape, 'cNvPr')[0].getAttribute('name').startsWith('Theme gradient style'),
);
replaceGradient(
  themeShapes[0],
  'XML gradient outline on rectangle',
  { linear: { ang: 5400000, scaled: 0 }, tile: {}, stops: blackWhite },
  true,
);
const fillRef = descendants(themeShapes[1], 'fillRef')[0];
fillRef.setAttribute('idx', '1003');
changes.push({ name: descendants(themeShapes[1], 'cNvPr')[0].getAttribute('name'), fillRef: 1003 });

// Additional XML-only geometry controls are cloned from this project's own slide.
const presentation = await get('ppt/presentation.xml');
const presentationRels = await get('ppt/_rels/presentation.xml.rels');
const contentTypes = await get('[Content_Types].xml');
const sldIdLst = descendants(presentation, 'sldIdLst')[0];
const template = await zip.file('ppt/slides/slide1.xml').async('string');
const templateRels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
const originalTemplate = parse(template);
const templateShape = shapeByName(originalTemplate, 'Linear 0');
async function addProbeSlide(index, title, cases) {
  const doc = parse(template),
    tree = descendants(doc, 'spTree')[0];
  for (const node of Array.from(tree.children)) if (node.localName === 'sp') node.remove();
  const heading = shapeByName(originalTemplate, 'Heading 1').cloneNode(true);
  descendants(heading, 'cNvPr')[0].setAttribute('id', '2');
  descendants(heading, 'cNvPr')[0].setAttribute('name', `XML heading ${index}`);
  descendants(heading, 't')[0].textContent = title;
  tree.append(heading);
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i],
      shape = templateShape.cloneNode(true);
    const name = descendants(shape, 'cNvPr')[0];
    name.setAttribute('id', String(i + 3));
    name.setAttribute('name', item.name);
    const transform = child(child(shape, 'spPr'), 'xfrm');
    const off = child(transform, 'off'),
      ext = child(transform, 'ext');
    off.setAttribute('x', String((40 + (i % 3) * 305) * 12700));
    off.setAttribute('y', String((105 + Math.floor(i / 3) * 140) * 12700));
    ext.setAttribute('cx', String(270 * 12700));
    ext.setAttribute('cy', String(105 * 12700));
    const geom = descendants(shape, 'prstGeom')[0];
    geom.setAttribute('prst', item.shape ?? 'rect');
    replaceGradient(shape, item.name, item.spec);
    tree.append(shape);
  }
  docs.set(`ppt/slides/slide${index}.xml`, doc);
  const rels = parse(templateRels);
  for (const relation of Array.from(rels.documentElement.children))
    if (relation.getAttribute('Type').endsWith('/notesSlide'))
      relation.setAttribute('Target', `../notesSlides/notesSlide${index}.xml`);
  docs.set(`ppt/slides/_rels/slide${index}.xml.rels`, rels);
  const notes = parse(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string'));
  const notesTexts = descendants(notes, 't');
  notesTexts.forEach((node, i) => {
    node.textContent =
      i === 0
        ? 'Explicitly XML-derived original-project gradient controls. This slide was not authored through PowerPoint COM.'
        : '';
  });
  docs.set(`ppt/notesSlides/notesSlide${index}.xml`, notes);
  const notesRels = parse(
    await zip.file('ppt/notesSlides/_rels/notesSlide1.xml.rels').async('string'),
  );
  for (const relation of Array.from(notesRels.documentElement.children))
    if (relation.getAttribute('Type').endsWith('/slide'))
      relation.setAttribute('Target', `../slides/slide${index}.xml`);
  docs.set(`ppt/notesSlides/_rels/notesSlide${index}.xml.rels`, notesRels);
  const rid = `rIdGradientProbe${index}`;
  presentationRels.documentElement.append(
    el(
      presentationRels,
      'Relationship',
      { Id: rid, Type: `${R}/slide`, Target: `slides/slide${index}.xml` },
      packageR,
    ),
  );
  const slideId = el(presentation, 'sldId', { id: 1024 + index }, P);
  slideId.setAttributeNS(R, 'r:id', rid);
  sldIdLst.append(slideId);
  for (const [part, type] of [
    [`/ppt/slides/slide${index}.xml`, 'slide'],
    [`/ppt/notesSlides/notesSlide${index}.xml`, 'notesSlide'],
  ]) {
    contentTypes.documentElement.append(
      el(
        contentTypes,
        'Override',
        {
          PartName: part,
          ContentType: `application/vnd.openxmlformats-officedocument.presentationml.${type}+xml`,
        },
        contentTypes.documentElement.namespaceURI,
      ),
    );
  }
}
await addProbeSlide(10, 'XML path/focus rectangle controls', [
  {
    name: 'XML rect center',
    spec: { path: 'rect', focus: { l: 50000, t: 50000, r: 50000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML circle center',
    spec: { path: 'circle', focus: { l: 50000, t: 50000, r: 50000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML shape rectangle center',
    spec: { path: 'shape', focus: { l: 50000, t: 50000, r: 50000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML rect left focus',
    spec: { path: 'rect', focus: { l: 0, t: 50000, r: 100000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML circle left focus',
    spec: { path: 'circle', focus: { l: 0, t: 50000, r: 100000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML shape triangle left focus',
    shape: 'triangle',
    spec: { path: 'shape', focus: { l: 0, t: 50000, r: 100000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML rect offset area',
    spec: { path: 'rect', focus: { l: 15000, t: 25000, r: 55000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML circle offset area',
    spec: { path: 'circle', focus: { l: 15000, t: 25000, r: 55000, b: 50000 }, tile: {} },
  },
  {
    name: 'XML shape ellipse offset area',
    shape: 'ellipse',
    spec: { path: 'shape', focus: { l: 15000, t: 25000, r: 55000, b: 50000 }, tile: {} },
  },
]);
await addProbeSlide(11, 'XML tiles, defaults and reflected gradients', [
  {
    name: 'XML rect inset tile',
    spec: {
      path: 'rect',
      focus: { l: 50000, t: 50000, r: 50000, b: 50000 },
      tile: { l: 25000, t: 25000, r: 25000, b: 25000 },
    },
  },
  {
    name: 'XML circle inset tile',
    spec: {
      path: 'circle',
      focus: { l: 50000, t: 50000, r: 50000, b: 50000 },
      tile: { l: 25000, t: 25000, r: 25000, b: 25000 },
    },
  },
  {
    name: 'XML shape inset tile',
    spec: {
      path: 'shape',
      focus: { l: 50000, t: 50000, r: 50000, b: 50000 },
      tile: { l: 25000, t: 25000, r: 25000, b: 25000 },
    },
  },
  {
    name: 'XML rect outset tile',
    spec: {
      path: 'rect',
      focus: { l: 50000, t: 50000, r: 50000, b: 50000 },
      tile: { l: -50000, t: -25000, r: 0, b: 0 },
    },
  },
  {
    name: 'XML circle outset tile',
    spec: {
      path: 'circle',
      focus: { l: 50000, t: 50000, r: 50000, b: 50000 },
      tile: { l: -50000, t: -25000, r: 0, b: 0 },
    },
  },
  { name: 'XML missing gradient kind', spec: { tile: {} } },
  { name: 'XML circle absent focus', spec: { path: 'circle', tile: {} } },
  { name: 'XML circle empty focus', spec: { path: 'circle', focus: {}, tile: {} } },
  {
    name: 'XML gradient missing flags',
    spec: { attributes: {}, linear: { ang: 1800000 }, stops: hardEdge },
  },
]);
for (let index = 1; index <= 9; index++) {
  const notes = await get(`ppt/notesSlides/notesSlide${index}.xml`);
  const body = descendants(notes, 'sp').find((shape) =>
    descendants(shape, 'ph').some((placeholder) => placeholder.getAttribute('type') === 'body'),
  );
  const text = body && descendants(body, 't')[0];
  if (text)
    text.textContent =
      'XML-derived gradient controls based on this original project fixture. Original authoring notes follow: ' +
      text.textContent;
}
const app = await get('docProps/app.xml');
for (const field of ['Slides', 'Notes']) descendants(app, field)[0].textContent = '11';
for (const [path, doc] of docs) zip.file(path, serialize(doc));
const result = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const output = 'tests/fixtures/powerpoint-gradient-probe.pptx';
await writeFile(resolve(root, output), result);
await writeFile(
  resolve(evidence, 'fixture-provenance.json'),
  JSON.stringify(
    {
      original: 'tests/fixtures/powerpoint-gradients.pptx',
      originalSha256: createHash('sha256').update(original).digest('hex'),
      output,
      probeSha256: createHash('sha256').update(result).digest('hex'),
      provenance:
        'Explicit XML derivation from sanitized original project PowerPoint fixture. Additional slides are XML-authored clones of project-owned content, not native COM authoring.',
      changes,
    },
    null,
    2,
  ) + '\n',
);
dom.window.close();
console.log(
  JSON.stringify({
    output,
    slides: 11,
    changes: changes.length,
    sha256: createHash('sha256').update(result).digest('hex'),
  }),
);
