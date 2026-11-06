import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
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
  const { importPptx } = await server.ssrLoadModule('/src/pptx.ts');
  const verification = JSON.parse(
    await readFile(
      resolve(root, 'test-results/text-decoration-powerpoint/verification.json'),
      'utf8',
    ),
  );
  const inputs = [
    {
      source: 'tests/fixtures/powerpoint-text-decoration.pptx',
      native: 'examples/text-decoration.opendeck',
      resaved: 'test-results/text-decoration-powerpoint/exported-resaved.pptx',
    },
    {
      source: 'tests/fixtures/powerpoint-text-decoration-probe.pptx',
      native: 'test-results/text-decoration-powerpoint/probe-exported.opendeck',
      resaved: 'test-results/text-decoration-powerpoint/probe-exported-resaved.pptx',
    },
  ];
  const close = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 0.001, `${label}: expected ${expected}, got ${actual}`);
  const canonicalParagraphs = (element) =>
    element.paragraphs.map((paragraph) => ({
      ...paragraph,
      runs: paragraph.runs.flatMap((run) =>
        Array.from(run.text || '\0').map((text) => ({ ...run, text })),
      ),
    }));
  const results = [];
  for (const item of inputs) {
    const expected = JSON.parse(await readFile(resolve(root, item.native), 'utf8'));
    // Independent COM-read effective properties must match the original import,
    // including inherited values and XML negatives that COM setters reject.
    const nativeSource = verification.results.find((result) => result.input === item.source);
    assert.ok(nativeSource, `Native source evidence: ${item.source}`);
    for (const nativeShape of nativeSource.cases) {
      const element = expected.slides[nativeShape.slide - 1].elements.find(
        (element) => element.type === 'text' && element.name === nativeShape.name,
      );
      assert.ok(element, `Imported text object: ${nativeShape.name}`);
      assert.equal(
        element.text,
        nativeShape.text.replace(/[\r\v]/g, '\n'),
        `${nativeShape.name}: native text`,
      );
      for (const side of ['left', 'top', 'right', 'bottom'])
        close(
          element.textFrame.insets[side],
          (nativeShape.insetsPt[side] * 4) / 3,
          `${nativeShape.name}: native ${side} inset`,
        );
      assert.equal(
        element.textFrame.wrap,
        nativeShape.wordWrap === 0 ? 'none' : 'square',
        `${nativeShape.name}: native wrapping`,
      );
      assert.equal(
        element.verticalAlign,
        { 1: 'top', 3: 'middle', 4: 'bottom' }[nativeShape.verticalAnchor],
        `${nativeShape.name}: native anchor`,
      );
    }
    const rgb = (value) =>
      '#' +
      [value & 255, (value >>> 8) & 255, (value >>> 16) & 255]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    for (const nativeShape of nativeSource.cases) {
      const element = expected.slides[nativeShape.slide - 1].elements.find(
        (element) => element.type === 'text' && element.name === nativeShape.name,
      );
      if (nativeShape.fill.type === 1) {
        if (nativeShape.fill.visible === 0)
          assert.equal(element.decoration.fill, null, `${element.name}: native no fill`);
        else {
          assert.equal(
            element.decoration.fill?.color.toUpperCase(),
            rgb(nativeShape.fill.color),
            `${element.name}: native solid fill`,
          );
          close(
            element.decoration.fill.opacity,
            1 - nativeShape.fill.transparency,
            `${element.name}: native fill opacity`,
          );
        }
      }
      if (nativeShape.line.visible === 0)
        assert.equal(element.decoration.line, null, `${element.name}: native no outline`);
      else {
        assert.equal(
          element.decoration.line?.color.toUpperCase(),
          rgb(nativeShape.line.color),
          `${element.name}: native outline color`,
        );
        close(
          element.decoration.line.opacity,
          1 - nativeShape.line.transparency,
          `${element.name}: native outline opacity`,
        );
        close(
          element.decoration.line.width,
          (nativeShape.line.width * 4) / 3,
          `${element.name}: native outline width`,
        );
      }
      if (element.decoration.shape === 'roundRect')
        close(
          element.decoration.cornerRadius,
          nativeShape.adjustments[0],
          `${element.name}: native rounded radius ratio`,
        );
    }
    const nativeExport = verification.results.find(
      (result) => result.input === item.native.replace(/\.opendeck$/, '.pptx'),
    );
    assert.ok(nativeExport, 'Native OpenDeck export evidence');
    const regionControls = [
      'Round default',
      'Round zero',
      'Round forty percent',
      'Round half',
      'Ellipse text region',
      'Triangle text region',
    ];
    for (const name of regionControls) {
      const originalShape = nativeSource.cases.find((shape) => shape.name === name);
      const exportedShape = nativeExport.cases.find((shape) => shape.name === name);
      assert.ok(originalShape && exportedShape, `${name}: native region controls`);
      for (const property of ['left', 'top', 'width', 'height'])
        close(
          exportedShape.textBounds[property],
          originalShape.textBounds[property],
          `${name}: native preset text-region ${property}`,
        );
      assert.equal(exportedShape.paragraphs.length, originalShape.paragraphs.length);
      for (let index = 0; index < originalShape.paragraphs.length; index++) {
        for (const property of ['left', 'firstTop'])
          close(
            exportedShape.paragraphs[index][property],
            originalShape.paragraphs[index][property],
            `${name}: native paragraph ${index} ${property}`,
          );
      }
    }
    const source = await readFile(resolve(root, item.resaved));
    const { deck: actual, warnings } = await importPptx(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    assert.equal(actual.slides.length, expected.slides.length);
    for (let slideIndex = 0; slideIndex < expected.slides.length; slideIndex++) {
      const expectedSlide = expected.slides[slideIndex],
        actualSlide = actual.slides[slideIndex];
      assert.equal(actualSlide.notes, expectedSlide.notes, 'Speaker notes');
      assert.equal(
        actualSlide.elements.length,
        expectedSlide.elements.length,
        'Native object count',
      );
      const expectedTexts = expectedSlide.elements.filter((element) => element.type === 'text');
      const actualTexts = actualSlide.elements.filter((element) => element.type === 'text');
      assert.equal(actualTexts.length, expectedTexts.length);
      for (let index = 0; index < expectedTexts.length; index++) {
        const expectedText = expectedTexts[index],
          actualText = actualTexts[index];
        assert.equal(actualText.text, expectedText.text, `${expectedText.name}: text`);
        assert.deepEqual(
          actualText.decoration,
          expectedText.decoration,
          `${expectedText.name}: attached decoration`,
        );
        close(
          actualText.textOpacity ?? 1,
          expectedText.textOpacity ?? 1,
          `${expectedText.name}: text-only opacity`,
        );
        assert.deepEqual(
          actualText.autoFit,
          expectedText.autoFit,
          `${expectedText.name}: saved AutoFit mode and factors`,
        );
        assert.deepEqual(
          canonicalParagraphs(actualText),
          canonicalParagraphs(expectedText),
          `${expectedText.name}: supported rich formatting`,
        );
        assert.equal(
          actualText.verticalAlign,
          expectedText.verticalAlign,
          `${expectedText.name}: anchor`,
        );
        for (const property of [
          'wrap',
          'horizontalOverflow',
          'verticalOverflow',
          'paragraphSpacingAtEdges',
        ])
          assert.equal(
            actualText.textFrame[property],
            expectedText.textFrame[property],
            `${expectedText.name}: ${property}`,
          );
        for (const side of ['left', 'top', 'right', 'bottom'])
          close(
            actualText.textFrame.insets[side],
            expectedText.textFrame.insets[side],
            `${expectedText.name}: ${side} inset`,
          );
        for (const property of ['x', 'y', 'width', 'height', 'rotation'])
          close(actualText[property], expectedText[property], `${expectedText.name}: ${property}`);
      }
    }
    results.push({ source: item.source, slides: actual.slides.length, passed: true, warnings });
  }
  await writeFile(
    resolve(root, 'test-results/text-decoration-powerpoint/roundtrip-check.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'independent native effective insets/wrap/anchor/text and supported solid fill/line paints',
          'attached geometry, fill/line alpha, width/dash/cap/join/miter/corner radius, and paragraph endpoint policy',
          'independent native source/export text-region and paragraph bounds match for rounded rectangle, ellipse and triangle controls',
          'native re-save preserves saved AutoFit mode/factors and nominal rich font sizes (no double scaling)',
          'native re-save preserves geometry, signed insets, wrap and independent overflow flags',
          'supported rich character/paragraph formatting, exact point/relative line spacing, and breaks',
          'slide/object counts and notes',
        ],
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Both original and XML-derived text-decoration paths passed native paint/frame and PowerPoint re-save checks.',
  );
} finally {
  await server.close();
  dom.window.close();
}
