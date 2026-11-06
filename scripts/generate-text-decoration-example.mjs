// Original COM fixture and explicitly XML-derived probe travel through OpenDeck.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { importPptx, exportPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const sources = [
    {
      input: 'tests/fixtures/powerpoint-text-decoration.pptx',
      output: 'examples/text-decoration',
      title: 'Attached text decorations and preset geometry',
    },
    {
      input: 'tests/fixtures/powerpoint-text-decoration-probe.pptx',
      output: 'test-results/text-decoration-powerpoint/probe-exported',
      title: 'XML-derived paragraph endpoints, outline and style controls',
    },
  ];
  const results = [];
  for (const item of sources) {
    const source = await readFile(resolve(root, item.input));
    const imported = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    imported.deck.title = item.title;
    const exported = new Uint8Array(await (await exportPptx(imported.deck)).arrayBuffer());
    await mkdir(resolve(root, item.output, '..'), { recursive: true });
    await writeFile(
      resolve(root, `${item.output}.opendeck`),
      JSON.stringify(imported.deck, null, 2) + '\n',
    );
    await writeFile(resolve(root, `${item.output}.pptx`), exported);
    results.push({
      input: item.input,
      inputSha256: createHash('sha256').update(source).digest('hex'),
      output: `${item.output}.pptx`,
      outputSha256: createHash('sha256').update(exported).digest('hex'),
      slides: imported.deck.slides.length,
      warnings: imported.warnings,
    });
  }
  await writeFile(
    resolve(root, 'test-results/text-decoration-powerpoint/generation.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  await server.close();
  dom.window.close();
}
