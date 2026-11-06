// Compare supported pictures with independent COM properties, then re-import
// PowerPoint's saved OpenDeck exports. Native pixel mapping is a separate gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/picture-geometry-powerpoint');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
const close = (a, b, label, tolerance = 0.001) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const rect = (r) =>
  Object.fromEntries(['left', 'top', 'right', 'bottom'].map((k) => [k, r?.[k] ?? 0]));
const near = (a, b, label) => {
  if (typeof a === 'number' && typeof b === 'number') return close(a, b, label, 0.00002);
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, label);
    return a.forEach((v, i) => near(v, b[i], label + '.' + i));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), label);
    for (const k of Object.keys(b)) near(a[k], b[k], label + '.' + k);
    return;
  }
  assert.equal(a, b, label);
};
const text = (e) =>
  e.paragraphs?.map((p) => ({
    ...p,
    runs: p.runs.flatMap((r) => Array.from(r.text || '\0').map((t) => ({ ...r, text: t }))),
  }));
try {
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const verification = JSON.parse(
    (await readFile(resolve(evidence, 'verification.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  const results = [];
  for (const item of [
    {
      input: 'tests/fixtures/powerpoint-picture-geometry.pptx',
      model: 'examples/picture-geometry.opendeck',
      saved: 'exported-resaved.pptx',
    },
    {
      input: 'tests/fixtures/powerpoint-picture-geometry-probe.pptx',
      model: 'test-results/picture-geometry-powerpoint/probe-exported.opendeck',
      saved: 'probe-exported-resaved.pptx',
    },
  ]) {
    const expected = JSON.parse(await readFile(resolve(root, item.model), 'utf8'));
    const native = verification.results.find((r) => r.input === item.input);
    const exportPath = item.model.replace(/\.opendeck$/, '.pptx');
    const exported = verification.results.find((r) => r.input === exportPath);
    assert.ok(native?.opened && exported?.opened, 'Native inputs and current export opened');
    assert.equal(
      exported.sha256.toLowerCase(),
      createHash('sha256')
        .update(await readFile(resolve(root, exportPath)))
        .digest('hex'),
      'Exact current export passed native gate',
    );
    let independentPictures = 0;
    for (const nativeSlide of native.slides) {
      const slide = expected.slides[nativeSlide.slide - 1];
      for (const picture of nativeSlide.pictures) {
        const e = slide.elements.find((e) => e.type === 'image' && e.name === picture.name);
        assert.ok(e, picture.name);
        for (const [field, key] of [
          ['x', 'left'],
          ['y', 'top'],
          ['width', 'width'],
          ['height', 'height'],
          ['rotation', 'rotation'],
        ])
          close(
            e[field],
            picture[key] * (field === 'rotation' ? 1 : 4 / 3),
            picture.name + ': native ' + field,
          );
        assert.equal(
          e.flipH ?? false,
          picture.flipH === -1,
          picture.name + ': native horizontal flip',
        );
        assert.equal(
          e.flipV ?? false,
          picture.flipV === -1,
          picture.name + ': native vertical flip',
        );
        assert.equal(e.orientation, 'encoded', picture.name + ': encoded axes');
        // COM reports image-in-frame dimensions for full-destination stretch.
        // Partial destination rectangles and missing/tiled modes return null.
        if (
          picture.picture.width !== null &&
          Object.values(rect(e.fillRect)).every((v) => v === 0)
        ) {
          const crop = rect(e.crop);
          const width = e.width / (1 - crop.left - crop.right),
            height = e.height / (1 - crop.top - crop.bottom);
          close(
            width,
            (picture.picture.width * 4) / 3,
            picture.name + ': native picture width',
            0.03,
          );
          close(
            height,
            (picture.picture.height * 4) / 3,
            picture.name + ': native picture height',
            0.03,
          );
          close(
            ((crop.right - crop.left) * width) / 2,
            (picture.picture.offsetX * 4) / 3,
            picture.name + ': native offset x',
            0.03,
          );
          close(
            ((crop.bottom - crop.top) * height) / 2,
            (picture.picture.offsetY * 4) / 3,
            picture.name + ': native offset y',
            0.03,
          );
        }
        independentPictures++;
      }
    }
    const saved = await readFile(resolve(evidence, item.saved));
    const { deck: actual, warnings } = await importPptx(
      saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength),
    );
    assert.equal(actual.slides.length, expected.slides.length, 'Slide count');
    let pictures = 0;
    expected.slides.forEach((want, i) => {
      const got = actual.slides[i];
      assert.equal(got.notes, want.notes, `slide${i + 1} notes`);
      assert.equal(got.elements.length, want.elements.length, `slide${i + 1} object count`);
      want.elements.forEach((source, j) => {
        const target = got.elements[j],
          label = `slide${i + 1} ${source.name}`;
        assert.equal(target.type, source.type, label + ' type');
        for (const field of ['x', 'y', 'width', 'height', 'rotation', 'opacity'])
          close(target[field], source[field], label + ' ' + field);
        if (source.type === 'image') {
          assert.equal(target.src, source.src, label + ' original embedded source bytes');
          assert.equal(target.alt, source.alt, label + ' alternative text');
          assert.equal(target.fit, source.fit, label + ' fit');
          assert.equal(target.orientation, source.orientation, label + ' encoded axes');
          for (const field of ['crop', 'fillRect'])
            near(rect(target[field]), rect(source[field]), label + ' ' + field);
          for (const field of ['flipH', 'flipV'])
            assert.equal(target[field] ?? false, source[field] ?? false, label + ' ' + field);
          pictures++;
        } else if (source.type === 'text') {
          assert.equal(target.text, source.text, label + ' text');
          near(text(target), text(source), label + ' rich text');
          near(target.textFrame, source.textFrame, label + ' frame');
          near(target.autoFit, source.autoFit, label + ' fitting');
        }
      });
    });
    results.push({
      input: item.input,
      slides: actual.slides.length,
      independentPictures,
      pictures,
      passed: true,
      warnings,
    });
  }
  const report = {
    passed: true,
    checks: [
      'Independent COM frame geometry, flip states and available cropped-image dimensions/offsets',
      'Native saved export retains original embedded bitmap bytes, source/destination rectangles, alpha and encoded-axis semantics',
      'Text, rich content, frames, fitting, notes and object counts',
    ],
    results,
  };
  await writeFile(
    resolve(evidence, 'roundtrip-check.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await server.close();
  dom.window.close();
}
