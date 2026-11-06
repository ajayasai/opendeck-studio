import type { TextElement, TextFrame } from './types';

/** Validate the optional native-file extension without carrying unrecognized fields forward. */
export function validateTextFrame(input: unknown): TextFrame {
  const object = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid ${label}: expected an object.`);
    return value as Record<string, unknown>;
  };
  const source = object(input, 'text frame');
  const insets = object(source.insets, 'text frame insets');
  const inset = (side: 'top' | 'right' | 'bottom' | 'left'): number => {
    const value = insets[side];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -10000 || value > 10000)
      throw new Error(
        `Invalid text frame ${side} inset: use a finite number from -10000 to 10000 pixels.`,
      );
    return value;
  };
  if (source.wrap !== 'square' && source.wrap !== 'none')
    throw new Error('Invalid text frame wrapping: use square or none.');
  const overflow = (axis: 'horizontalOverflow' | 'verticalOverflow'): 'overflow' | 'clip' => {
    const value = source[axis];
    if (value !== 'overflow' && value !== 'clip')
      throw new Error(`Invalid text frame ${axis}: use overflow or clip.`);
    return value;
  };
  return {
    insets: {
      top: inset('top'),
      right: inset('right'),
      bottom: inset('bottom'),
      left: inset('left'),
    },
    wrap: source.wrap,
    horizontalOverflow: overflow('horizontalOverflow'),
    verticalOverflow: overflow('verticalOverflow'),
  };
}

/** Always return an independent frame, including for the implicit legacy defaults. */
export function resolveTextFrame(element: Pick<TextElement, 'textFrame'>): TextFrame {
  return element.textFrame === undefined
    ? {
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
        wrap: 'square',
        horizontalOverflow: 'clip',
        verticalOverflow: 'clip',
      }
    : validateTextFrame(element.textFrame);
}

/** Unrotated local content geometry. Overflow behavior is a separate rendering decision. */
export function textContentRect(element: Pick<TextElement, 'width' | 'height' | 'textFrame'>): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const { insets } = resolveTextFrame(element);
  return {
    left: insets.left,
    top: insets.top,
    width: Math.max(0, element.width - insets.left - insets.right),
    height: Math.max(0, element.height - insets.top - insets.bottom),
  };
}
