// Explicitly XML-derived saved-scale probes, independently rendered in PowerPoint.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'test-results/autofit-powerpoint');
await mkdir(output, { recursive: true });
const original = await readFile(resolve(root, 'tests/fixtures/powerpoint-autofit.pptx'));
const zip = await JSZip.loadAsync(original);
const dom = new JSDOM();
const parse = (text) => new dom.window.DOMParser().parseFromString(text, 'application/xml');
const serialize = (node) => new dom.window.XMLSerializer().serializeToString(node);
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const attributes = (node) =>
  Object.fromEntries(Array.from(node?.attributes ?? []).map((attr) => [attr.name, attr.value]));
const plans = {
  'Plain shrink': ['60000', '20000'],
  'Mixed shrink': ['60000', '20000'],
  'Bulleted shrink': ['60000', '20000'],
  'Spaced shrink': ['60000', '20000'],
  'Probe scale only': ['80000', '0'],
  'Probe scale and reduction': ['80000', '20000'],
  'Probe fixed line spacing': ['80000', '20000'],
  'Probe percent-string values': ['80.000%', '20.000%'],
  'Probe paragraph spacing': ['50000', '0'],
  'Probe list indents': ['50000', '0'],
};
const originalFrames = [],
  alterations = [];
for (const path of Object.keys(zip.files).filter((path) =>
  /^ppt\/(slides\/slide|slideMasters\/slideMaster)\d+\.xml$/.test(path),
)) {
  const doc = parse(await zip.file(path).async('string'));
  let changed = false;
  for (const shape of descendants(doc, 'sp')) {
    const name = descendants(shape, 'cNvPr')[0]?.getAttribute('name');
    const body = descendants(shape, 'bodyPr')[0];
    if (!body || name?.startsWith('Bounds:')) continue;
    const choice = Array.from(body.children).find((node) =>
      ['noAutofit', 'normAutofit', 'spAutoFit'].includes(node.localName),
    );
    originalFrames.push({
      path,
      name,
      body: attributes(body),
      autofit: choice ? { mode: choice.localName, ...attributes(choice) } : null,
      paragraphs: descendants(shape, 'p').map((p) => ({
        properties: descendants(p, 'pPr')[0]?.outerHTML,
        fonts: descendants(p, 'rPr').map((run) => attributes(run)),
      })),
    });
    let factors = plans[name];
    if (
      path.startsWith('ppt/slideMasters/') &&
      descendants(shape, 'ph')[0]?.getAttribute('type') === 'body'
    )
      factors = ['80000', '20000'];
    if (name === 'Inherited normal default scale') {
      for (const child of Array.from(body.children))
        if (['noAutofit', 'normAutofit', 'spAutoFit'].includes(child.localName)) child.remove();
      alterations.push({
        path,
        name,
        change:
          'Removed materialized local normAutofit so the master normal choice and known factors are inherited.',
      });
      changed = true;
    } else if (factors) {
      for (const child of Array.from(body.children))
        if (['noAutofit', 'normAutofit', 'spAutoFit'].includes(child.localName)) child.remove();
      const normal = doc.createElementNS(
        'http://schemas.openxmlformats.org/drawingml/2006/main',
        'a:normAutofit',
      );
      normal.setAttribute('fontScale', factors[0]);
      normal.setAttribute('lnSpcReduction', factors[1]);
      body.appendChild(normal);
      alterations.push({
        path,
        name,
        mode: 'normAutofit',
        fontScale: factors[0],
        lnSpcReduction: factors[1],
      });
      changed = true;
    }
  }
  if (changed) zip.file(path, serialize(doc));
}
assert.equal(
  alterations.filter((item) => item.name === 'Inherited normal default scale').length,
  1,
);
const probe = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(resolve(root, 'tests/fixtures/powerpoint-autofit-saved-scale-probe.pptx'), probe);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await writeFile(
  resolve(output, 'fixture-provenance.json'),
  JSON.stringify(
    {
      original: {
        path: 'tests/fixtures/powerpoint-autofit.pptx',
        sha256: hash(original),
        source:
          'Original project content authored through PowerPoint COM with metadata sanitized. COM enables normal AutoFit but does not calculate saved shrink factors in this windowless workflow.',
      },
      probe: {
        path: 'tests/fixtures/powerpoint-autofit-saved-scale-probe.pptx',
        sha256: hash(probe),
        source:
          'XML-derived known-factor probe, not claimed to be directly authored by PowerPoint. Run font sizes, paragraph spacing, lists and original shape geometry remain unchanged.',
        alterations,
      },
      originalFrames,
    },
    null,
    2,
  ) + '\n',
);
dom.window.close();
console.log(
  JSON.stringify({
    originalSha256: hash(original),
    probeSha256: hash(probe),
    alterations: alterations.length,
  }),
);
