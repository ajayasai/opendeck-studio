import type { TextElement, TextFrame, TextParagraph } from './types';
import { DEFAULT_TEXT_CORNER_RADIUS, resolveTextDecoration } from './textDecoration';

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
  if (
    source.paragraphSpacingAtEdges !== undefined &&
    typeof source.paragraphSpacingAtEdges !== 'boolean'
  )
    throw new Error('Invalid text frame paragraph edge spacing: expected a boolean.');
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
    ...(source.paragraphSpacingAtEdges !== undefined
      ? { paragraphSpacingAtEdges: source.paragraphSpacingAtEdges }
      : {}),
  };
}

/** Boundary spacing is independent of inter-paragraph spacing and soft line breaks. */
export function effectiveParagraphSpacing(
  paragraph: TextParagraph,
  frame: TextFrame | undefined,
  index: number,
  count: number,
): { before: number; after: number } {
  const includeEdges = frame?.paragraphSpacingAtEdges !== false;
  return {
    before: includeEdges || index > 0 ? (paragraph.spaceBefore ?? 0) : 0,
    after: includeEdges || index < count - 1 ? (paragraph.spaceAfter ?? 0) : 0,
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

/** ECMA-376 preset shape text rectangles, before body insets. */
export function textShapeInsets(
  element: Pick<TextElement, 'width' | 'height' | 'decoration'>,
): TextFrame['insets'] {
  const decoration = resolveTextDecoration(element);
  switch (decoration.shape) {
    case 'roundRect': {
      const inset =
        Math.min(element.width, element.height) *
        (decoration.cornerRadius ?? DEFAULT_TEXT_CORNER_RADIUS) *
        0.29289;
      return { left: inset, top: inset, right: inset, bottom: inset };
    }
    case 'ellipse': {
      const fraction = (1 - Math.SQRT1_2) / 2;
      return {
        left: element.width * fraction,
        right: element.width * fraction,
        top: element.height * fraction,
        bottom: element.height * fraction,
      };
    }
    case 'triangle':
      return {
        left: element.width / 4,
        right: element.width / 4,
        top: element.height / 2,
        bottom: 0,
      };
    default:
      return { left: 0, right: 0, top: 0, bottom: 0 };
  }
}

/** Unrotated local content geometry. Overflow behavior is a separate rendering decision. */
export function textContentRect(
  element: Pick<TextElement, 'width' | 'height' | 'textFrame' | 'decoration'>,
): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const { insets } = resolveTextFrame(element);
  const shape = textShapeInsets(element);
  return {
    left: shape.left + insets.left,
    top: shape.top + insets.top,
    width: Math.max(0, element.width - shape.left - shape.right - insets.left - insets.right),
    height: Math.max(0, element.height - shape.top - shape.bottom - insets.top - insets.bottom),
  };
}
