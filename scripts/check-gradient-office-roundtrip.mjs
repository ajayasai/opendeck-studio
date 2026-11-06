// Independent native COM stop reads plus OpenDeck export -> PowerPoint save -> import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'test-results/gradient-powerpoint');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
const close = (a, b, label, tolerance = 0.001) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}`);
const rgb = (value) =>
  '#' +
  [value & 255, (value >>> 8) & 255, (value >>> 16) & 255]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');
const rect = (value, defaults = 0) =>
  Object.fromEntries(
    ['left', 'top', 'right', 'bottom'].map((side) => [
      side,
      value === undefined ? defaults : (value[side] ?? 0),
    ]),
  );
const gradient = (value) =>
  value && {
    kind: value.kind,
    stops: value.stops
      .map((stop, index) => ({ ...stop, color: stop.color.toLowerCase(), index }))
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map(({ index, ...stop }) => stop),
    ...(value.kind === 'linear'
      ? { angle: value.angle ?? 0, scaled: value.scaled ?? false }
      : { path: value.path ?? 'rect', fillToRect: rect(value.fillToRect, 0.5) }),
    tileRect: rect(value.tileRect),
    flip: value.flip ?? 'none',
    rotateWithShape: value.rotateWithShape ?? true,
  };
const near = (actual, expected, path) => {
  if (typeof actual === 'number' && typeof expected === 'number')
    return close(actual, expected, path, 0.00002);
  if (Array.isArray(actual) && Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${path}.length`);
    return actual.forEach((item, index) => near(item, expected[index], `${path}[${index}]`));
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}.keys`);
    for (const key of Object.keys(expected)) near(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.equal(actual, expected, path);
};
const fillOf = (element) =>
  element.type === 'text' ? element.decoration?.fill?.gradient : element.fillGradient;
const lineOf = (element) =>
  element.type === 'text' ? element.decoration?.line?.gradient : element.strokeGradient;
const canonicalText = (element) =>
  element.paragraphs?.map((paragraph) => ({
    ...paragraph,
    runs: paragraph.runs.flatMap((run) =>
      Array.from(run.text || '\0').map((text) => ({ ...run, text })),
    ),
  }));
try {
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const verification = JSON.parse(
    (await readFile(resolve(evidence, 'verification.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  const results = [];
  for (const item of [
    {
      input: 'tests/fixtures/powerpoint-gradients.pptx',
      model: 'examples/gradients.opendeck',
      saved: 'exported-resaved.pptx',
    },
    {
      input: 'tests/fixtures/powerpoint-gradient-probe.pptx',
      model: 'test-results/gradient-powerpoint/probe-exported.opendeck',
      saved: 'probe-exported-resaved.pptx',
    },
  ]) {
    const expected = JSON.parse(await readFile(resolve(root, item.model), 'utf8'));
    const native = verification.results.find((result) => result.input === item.input);
    assert.ok(native, `Native input ${item.input}`);
    const exportPath = item.model.replace(/\.opendeck$/, '.pptx');
    const nativeExport = verification.results.find((result) => result.input === exportPath);
    assert.ok(nativeExport, `Native exported input ${exportPath}`);
    assert.equal(
      nativeExport.sha256.toLowerCase(),
      createHash('sha256')
        .update(await readFile(resolve(root, exportPath)))
        .digest('hex'),
      'Native gate used the current exact export bytes',
    );
    let nativeGradientCount = 0,
      gradientCount = 0;
    for (const nativeSlide of native.slides) {
      const slide = expected.slides[nativeSlide.slide - 1];
      for (const nativeShape of nativeSlide.shapes.filter(
        (shape) => shape.fill.type === 3 && shape.fill.visible !== 0,
      )) {
        const element = slide.elements.find((element) => element.name === nativeShape.name);
        assert.ok(element, `Native imported object ${nativeShape.name}`);
        const imported = fillOf(element);
        assert.ok(imported, `Native imported gradient ${nativeShape.name}`);
        const actualStops = gradient(imported).stops;
        const nativeStops = [...nativeShape.fill.stops].sort((a, b) => a.position - b.position);
        assert.equal(
          actualStops.length,
          nativeStops.length,
          `${nativeShape.name}: native stop count`,
        );
        actualStops.forEach((stop, index) => {
          close(stop.position, nativeStops[index].position, `${nativeShape.name}: native position`);
          close(
            stop.opacity,
            1 - nativeStops[index].transparency,
            `${nativeShape.name}: native alpha`,
          );
          const reference = rgb(nativeStops[index].color);
          for (const channel of [1, 3, 5])
            close(
              parseInt(stop.color.slice(channel, channel + 2), 16),
              parseInt(reference.slice(channel, channel + 2), 16),
              `${nativeShape.name}: native RGB`,
              2,
            );
        });
        nativeGradientCount++;
      }
    }
    const bytes = await readFile(resolve(evidence, item.saved));
    const { deck: actual, warnings } = await importPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    assert.equal(actual.slides.length, expected.slides.length, 'Slide count');
    for (let index = 0; index < expected.slides.length; index++) {
      const want = expected.slides[index],
        got = actual.slides[index];
      assert.equal(got.notes, want.notes, `Slide ${index + 1}: notes`);
      assert.equal(got.elements.length, want.elements.length, `Slide ${index + 1}: object count`);
      near(
        gradient(got.backgroundGradient),
        gradient(want.backgroundGradient),
        `Slide ${index + 1}: background gradient`,
      );
      close(
        got.backgroundOpacity ?? 1,
        want.backgroundOpacity ?? 1,
        `Slide ${index + 1}: background alpha`,
      );
      for (let elementIndex = 0; elementIndex < want.elements.length; elementIndex++) {
        const source = want.elements[elementIndex],
          target = got.elements[elementIndex],
          label = `Slide ${index + 1} ${source.name}`;
        assert.equal(target.type, source.type, `${label}: type`);
        for (const field of ['x', 'y', 'width', 'height', 'rotation'])
          close(target[field], source[field], `${label}: ${field}`);
        near(gradient(fillOf(target)), gradient(fillOf(source)), `${label}: gradient fill`);
        near(gradient(lineOf(target)), gradient(lineOf(source)), `${label}: gradient outline`);
        if (fillOf(source)) gradientCount++;
        if (lineOf(source)) gradientCount++;
        if (source.type === 'text') {
          assert.equal(target.text, source.text, `${label}: text`);
          near(canonicalText(target), canonicalText(source), `${label}: rich text`);
          near(target.textFrame, source.textFrame, `${label}: text frame`);
          near(target.autoFit, source.autoFit, `${label}: AutoFit`);
        }
      }
    }
    results.push({
      input: item.input,
      slides: actual.slides.length,
      nativeGradientCount,
      gradientCount,
      passed: true,
      warnings,
    });
  }
  await writeFile(
    resolve(evidence, 'roundtrip-check.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'Independent native effective gradient stop positions, colors and alpha',
          'Gradient kind, angle, scale, path, focus/tile rectangles and rotation/flip semantics through native save',
          'Editable object geometry, rich text, frames, saved fitting, notes and counts',
        ],
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await server.close();
  dom.window.close();
}
