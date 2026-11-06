import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GradientDefinition from './GradientDefinition';
import { createDeck, createElement } from './model';
import { ElementContent, SlideView } from './SlideView';
import Canvas from './Canvas';
import type { GradientFill } from './types';

afterEach(cleanup);
const ramp = (patch: Partial<GradientFill> = {}): GradientFill => ({
  kind: 'linear',
  stops: [
    { position: 0, color: '#000000', opacity: 1 },
    { position: 1, color: '#FFFFFF', opacity: 1 },
  ],
  ...patch,
});
function definition(gradient: GradientFill, rotation = 0) {
  return render(
    <svg>
      <defs>
        <GradientDefinition
          id="test-paint"
          gradient={gradient}
          width={200}
          height={100}
          rotation={rotation}
        />
      </defs>
      <rect width={200} height={100} fill="url(#test-paint)" />
    </svg>,
  );
}

describe('shared gradient SVG paint server', () => {
  it('uses corrected user-space scaled geometry and derived gamma stops without rewriting authored stops', () => {
    const gradient = ramp({ angle: 45, scaled: true }),
      original = structuredClone(gradient);
    const view = definition(gradient),
      linear = view.container.querySelector('linearGradient')!;
    expect(linear.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    expect(Number(linear.getAttribute('x1'))).toBeCloseTo(60, 8);
    expect(Number(linear.getAttribute('y1'))).toBeCloseTo(-30, 8);
    expect(Number(linear.getAttribute('x2'))).toBeCloseTo(140, 8);
    expect(Number(linear.getAttribute('y2'))).toBeCloseTo(130, 8);
    expect(linear.querySelector('[offset="0.5"]')?.getAttribute('stop-color')).toBe('#b9b9b9');
    expect(gradient).toEqual(original);
  });

  it('retains raw flip metadata while matching Office mirrored xy tiles', () => {
    const gradient = ramp({ flip: 'none', tileRect: { left: 0.5 } });
    const view = definition(gradient),
      pattern = view.container.querySelector('pattern')!;
    expect(pattern.getAttribute('x')).toBe('100');
    expect(pattern.getAttribute('width')).toBe('200');
    expect(pattern.getAttribute('height')).toBe('200');
    expect(
      Array.from(pattern.querySelectorAll('use')).map((node) => node.getAttribute('transform')),
    ).toEqual([
      'translate(200 0) scale(-1 1)',
      'translate(0 200) scale(1 -1)',
      'translate(200 200) scale(-1 -1)',
    ]);
    expect(gradient.flip).toBe('none');
  });

  it('uses the native circumscribed circle for radial point focus', () => {
    const view = definition(ramp({ kind: 'path', path: 'circle' }));
    const radial = view.container.querySelector('radialGradient')!;
    expect(radial.getAttribute('cx')).toBe('100');
    expect(radial.getAttribute('cy')).toBe('50');
    expect(Number(radial.getAttribute('r'))).toBeCloseTo(111.803398875, 8);
    expect(radial.getAttribute('fx')).toBe('100');
    expect(radial.getAttribute('fy')).toBe('50');
    expect(radial.getAttribute('fr')).toBe('0');
    expect(view.container.querySelector('[data-gradient-approximation]')).toBeNull();
  });

  it('renders rectangular focus with four continuous faces rather than contour bands', () => {
    const view = definition(
      ramp({
        kind: 'path',
        path: 'rect',
        fillToRect: { left: 0.25, top: 0.2, right: 0.25, bottom: 0.3 },
      }),
    );
    const faces = view.container.querySelector('[data-gradient-geometry="rectangular-faces"]')!;
    expect(faces.querySelectorAll('polygon')).toHaveLength(4);
    expect(faces.querySelectorAll('linearGradient')).toHaveLength(4);
    expect(
      Array.from(faces.querySelectorAll('polygon')).every(
        (face) => face.getAttribute('shape-rendering') === 'crispEdges',
      ),
    ).toBe(true);
    expect(faces.querySelector('rect')?.getAttribute('fill')).toBe('#000000');
    expect(faces.querySelector('rect')?.getAttribute('x')).toBe('50');
    expect(faces.querySelector('rect')?.getAttribute('y')).toBe('20');
    expect(faces.querySelector('rect')?.getAttribute('height')).toBe('50');
    expect(view.container.querySelector('[data-gradient-approximation]')).toBeNull();
  });

  it('keeps native circular area focus as a point without inventing a solid center disk', () => {
    const view = definition(
      ramp({
        kind: 'path',
        path: 'circle',
        fillToRect: { left: 0.15, top: 0.25, right: 0.55, bottom: 0.5 },
      }),
    );
    const radial = view.container.querySelector('radialGradient')!;
    expect(Number(radial.getAttribute('fx'))).toBeCloseTo(42.8571428571, 8);
    expect(Number(radial.getAttribute('fy'))).toBeCloseTo(33.3333333333, 8);
    expect(radial.getAttribute('fr')).toBe('0');
    expect(view.container.querySelector('[data-gradient-approximation]')).toBeNull();
  });

  it('distinguishes absent centered focus from the native empty rect/circle focus behaviors', () => {
    const view = definition(ramp({ kind: 'path' }));
    expect(
      view.container
        .querySelector('[data-gradient-geometry="rectangular-faces"]')
        ?.querySelectorAll('polygon'),
    ).toHaveLength(4);
    view.unmount();
    const emptyRect = definition(ramp({ kind: 'path', path: 'rect', fillToRect: {} }));
    expect(emptyRect.container.querySelector('#test-paint-tile > rect')?.getAttribute('fill')).toBe(
      '#000000',
    );
    emptyRect.unmount();
    const emptyCircle = definition(ramp({ kind: 'path', path: 'circle', fillToRect: {} }));
    const radial = emptyCircle.container.querySelector('radialGradient')!;
    expect(radial.getAttribute('fx')).toBe('0');
    expect(radial.getAttribute('fy')).toBe('0');
    expect(radial.getAttribute('fr')).toBe('0');
  });

  it('renders native ellipse shape paths as continuous elliptical bands', () => {
    const view = render(
      <svg>
        <defs>
          <GradientDefinition
            id="ellipse-path"
            gradient={ramp({ kind: 'path', path: 'shape' })}
            width={200}
            height={100}
            shape="ellipse"
          />
        </defs>
      </svg>,
    );
    const radial = view.container.querySelector('radialGradient')!;
    expect(radial.getAttribute('gradientTransform')).toBe('translate(100 50) scale(100 50)');
    expect(radial.getAttribute('r')).toBe('1');
    expect(view.container.querySelector('[data-gradient-approximation]')).toBeNull();
  });

  it('bounds complex ellipse-focus rendering and keeps translucent contour rings disjoint', () => {
    const gradient = ramp({
      kind: 'path',
      path: 'shape',
      fillToRect: { left: 0.2, top: 0.3, right: 0.4, bottom: 0.2 },
    });
    gradient.stops.forEach((stop) => {
      stop.opacity = 0.5;
    });
    const view = render(
        <svg>
          <defs>
            <GradientDefinition
              id="complex-ellipse"
              gradient={gradient}
              width={200}
              height={100}
              shape="ellipse"
            />
          </defs>
        </svg>,
      ),
      bands = view.container.querySelector('[data-gradient-approximation="contour-bands"]')!;
    expect(bands.querySelectorAll('path')).toHaveLength(130);
    expect(bands.getAttribute('shape-rendering')).toBe('crispEdges');
    const ring = bands.querySelectorAll('path')[1];
    expect(ring.getAttribute('fill-rule')).toBe('evenodd');
    expect(ring.getAttribute('fill-opacity')).toBe('0.5');
    expect(ring.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    expect(view.container.querySelectorAll('path').length).toBeLessThanOrEqual(130);
  });

  it('uses the world-axis rotated bounds for a fixed gradient while retaining the object rotation', () => {
    const view = definition(ramp({ rotateWithShape: false }), 30),
      pattern = view.container.querySelector('pattern')!;
    expect(pattern.getAttribute('patternTransform')).toBe('rotate(-30 100 50)');
    expect(Number(pattern.getAttribute('width'))).toBeCloseTo(446.410161514, 6);
    expect(Number(pattern.getAttribute('height'))).toBeCloseTo(373.205080757, 6);
  });

  it('uses a bounded solid endpoint fallback for a degenerate tile without mutating it', () => {
    const gradient = ramp({ tileRect: { left: 1, right: 1 } }),
      original = structuredClone(gradient);
    const view = definition(gradient);
    expect(view.container.querySelector('pattern')).toBeNull();
    expect(view.container.querySelector('linearGradient > stop')?.getAttribute('stop-color')).toBe(
      '#FFFFFF',
    );
    expect(gradient).toEqual(original);
  });
});

describe('gradient scene integration', () => {
  it('keeps independent text fill/outline alpha and unique paint identifiers across multiple views', () => {
    const element = createElement('text', createDeck().theme);
    element.decoration = {
      shape: 'rect',
      fill: { color: '#ff0000', opacity: 0.4, gradient: ramp() },
      line: { color: '#000000', opacity: 0.3, width: 2, dash: 'solid', gradient: ramp() },
    };
    const view = render(
      <>
        <ElementContent element={element} />
        <ElementContent element={element} />
      </>,
    );
    const targets = view.container.querySelectorAll('.text-decoration > rect');
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.getAttribute('fill-opacity')).toBe('0.4');
      expect(target.getAttribute('stroke-opacity')).toBe('0.3');
      expect(target.getAttribute('fill')).toMatch(/^url\(#text-paint-/);
      expect(target.getAttribute('stroke')).toMatch(/^url\(#text-paint-/);
    }
    const ids = Array.from(view.container.querySelectorAll('[id]')).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders shape gradient and companion solid alpha independently of whole opacity', () => {
    const element = {
      ...createElement('shape', createDeck().theme),
      fillGradient: ramp(),
      fillOpacity: 0.4,
      stroke: '#123456',
      strokeOpacity: 0.2,
      opacity: 0.5,
    };
    const view = render(<ElementContent element={element} />),
      target = view.container.querySelector('svg')!.lastElementChild!;
    expect(target.getAttribute('fill')).toMatch(/^url\(#shape-paint-/);
    expect(target.getAttribute('fill-opacity')).toBe('0.4');
    expect(target.getAttribute('stroke')).toBe('#123456');
    expect(target.getAttribute('stroke-opacity')).toBe('0.2');
    expect(element.opacity).toBe(0.5);
  });

  it('places translucent gradient backgrounds on white and below grid/objects in both scene views', () => {
    const deck = createDeck(),
      slide = deck.slides[0];
    slide.background = '#ff0000';
    slide.backgroundGradient = ramp();
    slide.backgroundOpacity = 0.5;
    const view = render(
      <>
        <SlideView deck={deck} slide={slide} />
        <Canvas
          deck={deck}
          slide={slide}
          zoom={1}
          grid
          selected={[]}
          onSelect={vi.fn()}
          onChange={vi.fn()}
        />
      </>,
    );
    const playback = view.container.querySelector<HTMLElement>('.slide-view')!,
      canvas = view.container.querySelector<HTMLElement>('.editing-slide')!;
    expect(playback.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(canvas.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(playback.firstElementChild?.classList.contains('slide-background')).toBe(true);
    expect(
      Array.from(canvas.children)
        .slice(0, 2)
        .map((node) => node.getAttribute('class')),
    ).toEqual(['slide-background', 'canvas-grid']);
    for (const target of view.container.querySelectorAll('.slide-background > rect'))
      expect(target.getAttribute('fill-opacity')).toBe('0.5');
  });
});
