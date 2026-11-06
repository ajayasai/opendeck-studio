import {
  gradientColorAt,
  gradientCircleGeometry,
  gradientDisplayStops,
  gradientLinearGeometry,
  relativeGradientBounds,
  type GradientBounds,
} from './gradient';
import type { GradientFill } from './types';

type GradientShape = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'line' | 'arrow';
interface Props {
  id: string;
  gradient: GradientFill;
  width: number;
  height: number;
  rotation?: number;
  shape?: GradientShape;
  cornerRadius?: number;
}

function contour(shape: GradientShape, bounds: GradientBounds, radiusX = 0, radiusY = 0): string {
  const { left: x, top: y } = bounds;
  const w = Math.max(0, bounds.width),
    h = Math.max(0, bounds.height),
    right = x + w,
    bottom = y + h;
  if (shape === 'ellipse')
    return `M${x} ${y + h / 2} A${w / 2} ${h / 2} 0 1 0 ${right} ${y + h / 2} A${w / 2} ${h / 2} 0 1 0 ${x} ${y + h / 2} Z`;
  if (shape === 'triangle') return `M${x + w / 2} ${y} L${right} ${bottom} L${x} ${bottom} Z`;
  if (shape === 'roundRect') {
    const rx = w * radiusX,
      ry = h * radiusY;
    return `M${x + rx} ${y} H${right - rx} Q${right} ${y} ${right} ${y + ry} V${bottom - ry} Q${right} ${bottom} ${right - rx} ${bottom} H${x + rx} Q${x} ${bottom} ${x} ${bottom - ry} V${y + ry} Q${x} ${y} ${x + rx} ${y} Z`;
  }
  return `M${x} ${y} H${right} V${bottom} H${x} Z`;
}

function GradientTile({
  id,
  gradient,
  width,
  height,
  shape = 'rect',
  cornerRadius = 0.16667,
}: Omit<Props, 'rotation'>) {
  const stops = gradientDisplayStops(gradient);
  const stopNodes = stops.map((stop, index) => (
    <stop key={index} offset={stop.position} stopColor={stop.color} stopOpacity={stop.opacity} />
  ));
  if (gradient.kind === 'linear')
    return (
      <>
        <defs>
          <linearGradient
            id={`${id}-ramp`}
            gradientUnits="userSpaceOnUse"
            {...gradientLinearGeometry(width, height, gradient)}
            colorInterpolation="sRGB"
          >
            {stopNodes}
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill={`url(#${id}-ramp)`} />
      </>
    );

  // Native circle gradients use a point focus even when fillToRect describes an area.
  if (gradient.path === 'circle')
    return (
      <>
        <defs>
          <radialGradient
            id={`${id}-ramp`}
            gradientUnits="userSpaceOnUse"
            {...gradientCircleGeometry(width, height, gradient)}
            fr={0}
            colorInterpolation="sRGB"
          >
            {stopNodes}
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill={`url(#${id}-ramp)`} />
      </>
    );

  const outer = { left: 0, top: 0, width, height };
  const focus = relativeGradientBounds(outer, gradient.fillToRect, 0.5);
  const inner = { ...focus, width: Math.max(0, focus.width), height: Math.max(0, focus.height) };
  const focusX = inner.left + inner.width / 2,
    focusY = inner.top + inner.height / 2;
  if (
    Math.abs(inner.left - outer.left) < 1e-7 &&
    Math.abs(inner.top - outer.top) < 1e-7 &&
    Math.abs(inner.width - outer.width) < 1e-7 &&
    Math.abs(inner.height - outer.height) < 1e-7
  ) {
    const paint = gradientColorAt(gradient, 0);
    return <rect width={width} height={height} fill={paint.color} fillOpacity={paint.opacity} />;
  }
  const pathShape = (gradient.path ?? 'rect') === 'rect' ? 'rect' : shape;
  if (pathShape === 'ellipse' && outer.width > 0 && outer.height > 0) {
    const innerScale = inner.width / outer.width;
    const fx = (focusX - width / 2) / (width / 2),
      fy = (focusY - height / 2) / (height / 2);
    if (
      Math.abs(innerScale - inner.height / outer.height) < 1e-7 &&
      Math.hypot(fx, fy) + innerScale <= 1
    )
      return (
        <>
          <defs>
            <radialGradient
              id={`${id}-ramp`}
              gradientUnits="userSpaceOnUse"
              cx={0}
              cy={0}
              r={1}
              fx={fx}
              fy={fy}
              fr={innerScale}
              gradientTransform={`translate(${width / 2} ${height / 2}) scale(${width / 2} ${height / 2})`}
              colorInterpolation="sRGB"
            >
              {stopNodes}
            </radialGradient>
          </defs>
          <rect width={width} height={height} fill={`url(#${id}-ramp)`} />
        </>
      );
  }
  if (
    (pathShape === 'rect' || (pathShape === 'roundRect' && cornerRadius === 0)) &&
    focus.width >= 0 &&
    focus.height >= 0 &&
    focus.left >= 0 &&
    focus.top >= 0 &&
    focus.left + focus.width <= width &&
    focus.top + focus.height <= height
  ) {
    const left = focus.left,
      right = left + focus.width,
      top = focus.top,
      bottom = top + focus.height;
    const faces = [
      {
        key: 'top',
        points: `0,0 ${width},0 ${right},${top} ${left},${top}`,
        x1: 0,
        y1: top,
        x2: 0,
        y2: 0,
        size: top,
      },
      {
        key: 'bottom',
        points: `0,${height} ${width},${height} ${right},${bottom} ${left},${bottom}`,
        x1: 0,
        y1: bottom,
        x2: 0,
        y2: height,
        size: height - bottom,
      },
      {
        key: 'left',
        points: `0,0 0,${height} ${left},${bottom} ${left},${top}`,
        x1: left,
        y1: 0,
        x2: 0,
        y2: 0,
        size: left,
      },
      {
        key: 'right',
        points: `${width},0 ${width},${height} ${right},${bottom} ${right},${top}`,
        x1: right,
        y1: 0,
        x2: width,
        y2: 0,
        size: width - right,
      },
    ].filter((face) => face.size > 0);
    const center = gradientColorAt(gradient, 0);
    return (
      <g data-gradient-geometry="rectangular-faces">
        <defs>
          {faces.map((face) => (
            <linearGradient
              key={face.key}
              id={`${id}-${face.key}`}
              gradientUnits="userSpaceOnUse"
              x1={face.x1}
              y1={face.y1}
              x2={face.x2}
              y2={face.y2}
              colorInterpolation="sRGB"
            >
              {stopNodes}
            </linearGradient>
          ))}
        </defs>
        {faces.map((face) => (
          <polygon
            key={face.key}
            points={face.points}
            fill={`url(#${id}-${face.key})`}
            shapeRendering="crispEdges"
          />
        ))}
        {focus.width > 0 && focus.height > 0 && (
          <rect
            x={left}
            y={top}
            width={focus.width}
            height={focus.height}
            fill={center.color}
            fillOpacity={center.opacity}
            shapeRendering="crispEdges"
          />
        )}
      </g>
    );
  }
  const roundRadius = Math.min(width, height) * cornerRadius;
  const radiusX = roundRadius / width,
    radiusY = roundRadius / height;
  const pathAt = (t: number) =>
    contour(
      pathShape,
      {
        left: inner.left + (outer.left - inner.left) * t,
        top: inner.top + (outer.top - inner.top) * t,
        width: inner.width + (outer.width - inner.width) * t,
        height: inner.height + (outer.height - inner.height) * t,
      },
      radiusX,
      radiusY,
    );
  const center = gradientColorAt(gradient, 0),
    edge = gradientColorAt(gradient, 1);
  // Disjoint rings prevent translucent contour samples from accumulating alpha.
  const steps = 128;
  return (
    <g data-gradient-approximation="contour-bands" shapeRendering="crispEdges">
      <path
        d={`M0 0 H${width} V${height} H0 Z ${pathAt(1)}`}
        fillRule="evenodd"
        fill={edge.color}
        fillOpacity={edge.opacity}
      />
      {Array.from({ length: steps }, (_, index) => {
        const start = index / steps,
          end = (index + 1) / steps,
          paint = gradientColorAt(gradient, (start + end) / 2);
        return (
          <path
            key={index}
            d={`${pathAt(end)} ${pathAt(start)}`}
            fillRule="evenodd"
            fill={paint.color}
            fillOpacity={paint.opacity}
          />
        );
      })}
      <path d={pathAt(0)} fill={center.color} fillOpacity={center.opacity} />
    </g>
  );
}

/** One reusable SVG paint server, with native mirrored tiling and no document mutations. */
export default function GradientDefinition({
  id,
  gradient,
  width,
  height,
  rotation = 0,
  shape = 'rect',
  cornerRadius,
}: Props) {
  const fixed = gradient.rotateWithShape === false && rotation !== 0;
  const angle = (rotation * Math.PI) / 180;
  const anchorWidth = fixed
    ? Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))
    : width;
  const anchorHeight = fixed
    ? Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))
    : height;
  const anchor = {
    left: (width - anchorWidth) / 2,
    top: (height - anchorHeight) / 2,
    width: anchorWidth,
    height: anchorHeight,
  };
  const tile = relativeGradientBounds(anchor, gradient.tileRect, 0);
  if (tile.width < 0.001 || tile.height < 0.001) {
    const fallback = gradientColorAt(gradient, 1);
    return (
      <linearGradient id={id}>
        <stop offset="0" stopColor={fallback.color} stopOpacity={fallback.opacity} />
      </linearGradient>
    );
  }
  const tileId = `${id}-tile`;
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      x={tile.left}
      y={tile.top}
      width={tile.width * 2}
      height={tile.height * 2}
      patternTransform={fixed ? `rotate(${-rotation} ${width / 2} ${height / 2})` : undefined}
    >
      <svg
        width={tile.width}
        height={tile.height}
        viewBox={`0 0 ${tile.width} ${tile.height}`}
        overflow="hidden"
        id={tileId}
      >
        <GradientTile
          id={id}
          gradient={gradient}
          width={tile.width}
          height={tile.height}
          shape={shape}
          cornerRadius={cornerRadius}
        />
      </svg>
      <use href={`#${tileId}`} transform={`translate(${tile.width * 2} 0) scale(-1 1)`} />
      <use href={`#${tileId}`} transform={`translate(0 ${tile.height * 2}) scale(1 -1)`} />
      <use
        href={`#${tileId}`}
        transform={`translate(${tile.width * 2} ${tile.height * 2}) scale(-1 -1)`}
      />
    </pattern>
  );
}
