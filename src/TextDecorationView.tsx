import { useId } from 'react';
import type { TextElement } from './types';
import GradientDefinition from './GradientDefinition';
import {
  DEFAULT_TEXT_CORNER_RADIUS,
  resolveTextDecoration,
  textLineDashArray,
} from './textDecoration';

/** Decoration occupies the original box; SVG strokes remain centered on its boundary. */
export default function TextDecorationView({ element }: { element: TextElement }) {
  const paintId = `text-paint-${useId().replace(/:/g, '')}`;
  const decoration = resolveTextDecoration(element);
  if (!decoration.fill && !decoration.line) return null;
  const { width, height } = element;
  const paint = {
    fill: decoration.fill?.gradient ? `url(#${paintId}-fill)` : (decoration.fill?.color ?? 'none'),
    fillOpacity: decoration.fill?.opacity ?? 1,
    stroke: decoration.line?.gradient
      ? `url(#${paintId}-line)`
      : (decoration.line?.color ?? 'none'),
    strokeOpacity: decoration.line?.opacity ?? 1,
    strokeWidth: decoration.line ? decoration.line.width || 1 : 0,
    strokeDasharray: decoration.line ? textLineDashArray(decoration.line) : undefined,
    strokeLinecap:
      decoration.line?.cap === 'round' || decoration.line?.cap === 'square'
        ? decoration.line.cap
        : ('butt' as const),
    strokeLinejoin: decoration.line?.join ?? ('round' as const),
    strokeMiterlimit: Math.max(1, decoration.line?.miterLimit ?? 8),
  };
  return (
    <svg
      className="text-decoration"
      aria-hidden="true"
      focusable="false"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      overflow="visible"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {(decoration.fill?.gradient || decoration.line?.gradient) && (
        <defs>
          {decoration.fill?.gradient && (
            <GradientDefinition
              id={`${paintId}-fill`}
              gradient={decoration.fill.gradient}
              width={width}
              height={height}
              rotation={element.rotation}
              shape={decoration.shape}
              cornerRadius={decoration.cornerRadius}
            />
          )}
          {decoration.line?.gradient && (
            <GradientDefinition
              id={`${paintId}-line`}
              gradient={decoration.line.gradient}
              width={width}
              height={height}
              rotation={element.rotation}
              shape={decoration.shape}
              cornerRadius={decoration.cornerRadius}
            />
          )}
        </defs>
      )}
      {decoration.shape === 'ellipse' ? (
        <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...paint} />
      ) : decoration.shape === 'triangle' ? (
        <polygon points={`${width / 2},0 ${width},${height} 0,${height}`} {...paint} />
      ) : (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          rx={
            decoration.shape === 'roundRect'
              ? Math.min(width, height) * (decoration.cornerRadius ?? DEFAULT_TEXT_CORNER_RADIUS)
              : 0
          }
          {...paint}
        />
      )}
    </svg>
  );
}
