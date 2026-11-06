// Public example derives directly from the original COM-authored project fixture.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/group-powerpoint');
await mkdir(evidence, { recursive: true });
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { importPptx, exportPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const results = [];
  for (const item of [
    {
      input: 'tests/fixtures/powerpoint-groups.pptx',
      output: 'examples/groups',
      title: 'Original native grouping and transform controls',
    },
    {
      input: 'tests/fixtures/powerpoint-groups-probe.pptx',
      output: 'test-results/group-powerpoint/probe-exported',
      title: 'XML-derived group origins, extents and reflection controls',
    },
    {
      input: 'tests/fixtures/powerpoint-groups-rotation.pptx',
      output: 'test-results/group-powerpoint/rotation-exported',
      title: 'Original native group rotation threshold controls',
    },
  ].filter(
    (item) => !process.argv.includes('--rotation-only') || item.input.includes('-rotation.'),
  )) {
    const bytes = await readFile(resolve(root, item.input));
    const imported = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    imported.deck.title = item.title;
    const exported = new Uint8Array(await (await exportPptx(imported.deck)).arrayBuffer());
    await writeFile(
      resolve(root, item.output + '.opendeck'),
      JSON.stringify(imported.deck, null, 2) + '\n',
    );
    await writeFile(resolve(root, item.output + '.pptx'), exported);
    results.push({
      input: item.input,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
      output: item.output + '.pptx',
      outputSha256: createHash('sha256').update(exported).digest('hex'),
      slides: imported.deck.slides.length,
      topLevelGroups: imported.deck.slides.reduce(
        (n, s) => n + s.elements.filter((e) => e.type === 'group').length,
        0,
      ),
      warnings: imported.warnings,
    });
  }
  await writeFile(
    resolve(
      evidence,
      process.argv.includes('--rotation-only') ? 'rotation-generation.json' : 'generation.json',
    ),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  await server.close();
  dom.window.close();
}
