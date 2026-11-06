// A separately attributed XML-derived probe, never mislabeled as COM-authored.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'test-results/text-frame-powerpoint');
await mkdir(output, { recursive: true });
const original = await readFile(resolve(root, 'tests/fixtures/powerpoint-text-frame.pptx'));
const attached = await readFile(
  resolve(root, 'tests/fixtures/powerpoint-text-frame-attached-outline-probe.pptx'),
);
const zip = await JSZip.loadAsync(original);
const dom = new JSDOM();
const parse = (text) => new dom.window.DOMParser().parseFromString(text, 'application/xml');
const serialize = (node) => new dom.window.XMLSerializer().serializeToString(node);
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const attributes = (node) =>
  Object.fromEntries(Array.from(node?.attributes ?? []).map((attr) => [attr.name, attr.value]));
const frameAttributes = [
  'lIns',
  'tIns',
  'rIns',
  'bIns',
  'anchor',
  'wrap',
  'horzOverflow',
  'vertOverflow',
];
const inspected = [];
const alterations = [];
for (const path of Object.keys(zip.files).filter((path) =>
  /^ppt\/slides\/slide\d+\.xml$/.test(path),
)) {
  const doc = parse(await zip.file(path).async('string'));
  let changed = false;
  for (const shape of descendants(doc, 'sp')) {
    const name = descendants(shape, 'cNvPr')[0]?.getAttribute('name');
    const body = descendants(shape, 'bodyPr')[0];
    if (!body) continue;
    inspected.push({
      path,
      name,
      placeholder: attributes(descendants(shape, 'ph')[0]),
      body: attributes(body),
      autofit: Array.from(body.children).map((child) => child.localName),
    });
    if (name?.startsWith('Inherited ')) {
      assert.equal(
        frameAttributes.some((attribute) => body.hasAttribute(attribute)),
        false,
        `${name}: expected genuine inherited local frame properties`,
      );
    }
    const changes = {};
    if (['Negative insets', 'Negative overflow control'].includes(name)) {
      for (const [attribute, points] of Object.entries({
        lIns: -18,
        tIns: -12,
        rIns: -24,
        bIns: -8,
      }))
        changes[attribute] = String(points * 12700);
    }
    if (
      ['No wrap overflow', 'Positive overflow control', 'Negative overflow control'].includes(name)
    )
      changes.horzOverflow = 'clip';
    if (
      [
        'Wrapped vertical overflow',
        'Positive overflow control',
        'Negative overflow control',
      ].includes(name)
    )
      changes.vertOverflow = 'clip';
    if (Object.keys(changes).length) {
      alterations.push({ path, name, attributes: changes });
      for (const [name, value] of Object.entries(changes)) body.setAttribute(name, value);
      changed = true;
    }
  }
  if (changed) zip.file(path, serialize(doc));
}

// Independently verify slide6→layout→master uses a content idx not present in
// the master. Attribute inspection is separate from the application importer.
async function relatedPart(part, suffix) {
  const relationshipPath = posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`);
  const rels = parse(await zip.file(relationshipPath).async('string'));
  const rel = descendants(rels, 'Relationship').find((rel) =>
    rel.getAttribute('Type')?.endsWith(suffix),
  );
  assert.ok(rel, `Missing ${suffix} relationship`);
  return posix.normalize(posix.join(posix.dirname(part), rel.getAttribute('Target')));
}
const layoutPath = await relatedPart('ppt/slides/slide6.xml', '/slideLayout');
const masterPath = await relatedPart(layoutPath, '/slideMaster');
const layout = parse(await zip.file(layoutPath).async('string'));
const master = parse(await zip.file(masterPath).async('string'));
const layoutSecondContent = descendants(layout, 'sp').find(
  (shape) => descendants(shape, 'ph')[0]?.getAttribute('idx') === '2',
);
const masterBody = descendants(master, 'sp').find(
  (shape) => descendants(shape, 'ph')[0]?.getAttribute('type') === 'body',
);
assert.ok(layoutSecondContent && masterBody, 'Expected layout content idx2 and master body');
assert.equal(descendants(masterBody, 'ph')[0].getAttribute('idx'), '1');
assert.equal(
  frameAttributes.some((name) => descendants(layoutSecondContent, 'bodyPr')[0].hasAttribute(name)),
  false,
);
const masterInheritance = {
  layoutPath,
  layoutPlaceholder: attributes(descendants(layoutSecondContent, 'ph')[0]),
  masterPath,
  masterPlaceholder: attributes(descendants(masterBody, 'ph')[0]),
  masterBody: attributes(descendants(masterBody, 'bodyPr')[0]),
};
const probe = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(resolve(root, 'tests/fixtures/powerpoint-text-frame-clip-probe.pptx'), probe);
const hash = (value) => createHash('sha256').update(value).digest('hex');
await writeFile(
  resolve(output, 'fixture-provenance.json'),
  JSON.stringify(
    {
      original: {
        path: 'tests/fixtures/powerpoint-text-frame.pptx',
        sha256: hash(original),
        source:
          'Original project content authored through Microsoft PowerPoint COM, with profile metadata sanitized.',
      },
      attachedOutlineProbe: {
        path: 'tests/fixtures/powerpoint-text-frame-attached-outline-probe.pptx',
        sha256: hash(attached),
        source:
          'Original COM-authored version saved before replacing attached textbox borders with separate marker rectangles. Retained to reproduce the known attached-border omission.',
      },
      probe: {
        path: 'tests/fixtures/powerpoint-text-frame-clip-probe.pptx',
        sha256: hash(probe),
        source:
          'XML-derived copy of the original fixture, not directly COM-authored. Only the listed bodyPr attributes differ.',
        alterations,
      },
      originalFrames: inspected,
      masterInheritance,
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
    alteredShapes: alterations.length,
    inheritanceVerified: true,
  }),
);
