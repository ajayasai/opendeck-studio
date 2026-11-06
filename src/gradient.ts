import type { GradientFill, GradientStop, RelativeGradientRect, Slide } from './types';

export const MAX_GRADIENT_STOPS = 256;
const colorPattern = /^#[0-9a-f]{6}$/i;

/** Preserve authored order, duplicate stops and optional defaults; reject rather than silently normalize. */
export function validateGradientFill(input: unknown): GradientFill {
  const object = (value: unknown, name: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid gradient ${name}: expected an object.`);
    return value as Record<string, unknown>;
  };
  const number = (value: unknown, name: string, min: number, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new Error(`Invalid gradient ${name}: use a finite number from ${min} to ${max}.`);
    return value;
  };
  const source = object(input, 'fill');
  if (source.kind !== 'linear' && source.kind !== 'path') throw new Error('Invalid gradient kind.');
  if (!Array.isArray(source.stops) || source.stops.length > MAX_GRADIENT_STOPS)
    throw new Error(
      `Invalid gradient stops: use an array with at most ${MAX_GRADIENT_STOPS} stops.`,
    );
  const result: GradientFill = {
    kind: source.kind,
    stops: source.stops.map((entry) => {
      const stop = object(entry, 'stop');
      if (typeof stop.color !== 'string' || !colorPattern.test(stop.color))
        throw new Error('Invalid gradient stop color: use a six-digit hex color.');
      return {
        position: number(stop.position, 'stop position', 0, 1),
        color: stop.color,
        opacity: number(stop.opacity, 'stop opacity', 0, 1),
      };
    }),
  };
  if (source.angle !== undefined) {
    result.angle = number(source.angle, 'angle', 0, 360);
    if (result.angle === 360) throw new Error('Invalid gradient angle: use less than 360 degrees.');
  }
  for (const key of ['scaled', 'rotateWithShape'] as const) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean')
      throw new Error(`Invalid gradient ${key}: expected a boolean.`);
    result[key] = source[key];
  }
  if (source.path !== undefined) {
    if (!['circle', 'rect', 'shape'].includes(source.path as string))
      throw new Error('Invalid gradient path.');
    result.path = source.path as GradientFill['path'];
  }
  if (source.flip !== undefined) {
    if (!['none', 'x', 'y', 'xy'].includes(source.flip as string))
      throw new Error('Invalid gradient flip.');
    result.flip = source.flip as GradientFill['flip'];
  }
  for (const key of ['fillToRect', 'tileRect'] as const) {
    if (source[key] === undefined) continue;
    const value = object(source[key], key),
      rect: RelativeGradientRect = {};
    for (const side of ['left', 'top', 'right', 'bottom'] as const)
      if (value[side] !== undefined)
        rect[side] = number(value[side], `${key} ${side}`, -21474.83648, 21474.83647);
    result[key] = rect;
  }
  return result;
}

const channels = (color: string) =>
  [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
const hex = (values: number[]) =>
  `#${values
    .map((value) =>
      Math.round(Math.max(0, Math.min(255, value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** PowerPoint's channel-wise interpolation, without changing stored stop positions or colors. */
export function gradientColorAt(
  gradient: GradientFill,
  position: number,
): Omit<GradientStop, 'position'> {
  const stops = gradient.stops
    .map((stop, index) => ({ ...stop, index }))
    .sort((a, b) => a.position - b.position || a.index - b.index);
  if (!stops.length) return { color: '#000000', opacity: 1 };
  if (position < stops[0].position) return { color: stops[0].color, opacity: stops[0].opacity };
  let index = 0;
  while (index + 1 < stops.length && stops[index + 1].position <= position) index++;
  const first = stops[index],
    second = stops[index + 1];
  if (!second || position <= first.position) return { color: first.color, opacity: first.opacity };
  const t = (position - first.position) / (second.position - first.position);
  const gamma =
    (stops.length === 2 && stops[0].position === 0 && stops[1].position === 1) ||
    (stops.length === 3 &&
      stops[0].position === 0 &&
      stops[2].position === 1 &&
      stops[0].color.toLowerCase() === stops[2].color.toLowerCase());
  const from = channels(first.color),
    to = channels(second.color);
  const color = hex(
    from.map((value, channel) => {
      const blend = gamma ? (to[channel] > value ? 1 - (1 - t) ** 1.875 : t ** 1.875) : t;
      return value + (to[channel] - value) * blend;
    }),
  );
  return { color, opacity: first.opacity + (second.opacity - first.opacity) * t };
}

export function resolveGradientRect(
  rect: RelativeGradientRect | undefined,
  defaultEdge: number,
): Required<RelativeGradientRect> {
  return {
    left: rect?.left ?? (rect ? 0 : defaultEdge),
    top: rect?.top ?? (rect ? 0 : defaultEdge),
    right: rect?.right ?? (rect ? 0 : defaultEdge),
    bottom: rect?.bottom ?? (rect ? 0 : defaultEdge),
  };
}

export function compositePaint(color: string, opacity: number, background = '#ffffff'): string {
  const under = channels(background);
  return hex(channels(color).map((value, index) => value * opacity + under[index] * (1 - opacity)));
}

/** A flat authoring preview; the slide renderer itself draws the complete spatial gradient. */
export function slideBackgroundColor(
  slide: Pick<Slide, 'background' | 'backgroundGradient' | 'backgroundOpacity'>,
): string {
  const paint = slide.backgroundGradient
    ? gradientColorAt(slide.backgroundGradient, 0.5)
    : { color: slide.background, opacity: 1 };
  return compositePaint(paint.color, paint.opacity * (slide.backgroundOpacity ?? 1));
}

export interface GradientBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function relativeGradientBounds(
  bounds: GradientBounds,
  rect: RelativeGradientRect | undefined,
  defaultEdge: number,
): GradientBounds {
  const inset = resolveGradientRect(rect, defaultEdge);
  return {
    left: bounds.left + bounds.width * inset.left,
    top: bounds.top + bounds.height * inset.top,
    width: bounds.width * (1 - inset.left - inset.right),
    height: bounds.height * (1 - inset.top - inset.bottom),
  };
}

/** The corrected native scaled normal is (h*cos(angle), w*sin(angle)), confirmed by Microsoft in May 2025. */
export function gradientLinearGeometry(
  width: number,
  height: number,
  gradient: Pick<GradientFill, 'angle' | 'scaled'>,
): { x1: number; y1: number; x2: number; y2: number } {
  const radians = ((gradient.angle ?? 0) * Math.PI) / 180;
  let x = Math.cos(radians) * (gradient.scaled ? height : 1),
    y = Math.sin(radians) * (gradient.scaled ? width : 1);
  const length = Math.hypot(x, y) || 1;
  x /= length;
  y /= length;
  const half = (Math.abs(x) * width + Math.abs(y) * height) / 2;
  return {
    x1: width / 2 - x * half,
    y1: height / 2 - y * half,
    x2: width / 2 + x * half,
    y2: height / 2 + y * half,
  };
}

/** Native PowerPoint probes use a point focus derived from the shape rectangle, even for area focus metadata. */
export function gradientCircleGeometry(
  width: number,
  height: number,
  gradient: Pick<GradientFill, 'fillToRect'>,
): { cx: number; cy: number; r: number; fx: number; fy: number } {
  const focus = relativeGradientBounds(
    { left: 0, top: 0, width, height },
    gradient.fillToRect,
    0.5,
  );
  const origin = (offset: number, inner: number, outer: number) =>
    inner > 0 && Math.abs(outer - inner) > Number.EPSILON * 2
      ? offset + (inner * offset) / (outer - inner)
      : offset;
  return {
    cx: width / 2,
    cy: height / 2,
    r: Math.hypot(width, height) / 2,
    fx: origin(focus.left, focus.width, width),
    fy: origin(focus.top, focus.height, height),
  };
}

/** Bounded, derived display samples; original OOXML/native stops are never densified in storage. */
export function gradientDisplayStops(gradient: GradientFill): GradientStop[] {
  if (!gradient.stops.length)
    return [
      { position: 0, color: '#000000', opacity: 1 },
      { position: 1, color: '#000000', opacity: 1 },
    ];
  const ordered = gradient.stops
    .map((stop, index) => ({ ...stop, index }))
    .sort((a, b) => a.position - b.position || a.index - b.index);
  const result: GradientStop[] = [];
  // Additional samples approximate native gamma and limit SVG premultiplied-alpha deviations.
  for (let index = 0; index < ordered.length; index++) {
    const stop = ordered[index],
      next = ordered[index + 1];
    result.push({ position: stop.position, color: stop.color, opacity: stop.opacity });
    if (!next || next.position === stop.position) continue;
    const steps = Math.max(1, Math.ceil((next.position - stop.position) * 64));
    for (let sample = 1; sample < steps; sample++) {
      const position = stop.position + ((next.position - stop.position) * sample) / steps;
      result.push({ position, ...gradientColorAt(gradient, position) });
    }
  }
  return result;
}

/** Explicit visual boundaries; metadata remains fully editable and is exported independently. */
export function gradientRenderingWarnings(gradient: GradientFill): string[] {
  const warnings: string[] = [];
  const tile = resolveGradientRect(gradient.tileRect, 0);
  if (tile.left + tile.right >= 1 || tile.top + tile.bottom >= 1)
    warnings.push(
      'Empty or inverted gradient tiles use the last stop color in the browser; their metadata is retained.',
    );
  if (gradient.stops.some((stop) => stop.opacity < 1))
    warnings.push('Gradient transparency interpolation can differ from PowerPoint.');
  if (gradient.kind === 'path')
    warnings.push(
      'Complex path gradient contours and focus rectangles are approximated in the browser.',
    );
  if (gradient.tileRect && Object.values(gradient.tileRect).some((value) => value !== 0))
    warnings.push(
      'Custom gradient tiling can render differently across presentation applications.',
    );
  if (gradient.rotateWithShape === false)
    warnings.push(
      'Gradients that remain fixed while a shape rotates may use different bounds across applications.',
    );
  return warnings;
}
