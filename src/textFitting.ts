import type { CSSProperties } from 'react';
import type { TextElement } from './types';
import { getParagraphs } from './richText';
import { resolveAutoFit } from './textFit';
import { resolveTextFrame, textContentRect } from './textFrame';
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
    return { paragraph, outer, inner, marker, runs };
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
      for (const { paragraph, outer, inner, marker, runs } of nodes) {
        style(outer, textParagraphStyle(paragraph, element));
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
    const frame = resolveTextFrame(element),
      intrinsic = frame.wrap === 'none';
    const measured = read(element, intrinsic);
    if (!validMeasurement(measured)) return element;
    const bounded = (value: number) =>
      Math.max(0.01, Math.min(100000, Math.ceil(value * 100) / 100));
    const width = intrinsic
      ? bounded(measured.width + frame.insets.left + frame.insets.right)
      : element.width;
    const height = bounded(measured.height + frame.insets.top + frame.insets.bottom);
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
