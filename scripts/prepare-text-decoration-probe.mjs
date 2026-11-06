// Explicitly XML-derived controls; the sanitized COM original remains immutable.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/text-decoration-powerpoint');
await mkdir(evidence, { recursive: true });
const original = await readFile(resolve(root, 'tests/fixtures/powerpoint-text-decoration.pptx'));
const zip = await JSZip.loadAsync(original);
const dom = new JSDOM();
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const child = (node, name) => Array.from(node.children).find((item) => item.localName === name);
const parse = (text) => new dom.window.DOMParser().parseFromString(text, 'application/xml');
const serialize = (node) => new dom.window.XMLSerializer().serializeToString(node);
const element = (document, name, attrs = {}) => {
  const node = document.createElementNS(A, `a:${name}`);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
const alterations = [],
  originalShapes = [];
const documents = new Map();
for (const path of Object.keys(zip.files).filter((path) =>
  /^ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster)\d+\.xml$/.test(path),
)) {
  documents.set(path, parse(await zip.file(path).async('string')));
}
function shapeByName(document, name) {
  const result = descendants(document, 'sp').find(
    (shape) => descendants(shape, 'cNvPr')[0]?.getAttribute('name') === name,
  );
  assert.ok(result, `Expected original shape: ${name}`);
  return result;
}
function paragraphProbe(shape) {
  const body = child(shape, 'txBody'),
    document = shape.ownerDocument;
  const template = child(body, 'p');
  const runTemplate = child(template, 'r')?.cloneNode(true);
  for (const paragraph of Array.from(body.children).filter((node) => node.localName === 'p'))
    paragraph.remove();
  for (const text of ['Inherited first', 'Inherited middle', 'Inherited last']) {
    const paragraph = template.cloneNode(true);
    for (const node of Array.from(paragraph.children).filter(
      (node) => !['pPr', 'endParaRPr'].includes(node.localName),
    ))
      node.remove();
    let properties = child(paragraph, 'pPr');
    if (!properties) {
      properties = element(document, 'pPr');
      paragraph.prepend(properties);
    }
    for (const name of ['spcBef', 'spcAft']) {
      child(properties, name)?.remove();
      const spacing = element(document, name);
      spacing.append(element(document, 'spcPts', { val: name === 'spcBef' ? 1000 : 2000 }));
      properties.append(spacing);
    }
    const run = runTemplate?.cloneNode(true) ?? element(document, 'r');
    child(run, 't')?.remove();
    const value = element(document, 't');
    value.textContent = text;
    run.append(value);
    paragraph.insertBefore(run, child(paragraph, 'endParaRPr') ?? null);
    body.append(paragraph);
  }
}

for (const [path, document] of documents) {
  for (const shape of descendants(document, 'sp')) {
    const name = descendants(shape, 'cNvPr')[0]?.getAttribute('name');
    if (path.startsWith('ppt/slides/'))
      originalShapes.push({
        path,
        name,
        properties: child(shape, 'spPr')?.outerHTML,
        style: child(shape, 'style')?.outerHTML,
        body: child(child(shape, 'txBody'), 'bodyPr')?.outerHTML,
      });
    const body = descendants(shape, 'bodyPr')[0];
    if (name?.startsWith('Edge ')) {
      const [, mode, flag] = name.split(' ');
      if (flag === 'default') body.removeAttribute('spcFirstLastPara');
      else body.setAttribute('spcFirstLastPara', flag === 'true' ? '1' : '0');
      if (mode === 'shrink') {
        const fitting = child(body, 'normAutofit');
        assert.ok(fitting);
        fitting.setAttribute('fontScale', '80000');
        fitting.setAttribute('lnSpcReduction', '0');
      }
      alterations.push({
        path,
        name,
        edgeFlag: flag,
        autoFit: mode,
        source: 'XML-derived endpoint flag; shrink known factor80percent',
      });
    }
  }
}

// Materialize every DrawingML preset dash token on eleven derived controls.
const dashes = [
  'solid',
  'dot',
  'dash',
  'lgDash',
  'dashDot',
  'lgDashDot',
  'lgDashDotDot',
  'sysDash',
  'sysDot',
  'sysDashDot',
  'sysDashDotDot',
];
const dashDocument = documents.get('ppt/slides/slide2.xml');
const dashTemplate = shapeByName(dashDocument, 'Native dash Solid').cloneNode(true);
const shapeTree = descendants(dashDocument, 'spTree')[0];
for (const shape of descendants(dashDocument, 'sp').filter((shape) =>
  descendants(shape, 'cNvPr')[0]?.getAttribute('name')?.startsWith('Native dash '),
))
  shape.remove();
for (const [index, dash] of dashes.entries()) {
  const shape = dashTemplate.cloneNode(true),
    name = `XML dash ${dash}`;
  const properties = descendants(shape, 'cNvPr')[0];
  properties.setAttribute('id', String(100 + index));
  properties.setAttribute('name', name);
  const transform = descendants(shape, 'xfrm')[0];
  const x = 45 + (index % 3) * 305,
    y = 105 + Math.floor(index / 3) * 105;
  child(transform, 'off').setAttribute('x', String(x * 12700));
  child(transform, 'off').setAttribute('y', String(y * 12700));
  child(transform, 'ext').setAttribute('cx', String(260 * 12700));
  child(transform, 'ext').setAttribute('cy', String(72 * 12700));
  const line = child(child(shape, 'spPr'), 'ln');
  line.setAttribute('cap', 'flat');
  child(line, 'prstDash').setAttribute('val', dash);
  descendants(shape, 't')[0].textContent = dash;
  shapeTree.append(shape);
  alterations.push({
    path: 'ppt/slides/slide2.xml',
    name,
    dash,
    source: 'XML-cloned original native rectangle with explicit flat cap',
  });
}

const themeDocument = documents.get('ppt/slides/slide6.xml');
const noStyle = shapeByName(themeDocument, 'Theme style 1');
for (const name of ['fillRef', 'lnRef']) descendants(noStyle, name)[0].setAttribute('idx', '0');
alterations.push({ path: 'ppt/slides/slide6.xml', name: 'Theme style 1', fillRef: 0, lnRef: 0 });
descendants(shapeByName(themeDocument, 'Theme style 3'), 'fillRef')[0].setAttribute('idx', '1001');
alterations.push({ path: 'ppt/slides/slide6.xml', name: 'Theme style 3', fillRef: 1001 });

// Native COM-authored controls use round joins. These separate XML controls
// distinguish bevel and a miter whose ratio limit is two (200 percent).
for (const plan of [
  { path: 'ppt/slides/slide5.xml', name: 'Centered thick rectangle', join: 'bevel' },
  { path: 'ppt/slides/slide4.xml', name: 'Triangle text region', join: 'miter', limit: 200000 },
]) {
  const shape = shapeByName(documents.get(plan.path), plan.name);
  const line = child(child(shape, 'spPr'), 'ln');
  for (const node of Array.from(line.children).filter((node) =>
    ['round', 'bevel', 'miter'].includes(node.localName),
  ))
    node.remove();
  const join = element(
    shape.ownerDocument,
    plan.join,
    plan.limit === undefined ? {} : { lim: plan.limit },
  );
  line.insertBefore(join, child(line, 'headEnd') ?? null);
  if (plan.join === 'miter') line.setAttribute('w', '152400');
  alterations.push({ ...plan, source: 'XML-derived line join; triangle line width12pt' });
}

// True master flag; false layout override; false slide override. Values are
// intentionally authored in XML because COM does not expose this body property.
const master = documents.get('ppt/slideMasters/slideMaster1.xml');
const masterBody = descendants(master, 'sp').find(
  (shape) => descendants(shape, 'ph')[0]?.getAttribute('type') === 'body',
);
assert.ok(masterBody);
descendants(masterBody, 'bodyPr')[0].setAttribute('spcFirstLastPara', '1');
alterations.push({
  path: 'ppt/slideMasters/slideMaster1.xml',
  placeholder: 'body',
  edgeFlag: true,
});
const layout2 = documents.get('ppt/slideLayouts/slideLayout2.xml');
for (const shape of descendants(layout2, 'sp')) {
  const placeholder = descendants(shape, 'ph')[0];
  if (!placeholder) continue;
  const type = placeholder.getAttribute('type');
  if (type === 'title' || (!type && placeholder.getAttribute('idx') === '1')) {
    descendants(shape, 'bodyPr')[0].setAttribute('spcFirstLastPara', type === 'title' ? '1' : '0');
    alterations.push({
      path: 'ppt/slideLayouts/slideLayout2.xml',
      placeholder: type || 'content',
      edgeFlag: type === 'title',
    });
  }
}
const inherited = documents.get('ppt/slides/slide8.xml');
for (const number of [2, 3]) {
  const shape = shapeByName(inherited, `Master decoration placeholder ${number}`);
  paragraphProbe(shape);
  if (number === 3) descendants(shape, 'bodyPr')[0].setAttribute('spcFirstLastPara', '0');
  alterations.push({
    path: 'ppt/slides/slide8.xml',
    name: `Master decoration placeholder ${number}`,
    edgeFlag: number === 2 ? 'inherited true' : 'local false',
    paragraphs: 'three original comparison paragraphs, before10/after20pt',
  });
}
for (const [path, document] of documents) zip.file(path, serialize(document));
const probe = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const output = 'tests/fixtures/powerpoint-text-decoration-probe.pptx';
await writeFile(resolve(root, output), probe);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await writeFile(
  resolve(evidence, 'fixture-provenance.json'),
  JSON.stringify(
    {
      original: {
        path: 'tests/fixtures/powerpoint-text-decoration.pptx',
        sha256: hash(original),
        source: 'Original PowerPoint COM-authored project content; sanitized profile metadata',
      },
      probe: {
        path: output,
        sha256: hash(probe),
        source:
          'Explicitly XML-derived endpoint-spacing, dash and theme-reference probe; not directly PowerPoint-authored',
        alterations,
      },
      originalShapes,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    originalSha256: hash(original),
    probeSha256: hash(probe),
    alterations: alterations.length,
  }),
);
dom.window.close();
