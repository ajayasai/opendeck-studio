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
  const original = JSON.parse(await readFile(resolve(root, 'examples/rich-text.opendeck'), 'utf8'));
  const source = await readFile(
    resolve(root, 'test-results/rich-text-powerpoint/powerpoint-resaved.pptx'),
  );
  const { deck, warnings } = await importPptx(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
  assert.equal(deck.slides.length, 2);
  const canonical = (element) =>
    element.paragraphs.map((paragraph) => ({
      ...paragraph,
      // Office may split/join runs without changing any character formatting.
      runs: paragraph.runs.flatMap((run) =>
        Array.from(run.text || '\0').map((text) => ({ ...run, text })),
      ),
    }));
  for (let slideIndex = 0; slideIndex < deck.slides.length; slideIndex++) {
    assert.equal(deck.slides[slideIndex].notes, original.slides[slideIndex].notes, 'Speaker notes');
    const actual = deck.slides[slideIndex].elements.filter((element) => element.type === 'text');
    const expected = original.slides[slideIndex].elements.filter(
      (element) => element.type === 'text',
    );
    assert.equal(actual.length, expected.length, 'Text object count');
    for (let i = 0; i < expected.length; i++) {
      assert.equal(actual[i].text, expected[i].text, `Text projection: ${expected[i].name}`);
      assert.deepEqual(
        canonical(actual[i]),
        canonical(expected[i]),
        `Rich paragraph content: ${expected[i].name}`,
      );
    }
  }
  const result = {
    passed: true,
    slides: 2,
    checks: [
      'run text/font/size/color/bold/italic/underline/hyperlink',
      'paragraph alignment/list levels/start/spacing',
      'blank paragraphs and soft breaks',
      'speaker notes',
    ],
    warnings,
  };
  await writeFile(
    resolve(root, 'test-results/rich-text-powerpoint/roundtrip-check.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    'Native PowerPoint rich-text round-trip passed all run, paragraph, list, link, and notes checks.',
  );
} finally {
  await server.close();
  dom.window.close();
}
