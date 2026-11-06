import type { ImageElement, ImageRect } from './types';

type Edge = keyof ImageRect;
/** For each encoded edge, the corresponding displayed EXIF-oriented edge. */
const edges: Record<number, readonly Edge[]> = {
  1: ['left', 'top', 'right', 'bottom'],
  2: ['right', 'top', 'left', 'bottom'],
  3: ['right', 'bottom', 'left', 'top'],
  4: ['left', 'bottom', 'right', 'top'],
  5: ['top', 'left', 'bottom', 'right'],
  6: ['top', 'right', 'bottom', 'left'],
  7: ['bottom', 'right', 'top', 'left'],
  8: ['bottom', 'left', 'top', 'right'],
};
const transforms: Record<number, { rotation: number; flipH?: boolean; flipV?: boolean }> = {
  1: { rotation: 0 },
  2: { rotation: 0, flipH: true },
  3: { rotation: 180 },
  4: { rotation: 0, flipV: true },
  5: { rotation: 90, flipV: true },
  6: { rotation: 90 },
  7: { rotation: 270, flipV: true },
  8: { rotation: 270 },
};

/** Dimension metadata is encoded-axis; browser auto-orientation swaps those axes for EXIF 5–8. */
export function imageOrientedDimensions(
  dimensions: { width: number; height: number; orientation?: number },
  orientation?: ImageElement['orientation'],
): { width: number; height: number } {
  const swapped = orientation !== 'encoded' && [5, 6, 7, 8].includes(dimensions.orientation ?? 1);
  return swapped
    ? { width: dimensions.height, height: dimensions.width }
    : { width: dimensions.width, height: dimensions.height };
}

/** Re-express legacy auto-oriented pixels in encoded axes without changing their displayed appearance. */
export function materializeImageOrientation(
  element: ImageElement,
  exifOrientation = 1,
): ImageElement {
  if (element.orientation === 'encoded') return element;
  const orientation = edges[exifOrientation] ? exifOrientation : 1;
  const transform = transforms[orientation];
  const swapped = orientation >= 5;
  const width = swapped ? element.height : element.width,
    height = swapped ? element.width : element.height;
  const permute = (rect: ImageRect): ImageRect => {
    const result: ImageRect = {};
    (['left', 'top', 'right', 'bottom'] as const).forEach((edge, index) => {
      const value = rect[edges[orientation][index]];
      if (value !== undefined) result[edge] = value;
    });
    return result;
  };
  const reflected = Boolean(element.flipH) !== Boolean(element.flipV);
  const rotation = element.rotation + (reflected ? -1 : 1) * transform.rotation;
  return {
    ...element,
    width,
    height,
    x: element.x + (element.width - width) / 2,
    y: element.y + (element.height - height) / 2,
    rotation: rotation < -360000 || rotation > 360000 ? rotation % 360 : rotation,
    ...(element.flipH !== undefined || transform.flipH
      ? { flipH: Boolean(element.flipH) !== Boolean(transform.flipH) }
      : {}),
    ...(element.flipV !== undefined || transform.flipV
      ? { flipV: Boolean(element.flipV) !== Boolean(transform.flipV) }
      : {}),
    ...(element.crop !== undefined ? { crop: permute(element.crop) } : {}),
    ...(element.fillRect !== undefined ? { fillRect: permute(element.fillRect) } : {}),
    orientation: 'encoded',
  };
}
