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
    await readFile(resolve(root, 'test-results/text-frame-powerpoint/verification.json'), 'utf8'),
  );
  const inputs = [
    {
      source: 'tests/fixtures/powerpoint-text-frame.pptx',
      native: 'examples/text-frame.opendeck',
      resaved: 'test-results/text-frame-powerpoint/powerpoint-resaved.pptx',
    },
    {
      source: 'tests/fixtures/powerpoint-text-frame-clip-probe.pptx',
      native: 'test-results/text-frame-powerpoint/clip-probe-exported.opendeck',
      resaved: 'test-results/text-frame-powerpoint/probe-exported-resaved.pptx',
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
    for (const nativeShape of nativeSource.shapes) {
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
          canonicalParagraphs(actualText),
          canonicalParagraphs(expectedText),
          `${expectedText.name}: supported rich formatting`,
        );
        assert.equal(
          actualText.verticalAlign,
          expectedText.verticalAlign,
          `${expectedText.name}: anchor`,
        );
        for (const property of ['wrap', 'horizontalOverflow', 'verticalOverflow'])
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
    resolve(root, 'test-results/text-frame-powerpoint/roundtrip-check.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'independent native effective insets/wrap/anchor/text',
          'native re-save preserves geometry, signed insets, wrap and independent overflow flags',
          'supported rich character/paragraph formatting and breaks',
          'slide/object counts and notes',
        ],
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Both original and XML-derived text-frame paths passed independent native properties and PowerPoint re-save checks.',
  );
} finally {
  await server.close();
  dom.window.close();
}
