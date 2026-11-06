import type { ImageElement, ImageRect } from './types';

export interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ImageGeometry {
  /** Full decoded bitmap bounds in local frame pixels, before flips and rotation. */
  image: ImageBounds;
  /** Source-window destination; clip this viewport and the outer frame. */
  viewport: ImageBounds;
  renderable: boolean;
  reason?: string;
}
export interface ImageRects {
  crop?: ImageRect;
  fillRect?: ImageRect;
}
type Picture = Pick<ImageElement, 'width' | 'height' | 'fit' | 'crop' | 'fillRect'>;
const MIN_RATIO = -21474.83648,
  MAX_RATIO = 21474.83647;
// Limit derived display coordinates, never the native crop metadata.
const MAX_DISPLAY_COORDINATE = 1e9;

export function validateImageRect(input: unknown): ImageRect {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid image rectangle: expected an object.');
  const source = input as Record<string, unknown>,
    result: ImageRect = {};
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    const value = source[edge];
    if (value === undefined) continue;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < MIN_RATIO ||
      value > MAX_RATIO
    )
      throw new Error(
        `Invalid image rectangle ${edge}: use a finite ratio from ${MIN_RATIO} to ${MAX_RATIO}.`,
      );
    result[edge] = value;
  }
  return result;
}

export function resolveImageRect(rect?: ImageRect): Required<ImageRect> {
  return {
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
    right: rect?.right ?? 0,
    bottom: rect?.bottom ?? 0,
  };
}
const positive = (...values: number[]) =>
  values.every((value) => Number.isFinite(value) && value > 0);
const bounded = (bounds: ImageBounds) =>
  Object.values(bounds).every(
    (value) => Number.isFinite(value) && Math.abs(value) <= MAX_DISPLAY_COORDINATE,
  );
const empty = (viewport: ImageBounds, reason: string): ImageGeometry => ({
  viewport,
  image: { x: 0, y: 0, width: 0, height: 0 },
  renderable: false,
  reason,
});

export function imageFitGeometry(
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number,
  fit: ImageElement['fit'],
): ImageGeometry | null {
  if (!positive(width, height)) return null;
  const viewport = { x: 0, y: 0, width, height };
  if (fit === 'stretch') return { viewport, image: { ...viewport }, renderable: true };
  if (!positive(naturalWidth, naturalHeight)) return null;
  const scale = (fit === 'cover' ? Math.max : Math.min)(
    width / naturalWidth,
    height / naturalHeight,
  );
  const image = {
    x: (width - naturalWidth * scale) / 2,
    y: (height - naturalHeight * scale) / 2,
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
  return bounded(image)
    ? { viewport, image, renderable: true }
    : empty(viewport, 'Picture fitting exceeds the safe browser display range.');
}

/** Explicit DrawingML source/destination rectangles need no intrinsic image dimensions. */
export function imageGeometry(
  element: Picture,
  intrinsic?: { width: number; height: number },
): ImageGeometry | null {
  const { width, height } = element;
  if (element.crop === undefined && element.fillRect === undefined && element.fit !== 'stretch')
    return intrinsic
      ? imageFitGeometry(width, height, intrinsic.width, intrinsic.height, element.fit)
      : null;
  const crop = resolveImageRect(element.crop),
    fill = resolveImageRect(element.fillRect);
  const viewport = {
    x: width * fill.left,
    y: height * fill.top,
    width: width * (1 - fill.left - fill.right),
    height: height * (1 - fill.top - fill.bottom),
  };
  const sourceWidth = 1 - crop.left - crop.right,
    sourceHeight = 1 - crop.top - crop.bottom;
  if (!positive(sourceWidth, sourceHeight))
    return empty(viewport, 'Empty or inverted source cropping is retained but not drawn.');
  if (!positive(viewport.width, viewport.height))
    return empty(viewport, 'Empty or inverted picture fill rectangles are retained but not drawn.');
  const bitmapWidth = viewport.width / sourceWidth,
    bitmapHeight = viewport.height / sourceHeight;
  const image = {
    x: viewport.x - crop.left * bitmapWidth,
    y: viewport.y - crop.top * bitmapHeight,
    width: bitmapWidth,
    height: bitmapHeight,
  };
  if (!bounded(viewport) || !bounded(image))
    return empty(
      viewport,
      'Picture cropping exceeds the safe browser display range; its metadata is retained.',
    );
  return { viewport, image, renderable: true };
}

/** Convert a full bitmap position/size back to native crop ratios, retaining a supplied fill rectangle. */
export function imageRectsFromBounds(
  width: number,
  height: number,
  bitmap: ImageBounds,
  fillRect?: ImageRect,
): ImageRects | null {
  if (!positive(width, height, bitmap.width, bitmap.height) || !bounded(bitmap)) return null;
  const fill = resolveImageRect(fillRect);
  const x = width * fill.left,
    y = height * fill.top,
    fillWidth = width * (1 - fill.left - fill.right),
    fillHeight = height * (1 - fill.top - fill.bottom);
  if (!positive(fillWidth, fillHeight)) return null;
  const crop = {
    left: (x - bitmap.x) / bitmap.width,
    top: (y - bitmap.y) / bitmap.height,
    right: 1 - (x + fillWidth - bitmap.x) / bitmap.width,
    bottom: 1 - (y + fillHeight - bitmap.y) / bitmap.height,
  };
  try {
    return {
      crop: validateImageRect(crop),
      ...(fillRect !== undefined ? { fillRect: validateImageRect(fillRect) } : {}),
    };
  } catch {
    return null;
  }
}

/** Contain keeps the full source with a letterboxed fill rectangle; cover crops the source. */
export function fitToRects(
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number,
  fit: ImageElement['fit'],
): ImageRects | null {
  const geometry = imageFitGeometry(width, height, naturalWidth, naturalHeight, fit);
  if (fit === 'contain' && geometry?.renderable) {
    const { image } = geometry;
    return {
      fillRect: {
        left: image.x / width,
        top: image.y / height,
        right: (width - image.x - image.width) / width,
        bottom: (height - image.y - image.height) / height,
      },
    };
  }
  return geometry?.renderable ? imageRectsFromBounds(width, height, geometry.image) : null;
}
