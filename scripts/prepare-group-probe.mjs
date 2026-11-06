// XML-derived diagnostic cases; source is the original sanitized project COM fixture.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/group-powerpoint');
await mkdir(evidence, { recursive: true });
const input = await readFile(resolve(root, 'tests/fixtures/powerpoint-groups.pptx'));
const zip = await JSZip.loadAsync(input);
const dom = new JSDOM();
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const parse = (s) => new dom.window.DOMParser().parseFromString(s, 'application/xml');
const serial = (n) => new dom.window.XMLSerializer().serializeToString(n);
const child = (n, name) => Array.from(n.children).find((x) => x.localName === name);
const desc = (n, name) => Array.from(n.getElementsByTagNameNS('*', name));
const nameOf = (n) => desc(n, 'cNvPr')[0]?.getAttribute('name');
const documents = new Map();
for (let s = 1; s <= 8; s++)
  documents.set(s, parse(await zip.file(`ppt/slides/slide${s}.xml`).async('string')));
const changes = [];
function element(doc, ns, name, attrs = {}) {
  const node = doc.createElementNS(ns, `${ns === A ? 'a' : 'p'}:${name}`);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
function group(slide, name) {
  return desc(documents.get(slide), 'grpSp').find((n) => nameOf(n) === name);
}
function rename(node, name, detail) {
  const original = nameOf(node);
  desc(node, 'cNvPr')[0].setAttribute('name', name);
  changes.push({ original, name, ...detail });
}
function shiftOrigin(node, dx, dy) {
  const xfrm = child(child(node, 'grpSpPr'), 'xfrm'),
    offset = child(xfrm, 'chOff');
  offset.setAttribute('x', Number(offset.getAttribute('x')) + dx);
  offset.setAttribute('y', Number(offset.getAttribute('y')) + dy);
  for (const n of Array.from(node.children).filter((n) =>
    ['sp', 'pic', 'cxnSp', 'graphicFrame', 'grpSp'].includes(n.localName),
  )) {
    const xf =
      n.localName === 'grpSp'
        ? child(child(n, 'grpSpPr'), 'xfrm')
        : n.localName === 'graphicFrame'
          ? child(n, 'xfrm')
          : child(child(n, 'spPr'), 'xfrm');
    const off = child(xf, 'off');
    off.setAttribute('x', Number(off.getAttribute('x')) + dx);
    off.setAttribute('y', Number(off.getAttribute('y')) + dy);
  }
}
let node = group(1, 'Baseline group');
shiftOrigin(node, -600 * 12700, -500 * 12700);
rename(node, 'XML negative child origin', {
  offsetPoints: [-600, -500],
  expected: 'Same pixels as original baseline',
});
node = group(1, 'Half group');
child(child(child(node, 'grpSpPr'), 'xfrm'), 'chExt').setAttribute('cx', '0');
rename(node, 'XML zero child width', { childWidth: 0 });
node = group(1, 'Larger group');
child(child(child(node, 'grpSpPr'), 'xfrm'), 'chExt').setAttribute('cy', '0');
rename(node, 'XML zero child height', { childHeight: 0 });
node = group(5, 'Nested baseline inner');
shiftOrigin(node, -400 * 12700, 300 * 12700);
rename(node, 'XML nested shifted child origin', {
  offsetPoints: [-400, 300],
  expected: 'Same pixels as original nested baseline',
});
for (const n of desc(documents.get(4), 'grpSp')) {
  const text = Array.from(n.children).find(
    (n) => n.localName === 'sp' && nameOf(n)?.endsWith(' text'),
  );
  if (!text) continue;
  const body = child(child(text, 'txBody'), 'bodyPr');
  body.setAttribute('lIns', String(30 * 12700));
  body.setAttribute('rIns', String(5 * 12700));
  body.setAttribute('tIns', String(3 * 12700));
  body.setAttribute('bIns', '0');
  rename(text, 'XML asymmetric ' + nameOf(text), {
    insetsPoints: { left: 30, right: 5, top: 3, bottom: 0 },
    expected: 'Native glyph handling under ancestor group reflections',
  });
}
// Native COM rejects table grouping. This case is explicitly package-authored instead.
{
  const doc = documents.get(8),
    tree = desc(doc, 'spTree')[0],
    table = desc(doc, 'graphicFrame')[0],
    rect = Array.from(tree.children).find((n) => nameOf(n) === 'Native table companion');
  const g = element(doc, P, 'grpSp'),
    nv = element(doc, P, 'nvGrpSpPr');
  nv.append(
    element(doc, P, 'cNvPr', { id: 900, name: 'XML grouped table control' }),
    element(doc, P, 'cNvGrpSpPr'),
    element(doc, P, 'nvPr'),
  );
  const props = element(doc, P, 'grpSpPr'),
    xf = element(doc, A, 'xfrm', { rot: 10 * 60000 });
  xf.append(
    element(doc, A, 'off', { x: 70 * 12700, y: 130 * 12700 }),
    element(doc, A, 'ext', { cx: 640 * 12700, cy: 200 * 12700 }),
    element(doc, A, 'chOff', { x: 70 * 12700, y: 130 * 12700 }),
    element(doc, A, 'chExt', { cx: 640 * 12700, cy: 200 * 12700 }),
  );
  props.append(xf);
  g.append(nv, props, table, rect);
  tree.append(g);
  changes.push({
    name: 'XML grouped table control',
    expected: 'Native open support and graphicFrame relationship compatibility',
    rotation: 10,
  });
}
// A group-level effect is outside current supported paint semantics.
node = group(3, 'Reflect rotate30 group');
{
  const doc = node.ownerDocument,
    props = child(node, 'grpSpPr');
  for (const n of Array.from(props.children).filter((n) =>
    ['effectLst', 'effectDag'].includes(n.localName),
  ))
    n.remove();
  const effects = element(doc, A, 'effectLst'),
    shadow = element(doc, A, 'outerShdw', {
      blurRad: 4 * 12700,
      dist: 8 * 12700,
      dir: 45 * 60000,
      algn: 'ctr',
      rotWithShape: '0',
    }),
    color = element(doc, A, 'srgbClr', { val: '000000' });
  color.append(element(doc, A, 'alpha', { val: 50000 }));
  shadow.append(color);
  effects.append(shadow);
  props.append(effects);
  rename(node, 'XML group shadow control', {
    effect: 'outerShdw',
    expected: 'Unsupported group effect warning, preservation boundary',
  });
}
for (const [s, doc] of documents) zip.file(`ppt/slides/slide${s}.xml`, serial(doc));
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const output = 'tests/fixtures/powerpoint-groups-probe.pptx';
await writeFile(resolve(root, output), bytes);
const record = {
  source: 'Original project COM fixture; all edits here are explicit XML-derived controls',
  inputSha256: createHash('sha256').update(input).digest('hex'),
  output,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  changes,
};
await writeFile(resolve(evidence, 'probe-provenance.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
dom.window.close();
