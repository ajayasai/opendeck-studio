// Independent ignored XML controls for native tint/shade transfer and ordering.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/gradient-powerpoint');
await mkdir(evidence, { recursive: true });
const zip = await JSZip.loadAsync(
  await readFile(resolve(root, 'tests/fixtures/powerpoint-gradients.pptx')),
);
const dom = new JSDOM(),
  A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const parse = (text) => new dom.window.DOMParser().parseFromString(text, 'application/xml');
const xml = (node) => new dom.window.XMLSerializer().serializeToString(node);
const all = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const cases = [
  { name: 'XML red shade25', color: 'FF0000', transforms: [['shade', 25000]] },
  { name: 'XML red shade50', color: 'FF0000', transforms: [['shade', 50000]] },
  { name: 'XML gray shade50', color: '808080', transforms: [['shade', 50000]] },
  { name: 'XML gray tint50', color: '808080', transforms: [['tint', 50000]] },
  {
    name: 'XML gray shade50 then tint50',
    color: '808080',
    transforms: [
      ['shade', 50000],
      ['tint', 50000],
    ],
  },
  {
    name: 'XML gray tint50 then shade50',
    color: '808080',
    transforms: [
      ['tint', 50000],
      ['shade', 50000],
    ],
  },
];
const slide = parse(await zip.file('ppt/slides/slide2.xml').async('string'));
let index = 0;
for (const shape of all(slide, 'sp')) {
  const grad = all(shape, 'gradFill')[0];
  if (!grad) continue;
  const item = cases[index++],
    fill = slide.createElementNS(A, 'a:solidFill'),
    color = slide.createElementNS(A, 'a:srgbClr');
  all(shape, 'cNvPr')[0].setAttribute('name', item.name);
  color.setAttribute('val', item.color);
  for (const [kind, value] of item.transforms) {
    const transform = slide.createElementNS(A, 'a:' + kind);
    transform.setAttribute('val', String(value));
    color.append(transform);
  }
  fill.append(color);
  grad.replaceWith(fill);
}
zip.file('ppt/slides/slide2.xml', xml(slide));
const presentation = parse(await zip.file('ppt/presentation.xml').async('string'));
all(presentation, 'sldId').forEach((node, index) => {
  if (index !== 1) node.remove();
});
zip.file('ppt/presentation.xml', xml(presentation));
const app = parse(await zip.file('docProps/app.xml').async('string'));
for (const name of ['Slides', 'Notes']) all(app, name)[0].textContent = '1';
zip.file('docProps/app.xml', xml(app));
await writeFile(
  resolve(evidence, 'color-transform-probe.pptx'),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
);
await writeFile(
  resolve(evidence, 'color-transform-provenance.json'),
  JSON.stringify(
    {
      provenance:
        'Explicit XML derivation from sanitized original project input; only this ignored package was changed.',
      cases,
    },
    null,
    2,
  ) + '\n',
);
dom.window.close();
console.log('Prepared ignored six-case color-transform probe.');
