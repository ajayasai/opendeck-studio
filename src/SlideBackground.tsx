import { useId } from 'react';
import GradientDefinition from './GradientDefinition';
import type { Slide } from './types';

export function slideBaseBackground(
  slide: Pick<Slide, 'background' | 'backgroundGradient' | 'backgroundOpacity'>,
): string {
  return slide.backgroundGradient ||
    (slide.backgroundOpacity !== undefined && slide.backgroundOpacity !== 1)
    ? '#ffffff'
    : slide.background;
}

export default function SlideBackground({
  slide,
  width,
  height,
}: {
  slide: Slide;
  width: number;
  height: number;
}) {
  const id = `slide-paint-${useId().replace(/:/g, '')}`;
  if (
    !slide.backgroundGradient &&
    (slide.backgroundOpacity === undefined || slide.backgroundOpacity === 1)
  )
    return null;
  return (
    <svg
      className="slide-background"
      aria-hidden="true"
      focusable="false"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {slide.backgroundGradient && (
        <defs>
          <GradientDefinition
            id={id}
            gradient={slide.backgroundGradient}
            width={width}
            height={height}
          />
        </defs>
      )}
      <rect
        width={width}
        height={height}
        fill={slide.backgroundGradient ? `url(#${id})` : slide.background}
        fillOpacity={slide.backgroundOpacity ?? 1}
      />
    </svg>
  );
}
