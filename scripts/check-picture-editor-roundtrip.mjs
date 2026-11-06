// Native save check complements the independent authored-model PNG pixel gate.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url)),
  dir = resolve(root, 'test-results/picture-geometry-powerpoint');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const original = await readFile(resolve(dir, 'editor-authored.pptx')),
    saved = await readFile(resolve(dir, 'editor-authored-resaved.pptx'));
  const verification = JSON.parse(
    (await readFile(resolve(dir, 'editor-verification.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  assert.equal(
    verification.results[0].sha256.toLowerCase(),
    createHash('sha256').update(original).digest('hex'),
  );
  const asArray = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const before = (await importPptx(asArray(original))).deck,
    after = (await importPptx(asArray(saved))).deck;
  const rect = (r) =>
    Object.fromEntries(['left', 'top', 'right', 'bottom'].map((k) => [k, r?.[k] ?? 0]));
  let count = 0;
  assert.equal(after.slides.length, before.slides.length);
  before.slides.forEach((slide, i) => {
    assert.equal(after.slides[i].notes, slide.notes);
    assert.equal(after.slides[i].elements.length, slide.elements.length);
    slide.elements.forEach((e, j) => {
      const a = after.slides[i].elements[j];
      assert.equal(a.type, e.type);
      if (e.type === 'image') {
        for (const k of ['src', 'alt', 'fit', 'orientation'])
          assert.equal(a[k], e[k], e.name + ' ' + k);
        for (const k of ['x', 'y', 'width', 'height', 'rotation', 'opacity'])
          assert.ok(Math.abs(a[k] - e[k]) < 0.001, e.name + ' ' + k);
        for (const k of ['crop', 'fillRect'])
          for (const side of ['left', 'top', 'right', 'bottom'])
            assert.ok(
              Math.abs(rect(a[k])[side] - rect(e[k])[side]) < 0.00002,
              e.name + ' ' + k + ' ' + side,
            );
        for (const k of ['flipH', 'flipV'])
          assert.equal(a[k] ?? false, e[k] ?? false, e.name + ' ' + k);
        count++;
      } else if (e.type === 'text') assert.equal(a.text, e.text);
    });
  });
  const result = {
    passed: true,
    sha256: createHash('sha256').update(original).digest('hex'),
    slides: before.slides.length,
    pictures: count,
    scope:
      'Native-save stability of exported fit rectangles and materialized legacy EXIF geometry; independent appearance is checked by analyze-picture-editor-native.py.',
  };
  await writeFile(
    resolve(dir, 'editor-roundtrip-check.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
} finally {
  await server.close();
  dom.window.close();
}
