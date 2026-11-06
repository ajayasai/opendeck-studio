// Ignored editor-authored fit and legacy-EXIF controls, independent of PPTX import.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = resolve(root, 'test-results/picture-geometry-powerpoint');
const deck = JSON.parse(
  await readFile(resolve(root, 'examples/picture-geometry.opendeck'), 'utf8'),
);
const first = deck.slides[0];
const heading = first.elements.find((e) => e.type === 'text');
const marker = first.elements.find((e) => e.type === 'shape');
const picture = first.elements.find((e) => e.type === 'image');
const data = async (name) =>
  'data:image/' +
  (name.endsWith('.jpg') ? 'jpeg' : 'png') +
  ';base64,' +
  (await readFile(resolve(root, 'tests/fixtures', name))).toString('base64');
const label = (id, text, x, y, width = 1150, size = 24) => ({
  ...structuredClone(heading),
  id,
  name: id,
  text,
  paragraphs: undefined,
  x,
  y,
  width,
  height: 45,
  fontSize: size,
});
const slide = (id, title) => ({
  ...structuredClone(first),
  id,
  name: title,
  notes:
    'Original editor-authored synthetic geometry controls. No input presentation is imported for the image geometry; calibration assets are original project graphics.',
  elements: [label(id + '-title', title, 45, 25)],
});
const add = (s, e) => {
  s.elements.push({
    ...structuredClone(marker),
    id: e.id + '-bounds',
    name: e.name + ' bounds',
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
    rotation: e.rotation,
  });
  s.elements.push(e);
};
const base = {
  ...picture,
  crop: undefined,
  fillRect: undefined,
  flipH: undefined,
  flipV: undefined,
  src: await data('picture-geometry-calibration.png'),
  rotation: 0,
  opacity: 1,
};
const fitSlide = slide('editor-fit', 'Editor-authored contain, cover and stretch');
for (let i = 0; i < 6; i++) {
  const fit = ['contain', 'cover', 'stretch'][i % 3],
    x = 50 + (i % 3) * 400,
    y = 135 + Math.floor(i / 3) * 290,
    width = 340,
    height = i < 3 ? 190 : 100;
  fitSlide.elements.push(
    label('fit-label-' + i, fit + ' ' + width + ' x ' + height, x, y - 45, 360, 20),
  );
  add(fitSlide, {
    ...base,
    id: 'fit-' + i,
    name: 'Editor ' + fit + ' ' + i,
    x,
    y,
    width,
    height,
    fit,
  });
}
const legacySlide = slide('editor-legacy', 'Legacy EXIF pixels with asymmetric crop and flips');
for (let i = 0; i < 4; i++) {
  const orientation = i < 2 ? 6 : 7,
    x = 90 + (i % 2) * 650,
    y = 165 + Math.floor(i / 2) * 310;
  legacySlide.elements.push(
    label(
      'legacy-label-' + i,
      `EXIF ${orientation}, flip ${i % 2 === 0 ? 'H' : 'V'}`,
      x - 20,
      y - 75,
      460,
      20,
    ),
  );
  add(legacySlide, {
    ...base,
    id: 'legacy-' + i,
    name: `Legacy EXIF${orientation} ${i % 2 === 0 ? 'H' : 'V'}`,
    x,
    y,
    width: 320,
    height: 130,
    fit: 'stretch',
    crop: { left: 0.18, top: 0.1, right: 0.06, bottom: 0.22 },
    fillRect: { left: 0.1, top: 0.12, right: 0.2, bottom: 0.08 },
    flipH: i % 2 === 0,
    flipV: i % 2 === 1,
    rotation: i % 2 === 0 ? 30 : -20,
    orientation: undefined,
    src: await data(`picture-geometry-exif-${orientation}.jpg`),
  });
}
deck.id = 'editor-picture-geometry-probe';
deck.title = 'Editor-authored fit and legacy EXIF controls';
deck.slides = [fitSlide, legacySlide];
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { exportPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const bytes = new Uint8Array(await (await exportPptx(deck)).arrayBuffer());
  await writeFile(resolve(dir, 'editor-authored.opendeck'), JSON.stringify(deck, null, 2) + '\n');
  await writeFile(resolve(dir, 'editor-authored.pptx'), bytes);
  console.log(
    JSON.stringify({
      slides: 2,
      pictures: 10,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  );
} finally {
  await server.close();
  dom.window.close();
}
