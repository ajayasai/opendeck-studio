import type { CSSProperties } from 'react';
import type { TextElement } from './types';
import { getParagraphs } from './richText';
import { resolveAutoFit } from './textFit';
import { resolveTextFrame, textContentRect } from './textFrame';
import { DEFAULT_TEXT_CORNER_RADIUS, resolveTextDecoration } from './textDecoration';
import {
  paragraphMarkers,
  textContentStyle,
  textParagraphStyle,
  paragraphContentStyle,
  paragraphMarkerStyle,
  textRunStyle,
} from './textLayout';

export interface TextMeasurement {
  width: number;
  height: number;
}
export type MeasureText = (
  element: TextElement,
  intrinsicWidth?: boolean,
) => TextMeasurement | undefined;

const validMeasurement = (value: TextMeasurement | undefined): value is TextMeasurement =>
  !!value &&
  Number.isFinite(value.width) &&
  Number.isFinite(value.height) &&
  value.width >= 0 &&
  value.height >= 0;

const unitless = new Set(['flex', 'flexShrink', 'lineHeight', 'fontWeight', 'opacity', 'zIndex']);
function style(node: HTMLElement, properties: CSSProperties) {
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    (node.style as unknown as Record<string, string>)[key] =
      typeof value === 'number' && !unitless.has(key) ? `${value}px` : String(value);
  }
}

/** One invisible layout tree per user edit, shared across the bounded fit search. */
function createTextMeasurer(
  source: TextElement,
): { measure: MeasureText; dispose: () => void } | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    contain: 'layout style',
    width: '10000px',
    zIndex: '-1',
  });
  const content = document.createElement('div');
  content.className = 'text-content rich-text-content';
  host.append(content);
  const paragraphs = getParagraphs(source),
    markers = paragraphMarkers(paragraphs);
  const nodes = paragraphs.map((paragraph, index) => {
    const outer = document.createElement('div');
    outer.className = 'text-paragraph';
    const marker = paragraph.bullet ? document.createElement('span') : undefined;
    if (marker) {
      marker.className = 'paragraph-marker';
      marker.textContent = markers[index];
      outer.append(marker);
    }
    const inner = document.createElement('div');
    inner.className = 'paragraph-content';
    const runs = paragraph.runs.map((run) => {
      const node = document.createElement('span');
      node.textContent = run.text;
      inner.append(node);
      return node;
    });
    outer.append(inner);
    content.append(outer);
    return { paragraph, index, outer, inner, marker, runs };
  });
  document.body.append(host);
  return {
    measure(element, intrinsicWidth = false) {
      style(content, textContentStyle(element));
      Object.assign(content.style, {
        position: 'static',
        left: '',
        top: '',
        width: intrinsicWidth ? 'max-content' : `${textContentRect(element).width}px`,
        height: 'auto',
        justifyContent: 'flex-start',
      });
      for (const { paragraph, index, outer, inner, marker, runs } of nodes) {
        style(outer, textParagraphStyle(paragraph, element, index, paragraphs.length));
        outer.style.width = intrinsicWidth ? 'max-content' : '100%';
        style(inner, paragraphContentStyle(paragraph, element));
        if (marker) style(marker, paragraphMarkerStyle(paragraph, element));
        runs.forEach((run, index) => style(run, textRunStyle(paragraph.runs[index], element)));
      }
      const bounds = content.getBoundingClientRect();
      // Layout-free environments (SSR/jsdom) must not erase a saved fit factor.
      if (!bounds.width && !bounds.height && !content.scrollHeight) return undefined;
      return {
        width: Math.max(bounds.width, content.scrollWidth),
        height: Math.max(bounds.height, content.scrollHeight),
      };
    },
    dispose: () => host.remove(),
  };
}

/** Greatest representable OOXML scale that fits, including discontinuous wrap changes. */
export function solveShrinkScale(fits: (scale: number) => boolean): number {
  if (fits(1)) return 1;
  let lower = 1000,
    upper = 100000;
  if (!fits(lower / 100000)) return lower / 100000;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (fits(middle / 100000)) lower = middle;
    else upper = middle;
  }
  return lower / 100000;
}

const boundedDimension = (value: number) =>
  Math.max(0.01, Math.min(100000, Math.ceil(value * 100) / 100));

/** Invert the preset text rectangle, retaining signed body insets independently. */
function resizeToContent(element: TextElement, read: MeasureText): TextMeasurement | undefined {
  const frame = resolveTextFrame(element),
    decoration = resolveTextDecoration(element),
    intrinsic = frame.wrap === 'none',
    insetWidth = frame.insets.left + frame.insets.right,
    insetHeight = frame.insets.top + frame.insets.bottom;
  const cornerInset = 2 * (decoration.cornerRadius ?? DEFAULT_TEXT_CORNER_RADIUS) * 0.29289;
  const outerHeight = (content: number) => {
    const required = Math.max(0, content + insetHeight);
    if (decoration.shape === 'ellipse') return required / Math.SQRT1_2;
    if (decoration.shape === 'triangle') return required * 2;
    if (decoration.shape === 'roundRect') {
      const small = required / (1 - cornerInset);
      return small <= element.width ? small : required + cornerInset * element.width;
    }
    return required;
  };

  if (!intrinsic && decoration.shape === 'roundRect' && cornerInset > 0) {
    // A taller rounded box can narrow its text area until height reaches width.
    // Start at the minimum and grow monotonically through the resulting wraps.
    let height = 0.01;
    for (let step = 0; step < 32; step++) {
      const measured = read({ ...element, height }, false);
      if (!validMeasurement(measured)) return undefined;
      const next = boundedDimension(outerHeight(measured.height));
      if (next <= height) return { width: element.width, height: next };
      height = next;
    }
    // The narrowest possible text width gives a fitting upper bound if repeated
    // line-break discontinuities prevent convergence within the normal budget.
    const measured = read({ ...element, height: Math.max(height, element.width) }, false);
    return validMeasurement(measured)
      ? { width: element.width, height: boundedDimension(outerHeight(measured.height)) }
      : undefined;
  }

  const measured = read(element, intrinsic);
  if (!validMeasurement(measured)) return undefined;
  if (!intrinsic)
    return { width: element.width, height: boundedDimension(outerHeight(measured.height)) };
  let width = Math.max(0, measured.width + insetWidth),
    height = Math.max(0, measured.height + insetHeight);
  if (decoration.shape === 'ellipse') {
    width /= Math.SQRT1_2;
    height /= Math.SQRT1_2;
  } else if (decoration.shape === 'triangle') {
    width *= 2;
    height *= 2;
  } else if (decoration.shape === 'roundRect') {
    const extra = (cornerInset * Math.min(width, height)) / (1 - cornerInset);
    width += extra;
    height += extra;
  }
  return { width: boundedDimension(width), height: boundedDimension(height) };
}

/** Runs before a document command is recorded; rendering/export never remeasure. */
export function fitTextElement(element: TextElement, measure?: MeasureText): TextElement {
  const fit = resolveAutoFit(element);
  if (fit.mode === 'none') return element;
  const owner = measure ? undefined : createTextMeasurer(element);
  const read = measure ?? owner?.measure;
  if (!read) return element;
  try {
    if (fit.mode === 'shrink') {
      const area = textContentRect(element);
      let unavailable = false;
      const fontScale = solveShrinkScale((scale) => {
        const measured = read({ ...element, autoFit: { ...fit, fontScale: scale } });
        if (!validMeasurement(measured)) {
          unavailable = true;
          return false;
        }
        return measured.width <= area.width + 0.75 && measured.height <= area.height + 0.25;
      });
      return unavailable || fontScale === fit.fontScale
        ? element
        : { ...element, autoFit: { ...fit, fontScale } };
    }
    const dimensions = resizeToContent(element, read);
    if (!dimensions) return element;
    const { width, height } = dimensions;
    if (width === element.width && height === element.height) return element;
    // PowerPoint's native resize probes preserve the center for any stored
    // nonzero rotation (including 360); unrotated boxes use their text anchors.
    const verticalAnchor =
      element.verticalAlign === 'middle' ? 0.5 : element.verticalAlign === 'bottom' ? 1 : 0;
    const align = getParagraphs(element)[0]?.align ?? element.align;
    const horizontalAnchor = align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
    const deltaWidth = width - element.width,
      deltaHeight = height - element.height;
    const position = (value: number) => Math.max(-100000, Math.min(100000, value));
    return {
      ...element,
      width,
      height,
      x: position(element.x - deltaWidth * (element.rotation !== 0 ? 0.5 : horizontalAnchor)),
      y: position(element.y - deltaHeight * (element.rotation !== 0 ? 0.5 : verticalAnchor)),
    };
  } finally {
    owner?.dispose();
  }
}
