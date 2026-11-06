// Convert the project's original PowerPoint-authored rich fixture through OpenDeck.
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
  const source = await readFile(resolve(root, 'tests/fixtures/powerpoint-rich-text.pptx'));
  const imported = await importPptx(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
  imported.deck.title = 'Rich text, real compatibility';
  await mkdir(resolve(root, 'examples'), { recursive: true });
  await writeFile(
    resolve(root, 'examples/rich-text.opendeck'),
    JSON.stringify(imported.deck, null, 2) + '\n',
  );
  await writeFile(
    resolve(root, 'examples/rich-text.pptx'),
    new Uint8Array(await (await exportPptx(imported.deck)).arrayBuffer()),
  );
  console.log(JSON.stringify({ slides: imported.deck.slides.length, warnings: imported.warnings }));
} finally {
  await server.close();
  dom.window.close();
}
