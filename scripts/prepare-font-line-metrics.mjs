// Changes only AutoFit choices in the original ignored native metrics experiment.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = resolve(root, 'test-results/autofit-powerpoint/font-metrics');
const zip = await JSZip.loadAsync(await readFile(resolve(directory, 'original.pptx')));
const dom = new JSDOM();
for (const name of Object.keys(zip.files).filter((name) =>
  /^ppt\/slides\/slide\d+\.xml$/.test(name),
)) {
  const document = new dom.window.DOMParser().parseFromString(
    await zip.file(name).async('string'),
    'application/xml',
  );
  for (const body of document.getElementsByTagNameNS('*', 'bodyPr')) {
    for (const child of Array.from(body.children)) {
      if (['noAutofit', 'spAutoFit', 'normAutofit'].includes(child.localName))
        body.removeChild(child);
    }
    const normal = document.createElementNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main',
      'a:normAutofit',
    );
    normal.setAttribute('fontScale', '80000');
    normal.setAttribute('lnSpcReduction', '0');
    body.appendChild(normal);
  }
  zip.file(name, new dom.window.XMLSerializer().serializeToString(document));
}
await writeFile(
  resolve(directory, 'scaled-probe.pptx'),
  await zip.generateAsync({ type: 'nodebuffer' }),
);
dom.window.close();
