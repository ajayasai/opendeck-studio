import { useId, type CSSProperties } from 'react';
import type { ChartElement, Deck, Slide, SlideElement, ShapeElement } from './types';
import { contrastText } from './model';
import RichTextView from './RichTextView';
import TextDecorationView from './TextDecorationView';
import GradientDefinition from './GradientDefinition';
import SlideBackground, { slideBaseBackground } from './SlideBackground';

export function ChartView({ element: e }: { element: ChartElement }) {
  const w = 600,
    h = 320,
    p = 42,
    values = e.values,
    max = Math.max(...values.map(Math.abs), 1),
    positive = values.map((v) => Math.max(v, 0)),
    sum = positive.reduce((a, b) => a + b, 0) || 1;
  if (e.chartType === 'pie') {
    let angle = -Math.PI / 2;
    const palette = [e.color, '#a4cbb1', '#d8e8b4', '#f2c879', '#d38c6b', '#97acba'];
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={e.labels.map((l, i) => `${l}: ${values[i]}`).join(', ')}
      >
        {positive.map((v, i) => {
          const a = angle;
          angle += (v / sum) * Math.PI * 2;
          const r = 125,
            cx = 190,
            cy = 160;
          const d = `M${cx},${cy} L${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} A${r},${r} 0 ${v / sum > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(angle - 0.00001)},${cy + r * Math.sin(angle - 0.00001)} Z`;
          return (
            <g key={i}>
              <path d={d} fill={palette[i % palette.length]} stroke="white" strokeWidth="2" />
              <rect
                x="370"
                y={50 + i * 32}
                width="12"
                height="12"
                rx="3"
                fill={palette[i % palette.length]}
              />
              <text x="393" y={61 + i * 32} fontSize="14" fill="#33443e">
                {e.labels[i]} · {v}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }
  const hasNegative = values.some((v) => v < 0),
    plot = h - 2 * p,
    zero = hasNegative ? h / 2 : h - p,
    range = hasNegative ? plot / 2 : plot;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={e.labels.map((l, i) => `${l}: ${values[i]}`).join(', ')}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((n) => (
        <g key={n}>
          <line x1={p} x2={w - 12} y1={p + n * plot} y2={p + n * plot} stroke="#e1e7df" />
          <text x={p - 8} y={p + n * plot + 4} fontSize="11" textAnchor="end" fill="#6d7b73">
            {Math.round(hasNegative ? max * (1 - 2 * n) : max * (1 - n))}
          </text>
        </g>
      ))}
      {e.chartType === 'line' && (
        <polyline
          points={values
            .map(
              (v, i) =>
                `${p + ((i + 0.5) * (w - p - 12)) / values.length},${zero - (v / max) * range}`,
            )
            .join(' ')}
          stroke={e.color}
          fill="none"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      )}
      {values.map((v, i) => {
        const step = (w - p - 12) / values.length,
          x = p + (i + 0.5) * step,
          y = zero - (v / max) * range;
        return (
          <g key={i}>
            {e.chartType === 'bar' ? (
              <rect
                x={x - step * 0.3}
                y={Math.min(zero, y)}
                width={step * 0.6}
                height={Math.max(1, Math.abs(zero - y))}
                rx="4"
                fill={e.color}
              />
            ) : (
              <circle cx={x} cy={y} r="5" fill={e.color} stroke="white" strokeWidth="2" />
            )}
            <text x={x} y={y + (v < 0 ? 18 : -9)} textAnchor="middle" fontSize="12" fill="#33443e">
              {v}
            </text>
            <text x={x} y={h - 15} textAnchor="middle" fontSize="12" fill="#6d7b73">
              {e.labels[i]?.slice(0, 16)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ShapeView({ element: e }: { element: ShapeElement }) {
  const id = `shape-paint-${useId().replace(/:/g, '')}`;
  const fill = e.fillGradient ? `url(#${id}-fill)` : e.fill;
  const stroke = e.strokeGradient ? `url(#${id}-stroke)` : e.stroke;
  const paint = {
    fill,
    fillOpacity: e.fillOpacity ?? 1,
    stroke,
    strokeOpacity: e.strokeOpacity ?? 1,
    strokeWidth: e.strokeWidth,
  };
  const lineUsesFill = !e.strokeGradient && e.stroke === 'transparent';
  const cornerRadius = Math.min(22, e.height / 4) / Math.min(e.width, e.height);
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${e.width} ${e.height}`}
      overflow="visible"
      aria-hidden="true"
    >
      {(e.fillGradient || e.strokeGradient) && (
        <defs>
          {e.fillGradient && (
            <GradientDefinition
              id={`${id}-fill`}
              gradient={e.fillGradient}
              width={e.width}
              height={e.height}
              rotation={e.rotation}
              shape={e.shape}
              cornerRadius={cornerRadius}
            />
          )}
          {e.strokeGradient && (
            <GradientDefinition
              id={`${id}-stroke`}
              gradient={e.strokeGradient}
              width={e.width}
              height={e.height}
              rotation={e.rotation}
              shape={e.shape}
              cornerRadius={cornerRadius}
            />
          )}
        </defs>
      )}
      {e.shape === 'ellipse' ? (
        <ellipse
          cx={e.width / 2}
          cy={e.height / 2}
          rx={Math.max(0, (e.width - e.strokeWidth) / 2)}
          ry={Math.max(0, (e.height - e.strokeWidth) / 2)}
          {...paint}
        />
      ) : e.shape === 'triangle' ? (
        <polygon
          points={`${e.width / 2},${e.strokeWidth / 2} ${e.width - e.strokeWidth / 2},${e.height - e.strokeWidth / 2} ${e.strokeWidth / 2},${e.height - e.strokeWidth / 2}`}
          {...paint}
        />
      ) : e.shape === 'line' || e.shape === 'arrow' ? (
        <g
          fill="none"
          stroke={lineUsesFill ? fill : stroke}
          strokeOpacity={lineUsesFill ? (e.fillOpacity ?? 1) : (e.strokeOpacity ?? 1)}
          strokeWidth={Math.max(2, e.strokeWidth)}
        >
          <path d={`M0 ${e.height / 2} H${e.width}`} />
          {e.shape === 'arrow' && (
            <path
              d={`M${e.width - 14},${e.height / 2 - 8} L${e.width},${e.height / 2} L${e.width - 14},${e.height / 2 + 8}`}
            />
          )}
        </g>
      ) : (
        <rect
          x={e.strokeWidth / 2}
          y={e.strokeWidth / 2}
          width={Math.max(0, e.width - e.strokeWidth)}
          height={Math.max(0, e.height - e.strokeWidth)}
          rx={e.shape === 'roundRect' ? Math.min(22, e.height / 4) : 0}
          {...paint}
        />
      )}
    </svg>
  );
}

export function ElementContent({
  element: e,
  interactiveLinks = false,
}: {
  element: SlideElement;
  interactiveLinks?: boolean;
}) {
  switch (e.type) {
    case 'text':
      return (
        <>
          <TextDecorationView element={e} />
          <RichTextView element={e} interactiveLinks={interactiveLinks} />
        </>
      );
    case 'shape':
      return <ShapeView element={e} />;
    case 'image':
      return (
        <img
          src={e.src}
          alt={e.alt}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: e.fit }}
        />
      );
    case 'table':
      return (
        <table className="slide-table" style={{ fontSize: `${e.fontSize}pt`, color: e.color }}>
          <tbody>
            {e.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    style={{
                      background: r === 0 && e.header ? e.fill : r % 2 ? '#f4f6ef' : '#ffffff',
                      color: r === 0 && e.header ? contrastText(e.fill) : e.color,
                      fontWeight: r === 0 && e.header ? 700 : 400,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'chart':
      return (
        <div style={{ width: '100%', height: '100%', background: '#ffffff' }}>
          <ChartView element={e} />
        </div>
      );
  }
}

export function elementStyle(e: SlideElement): CSSProperties {
  return {
    position: 'absolute',
    left: e.x,
    top: e.y,
    width: e.width,
    height: e.height,
    transform: `rotate(${e.rotation}deg)`,
    opacity: e.opacity,
  };
}
export function SlideView({
  slide,
  deck,
  scale = 1,
  animate = false,
  interactiveLinks = false,
}: {
  slide: Slide;
  deck: Pick<Deck, 'width' | 'height'>;
  scale?: number;
  animate?: boolean;
  interactiveLinks?: boolean;
}) {
  return (
    <div
      className="slide-view"
      style={{
        width: deck.width,
        height: deck.height,
        background: slideBaseBackground(slide),
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      <SlideBackground slide={slide} width={deck.width} height={deck.height} />
      {slide.elements.map((e, i) => (
        <div
          key={e.id}
          style={
            {
              ...elementStyle(e),
              '--object-opacity': e.opacity,
              animationDelay: animate ? `${i * 90}ms` : undefined,
            } as CSSProperties
          }
          className={animate ? `object-animation-${e.animation}` : undefined}
        >
          <ElementContent element={e} interactiveLinks={interactiveLinks} />
        </div>
      ))}
    </div>
  );
}
