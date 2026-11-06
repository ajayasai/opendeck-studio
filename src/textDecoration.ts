import type { TextDecoration, TextDecorationLine, TextDecorationPaint, TextElement } from './types';

export const DEFAULT_TEXT_CORNER_RADIUS = 0.16667;
export const TEXT_LINE_DASHES = [
  'solid',
  'dash',
  'dot',
  'dashDot',
  'longDash',
  'longDashDot',
  'longDashDotDot',
  'sysDash',
  'sysDot',
  'sysDashDot',
  'sysDashDotDot',
] as const satisfies readonly TextDecorationLine['dash'][];

/** Rebuild only supported paint/geometry values; colors retain their authored spelling. */
export function validateTextDecoration(input: unknown): TextDecoration {
  const object = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid text decoration ${label}: expected an object.`);
    return value as Record<string, unknown>;
  };
  const number = (value: unknown, label: string, maximum: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum)
      throw new Error(
        `Invalid text decoration ${label}: use a finite number from 0 to ${maximum}.`,
      );
    return value;
  };
  const paint = (value: unknown, label: string): TextDecorationPaint => {
    const source = object(value, label);
    if (typeof source.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(source.color))
      throw new Error(`Invalid text decoration ${label} color: use a six-digit hex color.`);
    return { color: source.color, opacity: number(source.opacity, `${label} opacity`, 1) };
  };
  const source = object(input, '');
  if (!['rect', 'roundRect', 'ellipse', 'triangle'].includes(source.shape as string))
    throw new Error('Invalid text decoration shape.');
  const decoration: TextDecoration = {
    shape: source.shape as TextDecoration['shape'],
    fill: source.fill === null ? null : paint(source.fill, 'fill'),
    line: null,
  };
  if (source.line !== null) {
    const line = object(source.line, 'line');
    if (!TEXT_LINE_DASHES.includes(line.dash as TextDecorationLine['dash']))
      throw new Error('Invalid text decoration line dash.');
    decoration.line = {
      ...paint(line, 'line'),
      width: number(line.width, 'line width', 100),
      dash: line.dash as TextDecorationLine['dash'],
    };
    if (line.cap !== undefined) {
      if (!['flat', 'round', 'square'].includes(line.cap as string))
        throw new Error('Invalid text decoration line cap.');
      decoration.line.cap = line.cap as TextDecorationLine['cap'];
    }
    if (line.join !== undefined) {
      if (!['round', 'bevel', 'miter'].includes(line.join as string))
        throw new Error('Invalid text decoration line join.');
      decoration.line.join = line.join as TextDecorationLine['join'];
    }
    if (line.miterLimit !== undefined)
      decoration.line.miterLimit = number(line.miterLimit, 'line miter limit', 21474.83647);
  }
  if (source.cornerRadius !== undefined)
    decoration.cornerRadius = number(source.cornerRadius, 'corner radius', 0.5);
  return decoration;
}

export function resolveTextDecoration(element: Pick<TextElement, 'decoration'>): TextDecoration {
  return element.decoration === undefined
    ? { shape: 'rect', fill: null, line: null }
    : validateTextDecoration(element.decoration);
}

/** Flat authoring backdrop: composite the shape's fill over the slide without changing its paints. */
export function textPreviewBackground(
  element: Pick<TextElement, 'color' | 'decoration' | 'opacity'>,
  background?: string,
): string {
  const channels = (color: string) =>
    [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const [red, green, blue] = channels(element.color);
  const fallback = (red + green + blue) / 3 > 165 ? '#1e3029' : '#ffffff';
  const base = background ?? fallback;
  const fill = resolveTextDecoration(element).fill;
  const alpha = (fill?.opacity ?? 0) * element.opacity;
  if (!fill || alpha === 0) return base;
  const under = channels(base);
  return `#${channels(fill.color)
    .map((value, index) =>
      Math.round(value * alpha + under[index] * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** SVG dash lengths in local CSS pixels, scaled by authored line width. */
export function textLineDashArray(line: TextDecorationLine): string | undefined {
  const patterns: Record<Exclude<TextDecorationLine['dash'], 'solid'>, number[]> = {
    dash: [4, 3],
    dot: [1, 3],
    dashDot: [4, 3, 1, 3],
    longDash: [8, 3],
    longDashDot: [8, 3, 1, 3],
    longDashDotDot: [8, 3, 1, 3, 1, 3],
    sysDash: [3, 1],
    sysDot: [1, 1],
    sysDashDot: [3, 1, 1, 1],
    sysDashDotDot: [3, 1, 1, 1, 1, 1],
  };
  const width = line.width || 1; // A stored zero-width painted line is a device hairline.
  return line.dash === 'solid'
    ? undefined
    : patterns[line.dash].map((length) => length * width).join(' ');
}
