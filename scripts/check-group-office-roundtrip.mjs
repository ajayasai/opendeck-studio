// Independent native COM geometry and PowerPoint-saved hierarchy acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/group-powerpoint');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
const close = (a, b, label, tolerance = 0.001) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
function near(a, b, label) {
  if (typeof a === 'number' && typeof b === 'number') return close(a, b, label, 0.0001);
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, label);
    a.forEach((v, i) => near(v, b[i], label + '.' + i));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), label);
    for (const k of Object.keys(b)) near(a[k], b[k], label + '.' + k);
    return;
  }
  assert.equal(a, b, label);
}
const text = (e) =>
  e.paragraphs?.map((p) => ({
    ...p,
    runs: p.runs.flatMap((r) => Array.from(r.text || '\0').map((t) => ({ ...r, text: t }))),
  }));
const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
try {
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const native = JSON.parse(
    (await readFile(resolve(evidence, 'verification.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  const results = [];
  for (const item of [
    {
      input: 'tests/fixtures/powerpoint-groups.pptx',
      model: 'examples/groups.opendeck',
      saved: 'exported-resaved.pptx',
    },
    {
      input: 'tests/fixtures/powerpoint-groups-probe.pptx',
      model: 'test-results/group-powerpoint/probe-exported.opendeck',
      saved: 'probe-exported-resaved.pptx',
    },
    {
      input: 'tests/fixtures/powerpoint-groups-rotation.pptx',
      model: 'test-results/group-powerpoint/rotation-exported.opendeck',
      saved: 'rotation-exported-resaved.pptx',
    },
  ]) {
    const expected = JSON.parse(await readFile(resolve(root, item.model), 'utf8')),
      exportPath = item.model.replace(/\.opendeck$/, '.pptx');
    const sourceNative = native.results.find((r) => r.input === item.input),
      exportNative = native.results.find((r) => r.input === exportPath);
    assert.ok(sourceNative?.opened && exportNative?.opened, 'Both native inputs opened');
    assert.equal(
      exportNative.sha256.toLowerCase(),
      createHash('sha256')
        .update(await readFile(resolve(root, exportPath)))
        .digest('hex'),
      'Exact exported bytes tested',
    );
    let nativeObjects = 0;
    for (let i = 0; i < sourceNative.slides.length; i++) {
      const sources = flatten(sourceNative.slides[i].tree),
        targets = flatten(exportNative.slides[i].tree);
      assert.equal(targets.length, sources.length, 'Native recursive object count');
      for (const source of sources) {
        const target = targets.find((n) => n.name === source.name);
        assert.ok(target, source.name + ' native name');
        for (const k of ['left', 'top', 'width', 'height', 'rotation'])
          close(target[k], source[k], source.name + ' native computed ' + k, 0.003);
        if (source.children)
          assert.equal(
            target.children.length,
            source.children.length,
            source.name + ' native group child count',
          );
        if (source.text) {
          assert.equal(target.text, source.text, source.name + ' native text');
          close(target.fontSize, source.fontSize, source.name + ' native font size');
        }
        nativeObjects++;
      }
    }
    const saved = await readFile(resolve(evidence, item.saved));
    const { deck: actual, warnings } = await importPptx(
      saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength),
    );
    assert.equal(actual.slides.length, expected.slides.length, 'Slide count');
    let groups = 0,
      leaves = 0,
      images = 0;
    function compare(want, got, label) {
      assert.equal(got.length, want.length, label + ' sibling count');
      want.forEach((source, j) => {
        const target = got[j],
          name = label + ' ' + source.name;
        assert.equal(target.type, source.type, name + ' type');
        assert.equal(target.name, source.name, name + ' name/order');
        for (const k of ['x', 'y', 'width', 'height', 'rotation', 'opacity'])
          close(target[k], source[k], name + ' ' + k);
        if (source.type === 'group') {
          near(target.childFrame, source.childFrame, name + ' child coordinate frame');
          for (const k of ['flipH', 'flipV'])
            assert.equal(target[k] ?? false, source[k] ?? false, name + ' ' + k);
          groups++;
          compare(source.children, target.children, name);
          return;
        }
        leaves++;
        if (source.type === 'text') {
          assert.equal(target.text, source.text, name + ' text');
          near(text(target), text(source), name + ' rich paragraphs');
          for (const k of [
            'fontSize',
            'fontFamily',
            'color',
            'bold',
            'italic',
            'underline',
            'align',
            'verticalAlign',
            'textFrame',
            'autoFit',
            'decoration',
          ])
            near(target[k], source[k], name + ' ' + k);
        } else if (source.type === 'image') {
          for (const k of ['src', 'alt', 'orientation', 'fit'])
            assert.equal(target[k], source[k], name + ' ' + k);
          for (const k of ['crop', 'fillRect']) near(target[k], source[k], name + ' ' + k);
          for (const k of ['flipH', 'flipV'])
            assert.equal(target[k] ?? false, source[k] ?? false, name + ' ' + k);
          images++;
        } else if (source.type === 'table') near(target.rows, source.rows, name + ' cells');
        else if (source.type === 'shape') {
          near(target.shape, source.shape, name + ' preset');
          for (const k of ['fill', 'stroke']) {
            const hidden = (e) =>
              e[k] === 'transparent' ||
              e[k + 'Opacity'] === 0 ||
              (k === 'stroke' && e.strokeWidth === 0);
            assert.equal(hidden(target), hidden(source), name + ' ' + k + ' visibility');
            if (!hidden(source)) {
              near(target[k], source[k], name + ' ' + k);
              near(
                target[k + 'Opacity'] ?? 1,
                source[k + 'Opacity'] ?? 1,
                name + ' ' + k + ' alpha',
              );
              if (k === 'stroke')
                near(target.strokeWidth, source.strokeWidth, name + ' stroke width');
            }
          }
        }
      });
    }
    expected.slides.forEach((s, i) => {
      assert.equal(actual.slides[i].notes, s.notes, 'Slide notes');
      compare(s.elements, actual.slides[i].elements, 'Slide ' + (i + 1));
    });
    results.push({
      input: item.input,
      slides: actual.slides.length,
      nativeObjects,
      groups,
      leaves,
      images,
      passed: true,
      warnings,
    });
  }
  const report = {
    passed: true,
    checks: [
      'Independent source vs export COM computed child frames, angles, text, font sizes and hierarchy',
      'PowerPoint-saved export exact child coordinate frames, flips, local geometry, rich text, embedded raster bytes, table cells, notes and sibling order',
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
