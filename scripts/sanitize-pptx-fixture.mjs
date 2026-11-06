// Remove local Office profile metadata from the newly authored public fixture.
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
const path = process.argv[2];
if (
  ![
    'powerpoint-original.pptx',
    'powerpoint-rich-text.pptx',
    'powerpoint-text-frame.pptx',
    'powerpoint-text-frame-attached-outline-probe.pptx',
    'powerpoint-autofit.pptx',
    'powerpoint-text-decoration.pptx',
    'powerpoint-gradients.pptx',
    'powerpoint-picture-geometry.pptx',
    'powerpoint-groups.pptx',
    'powerpoint-groups-rotation.pptx',
  ].some((name) => path?.endsWith(name))
)
  throw new Error('Expected the dedicated original fixture filename.');
const dom = new JSDOM();
const zip = await JSZip.loadAsync(await readFile(path));
for (const part of ['docProps/core.xml', 'docProps/app.xml']) {
  const entry = zip.file(part);
  if (!entry) continue;
  const doc = new dom.window.DOMParser().parseFromString(
    await entry.async('string'),
    'application/xml',
  );
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    if (['creator', 'lastModifiedBy'].includes(element.localName))
      element.textContent = 'OpenDeck contributors';
    if (['Company', 'Manager', 'HyperlinkBase'].includes(element.localName))
      element.textContent = '';
    if (element.localName === 'title')
      element.textContent = 'Original PowerPoint interoperability fixture';
  }
  zip.file(part, new dom.window.XMLSerializer().serializeToString(doc));
}
await writeFile(path, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
dom.window.close();
console.log('Sanitized original fixture metadata.');
