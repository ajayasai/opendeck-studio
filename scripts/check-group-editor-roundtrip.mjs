// Native save stability for original editor-authored groups, including relationship-bearing leaves.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url)),
  dir = resolve(root, 'test-results/group-powerpoint');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
function near(a, b, label) {
  if (typeof a === 'number' && typeof b === 'number') {
    assert.ok(Math.abs(a - b) < 0.001, `${label}: ${a} vs ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, label);
    a.forEach((v, i) => near(v, b[i], label + '.' + i));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), label);
    for (const k of Object.keys(a)) near(a[k], b[k], label + '.' + k);
    return;
  }
  assert.equal(a, b, label);
}
try {
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const source = await readFile(resolve(dir, 'editor-authored.pptx')),
    saved = await readFile(resolve(dir, 'editor-authored-resaved.pptx'));
  const evidence = JSON.parse(
    (await readFile(resolve(dir, 'editor-verification.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  const hash = createHash('sha256').update(source).digest('hex');
  assert.equal(evidence.results[0].sha256.toLowerCase(), hash);
  const array = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const before = (await importPptx(array(source))).deck,
    after = (await importPptx(array(saved))).deck;
  let groups = 0,
    pictures = 0,
    tables = 0,
    charts = 0,
    links = 0;
  function compare(want, got) {
    assert.equal(want.length, got.length, 'Sibling count/order');
    want.forEach((e, i) => {
      const a = got[i];
      assert.equal(a.type, e.type, e.name);
      assert.equal(a.name, e.name, 'Source name');
      for (const k of ['x', 'y', 'width', 'height', 'rotation', 'opacity'])
        near(a[k], e[k], e.name + ' ' + k);
      if (e.type === 'group') {
        groups++;
        near(a.childFrame, e.childFrame, e.name + ' child frame');
        for (const k of ['flipH', 'flipV']) assert.equal(a[k] ?? false, e[k] ?? false);
        compare(e.children, a.children);
      } else if (e.type === 'image') {
        pictures++;
        for (const k of ['src', 'alt', 'fit', 'orientation'])
          assert.equal(a[k], e[k], e.name + ' ' + k);
        for (const k of ['crop', 'fillRect'])
          for (const side of ['left', 'top', 'right', 'bottom'])
            near(a[k]?.[side] ?? 0, e[k]?.[side] ?? 0, e.name + ' ' + k + '.' + side);
        for (const k of ['flipH', 'flipV']) assert.equal(a[k] ?? false, e[k] ?? false);
      } else if (e.type === 'table') {
        tables++;
        near(a.rows, e.rows, e.name + ' cells');
      } else if (e.type === 'chart') {
        charts++;
        for (const k of ['chartType', 'labels', 'values']) near(a[k], e[k], e.name + ' ' + k);
      } else if (e.type === 'text') {
        assert.equal(a.text, e.text, e.name + ' content');
        const hrefs = (t) =>
          t.paragraphs.flatMap((p) => p.runs.filter((r) => r.hyperlink).map((r) => r.hyperlink));
        near(hrefs(a), hrefs(e), e.name + ' hyperlink relationships');
        links += hrefs(e).length;
      }
    });
  }
  assert.equal(before.slides.length, after.slides.length);
  before.slides.forEach((s, i) => {
    assert.equal(after.slides[i].notes, s.notes);
    compare(s.elements, after.slides[i].elements);
  });
  assert.ok(
    groups && pictures && tables && charts && links,
    'All relationship controls remain represented',
  );
  const report = {
    passed: true,
    sha256: hash,
    slides: before.slides.length,
    groups,
    pictures,
    tables,
    charts,
    links,
    scope:
      'Native open/save preserves group hierarchy/local transforms, image bytes/crop/orientation, chart data, table values and safe external text hyperlinks. Independent native appearance is checked separately.',
  };
  await writeFile(
    resolve(dir, 'editor-roundtrip-check.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await server.close();
  dom.window.close();
}
