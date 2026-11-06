// Rebuild original example files from the same scene graph used by the app.
import { mkdir, writeFile } from 'node:fs/promises';
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
  const { createDeck, validateDeck } = await server.ssrLoadModule('/src/model.ts');
  const { exportPptx, importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const deck = createDeck();
  const bytes = await (await exportPptx(deck)).arrayBuffer();
  validateDeck((await importPptx(bytes)).deck);
  await mkdir(resolve(root, 'examples'), { recursive: true });
  await writeFile(
    resolve(root, 'examples/field-notes.opendeck'),
    JSON.stringify(deck, null, 2) + '\n',
  );
  await writeFile(resolve(root, 'examples/field-notes.pptx'), new Uint8Array(bytes));
  console.log(
    'Generated and re-imported original field-notes.opendeck and field-notes.pptx examples.',
  );
} finally {
  await server.close();
  dom.window.close();
}
