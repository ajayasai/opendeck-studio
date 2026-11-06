import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const original = JSON.parse(
    await readFile(resolve(root, 'examples/field-notes.opendeck'), 'utf8'),
  );
  const source = await readFile(
    resolve(root, 'test-results/powerpoint-render/powerpoint-resaved.pptx'),
  );
  const imported = await importPptx(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
  assert.equal(
    imported.deck.slides.length,
    original.slides.length,
    'PowerPoint round-trip slide count',
  );
  for (let i = 0; i < original.slides.length; i++) {
    assert.equal(
      imported.deck.slides[i].elements.length,
      original.slides[i].elements.length,
      `Slide ${i + 1} object count`,
    );
    assert.equal(
      imported.deck.slides[i].notes,
      original.slides[i].notes,
      `Slide ${i + 1} speaker notes`,
    );
    const text = (slide) =>
      slide.elements.filter((element) => element.type === 'text').map((element) => element.text);
    assert.deepEqual(
      text(imported.deck.slides[i]),
      text(original.slides[i]),
      `Slide ${i + 1} editable text`,
    );
  }
  const result = {
    slideCount: imported.deck.slides.length,
    checks: ['slide count', 'object counts', 'speaker notes', 'editable text'],
    warnings: imported.warnings,
  };
  await writeFile(
    resolve(root, 'test-results/powerpoint-render/roundtrip-check.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    'PowerPoint re-save round-trip passed: 5 slides, object counts, speaker notes, and editable text.',
  );
} finally {
  await server.close();
  dom.window.close();
}
