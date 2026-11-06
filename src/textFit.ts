import type { Deck, TextAutoFit, TextElement, TextRun } from './types';
import { getParagraphs } from './richText';
import { resolveTextFrame } from './textFrame';

/** Reconstruct the optional native fitting extension without retaining unknown fields. */
export function validateAutoFit(input: unknown): TextAutoFit {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid text autofit: expected an object.');
  const value = input as Record<string, unknown>;
  if (value.mode === 'none' || value.mode === 'resize') return { mode: value.mode };
  if (value.mode !== 'shrink') throw new Error('Invalid text autofit mode.');
  const ratio = (name: 'fontScale' | 'lineSpacingReduction', minimum: number, maximum: number) => {
    const number = value[name];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < minimum ||
      number > maximum
    )
      throw new Error(
        `Invalid text autofit ${name}: use a finite number from ${minimum} to ${maximum}.`,
      );
    return number;
  };
  return {
    mode: 'shrink',
    fontScale: ratio('fontScale', 0.01, 1),
    lineSpacingReduction: ratio('lineSpacingReduction', 0, 132),
  };
}

/** A fresh value is returned; resolving legacy documents never adds stored properties. */
export function resolveAutoFit(element: Pick<TextElement, 'autoFit'>): TextAutoFit {
  return element.autoFit === undefined ? { mode: 'none' } : validateAutoFit(element.autoFit);
}

/** Only effective metrics participate. Color, links and run segmentation do not change fitting. */
function metricInput(element: TextElement): string {
  const frame = resolveTextFrame(element);
  const style = (run?: TextRun) =>
    [
      run?.fontFamily ?? element.fontFamily,
      run?.fontSize ?? element.fontSize,
      run?.bold ?? element.bold,
      run?.italic ?? element.italic,
    ] as const;
  let counters: number[] = [];
  const paragraphs = getParagraphs(element).map((paragraph) => {
    const runs: { text: string; style: ReturnType<typeof style> }[] = [];
    for (const run of paragraph.runs) {
      if (!run.text) continue;
      const effective = style(run),
        previous = runs.at(-1);
      if (previous && previous.style.every((value, index) => value === effective[index]))
        previous.text += run.text;
      else runs.push({ text: run.text, style: effective });
    }
    const firstStyle = style(paragraph.runs[0]);
    let list: unknown = null;
    if (paragraph.bullet) {
      const { kind, level, start, character } = paragraph.bullet;
      counters.length = level + 1;
      let marker: string;
      if (kind === 'bullet') {
        counters[level] = 0;
        marker = character || '•';
      } else {
        counters[level] = start ?? (counters[level] || 0) + 1;
        marker = `${counters[level]}.`;
      }
      // The renderer and PPTX writer normalize absolute indents from the first run.
      list = [level, marker, level * 1.4 * firstStyle[1], firstStyle];
    } else counters = [];
    return [
      paragraph.align ?? element.align,
      paragraph.lineSpacingPoints !== undefined
        ? ['points', paragraph.lineSpacingPoints]
        : ['relative', paragraph.lineSpacing ?? 1.16],
      paragraph.spaceBefore ?? 0,
      paragraph.spaceAfter ?? 0,
      firstStyle,
      list,
      runs,
    ];
  });
  return JSON.stringify([
    element.width,
    element.height,
    [frame.insets.top, frame.insets.right, frame.insets.bottom, frame.insets.left],
    frame.wrap,
    paragraphs,
  ]);
}

/**
 * Fit edited existing text before publishing a command. Newly loaded documents,
 * copied objects and unchanged rich-editor normalization keep their saved results.
 * The callback owns measurement; this traversal never reads the DOM or mutates input.
 */
export function prepareTextLayout(
  before: Deck,
  next: Deck,
  fit: (text: TextElement) => TextElement,
): Deck {
  if (before === next || before.id !== next.id || before.slides === next.slides) return next;
  const unchangedSlides = new Set(before.slides);
  if (next.slides.every((slide) => unchangedSlides.has(slide))) return next;
  const previous = new Map(
    before.slides.flatMap((slide) =>
      slide.elements.map((element) => [element.id, element] as const),
    ),
  );
  let changed = false;
  const slides = next.slides.map((slide) => {
    if (unchangedSlides.has(slide)) return slide;
    let changedSlide = false;
    const elements = slide.elements.map((element) => {
      if (element.type !== 'text') return element;
      const original = previous.get(element.id);
      if (!original || original.type !== 'text' || element === original) return element;
      const mode = resolveAutoFit(element).mode;
      if (mode === 'none') return element;
      if (mode === resolveAutoFit(original).mode && metricInput(element) === metricInput(original))
        return element;
      const fitted = fit(element);
      if (fitted !== element) changedSlide = true;
      return fitted;
    });
    if (!changedSlide) return slide;
    changed = true;
    return { ...slide, elements };
  });
  return changed ? { ...next, slides } : next;
}
