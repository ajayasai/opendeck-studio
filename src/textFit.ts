import type { Deck, TextAutoFit, TextElement, TextRun, GroupElement, SlideElement } from './types';
import { getParagraphs } from './richText';
import { effectiveParagraphSpacing, resolveTextFrame, textContentRect } from './textFrame';
import { groupLayoutContext } from './groups';

/** Fit against native displayed frame dimensions while preserving local child coordinates. */
export function fitTextInGroups(
  element: TextElement,
  ancestors: GroupElement[],
  fit: (text: TextElement) => TextElement,
): TextElement {
  const context = groupLayoutContext(ancestors, element.rotation),
    scale = context.size;
  if (scale.x === 1 && scale.y === 1) return fit(element);
  const width = element.width * scale.x,
    height = element.height * scale.y;
  if (![width, height].every((value) => Number.isFinite(value) && value >= 0.01 && value <= 100000))
    return element;
  // Measurement needs dimensions, not an arbitrary child-coordinate origin. Use
  // resize deltas so the fitter's world-coordinate clamps cannot move a valid child.
  const rendered = { ...element, width, height, x: 0, y: 0 };
  const fitted = fit(rendered);
  if (fitted === rendered) return element;
  const fittedWidth = fitted.width === rendered.width ? element.width : fitted.width / scale.x;
  const fittedHeight = fitted.height === rendered.height ? element.height : fitted.height / scale.y;
  const centerDeltaX = fitted.x + fitted.width / 2 - rendered.x - rendered.width / 2;
  const centerDeltaY = fitted.y + fitted.height / 2 - rendered.y - rendered.height / 2;
  const result = {
    ...fitted,
    width: fittedWidth,
    height: fittedHeight,
    x:
      centerDeltaX === 0 && fittedWidth === element.width
        ? element.x
        : element.x + element.width / 2 + centerDeltaX / context.position.x - fittedWidth / 2,
    y:
      centerDeltaY === 0 && fittedHeight === element.height
        ? element.y
        : element.y + element.height / 2 + centerDeltaY / context.position.y - fittedHeight / 2,
  };
  if (
    ![result.width, result.height].every(
      (value) => Number.isFinite(value) && value >= 0.01 && value <= 100000,
    ) ||
    ![result.x, result.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 100000)
  )
    return element;
  return result;
}

function groupMetricInput(element: TextElement, ancestors: GroupElement[]): string {
  const scale = groupLayoutContext(ancestors, element.rotation).size;
  return metricInput({
    ...element,
    width: element.width * scale.x,
    height: element.height * scale.y,
  });
}

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
  const sourceParagraphs = getParagraphs(element);
  const paragraphs = sourceParagraphs.map((paragraph, index) => {
    const spacing = effectiveParagraphSpacing(paragraph, frame, index, sourceParagraphs.length);
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
      spacing.before,
      spacing.after,
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
    textContentRect(element),
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
  const previous = new Map<string, { element: TextElement; ancestors: GroupElement[] }>();
  const collect = (elements: SlideElement[], ancestors: GroupElement[]) => {
    for (const element of elements) {
      if (element.type === 'group') collect(element.children, [...ancestors, element]);
      if (element.type === 'text') previous.set(element.id, { element, ancestors });
    }
  };
  before.slides.forEach((slide) => collect(slide.elements, []));
  let changed = false;
  const slides = next.slides.map((slide) => {
    if (unchangedSlides.has(slide)) return slide;
    let changedSlide = false;
    const visit = (items: SlideElement[], ancestors: GroupElement[]): SlideElement[] => {
      let changedItems = false;
      const result = items.map((element): SlideElement => {
        if (element.type === 'group') {
          const children = visit(element.children, [...ancestors, element]);
          if (children === element.children) return element;
          changedItems = true;
          return { ...element, children };
        }
        if (element.type !== 'text') return element;
        const original = previous.get(element.id);
        if (!original) return element;
        const mode = resolveAutoFit(element).mode;
        if (mode === 'none') return element;
        if (
          mode === resolveAutoFit(original.element).mode &&
          groupMetricInput(element, ancestors) ===
            groupMetricInput(original.element, original.ancestors)
        )
          return element;
        const fitted = fitTextInGroups(element, ancestors, fit);
        if (fitted !== element) {
          changedSlide = true;
          changedItems = true;
        }
        return fitted;
      });
      return changedItems ? result : items;
    };
    const elements = visit(slide.elements, []);
    if (!changedSlide) return slide;
    changed = true;
    return { ...slide, elements };
  });
  return changed ? { ...next, slides } : next;
}
