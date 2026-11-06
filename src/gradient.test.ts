import { describe, expect, it, vi } from 'vitest';
import { cloneElement, createDeck, createElement, validateDeck } from './model';
import {
  gradientColorAt,
  gradientCircleGeometry,
  gradientDisplayStops,
  gradientLinearGeometry,
  gradientRenderingWarnings,
  relativeGradientBounds,
  resolveGradientRect,
  slideBackgroundColor,
  validateGradientFill,
} from './gradient';
import { prepareTextLayout } from './textFit';
import type { GradientFill, TextElement } from './types';

const ramp = (): GradientFill => ({
  kind: 'linear',
  stops: [
    { position: 0, color: '#000000', opacity: 1 },
    { position: 1, color: '#FFFFFF', opacity: 1 },
  ],
});

describe('native gradient metadata', () => {
  it('retains optional defaults, outsets, duplicate stops and source order while stripping unknown fields', () => {
    const source = {
      ...ramp(),
      angle: 359.99999,
      scaled: false,
      rotateWithShape: false,
      path: 'circle',
      flip: 'none',
      fillToRect: { left: -0.5, bottom: 1.5, unknown: 7 },
      tileRect: {},
      unknown: 'not copied',
      stops: [
        { position: 1, color: '#aAbBcC', opacity: 0 },
        { position: 0.4, color: '#123456', opacity: 0.5 },
        { position: 0.4, color: '#abcdef', opacity: 1 },
      ],
    };
    const validated = validateGradientFill(source);
    expect(validated).toEqual({
      ...source,
      fillToRect: { left: -0.5, bottom: 1.5 },
      unknown: undefined,
    });
    expect(validated).not.toHaveProperty('unknown');
    expect(validated.stops).not.toBe(source.stops);
    expect(validateGradientFill(ramp())).not.toHaveProperty('scaled');
    expect(validateGradientFill({ kind: 'path', stops: [] })).toEqual({ kind: 'path', stops: [] });
    expect(validateGradientFill({ ...ramp(), stops: [ramp().stops[0]] }).stops).toHaveLength(1);
    expect(
      validateGradientFill({ ...ramp(), tileRect: { left: -21474.83648, right: 21474.83647 } })
        .tileRect,
    ).toEqual({ left: -21474.83648, right: 21474.83647 });
  });

  it.each([
    null,
    [],
    {},
    { kind: 'other', stops: [] },
    { kind: 'linear' },
    { kind: 'linear', stops: new Array(257).fill(ramp().stops[0]) },
  ])('rejects malformed gradient %j', (value) => {
    expect(() => validateGradientFill(value)).toThrow('gradient');
  });

  it('rejects nonfinite, unsafe and out-of-range values without coercion', () => {
    for (const position of [-0.01, 1.01, NaN, Infinity, '0.5', null])
      expect(() =>
        validateGradientFill({ ...ramp(), stops: [{ ...ramp().stops[0], position }] }),
      ).toThrow('position');
    for (const opacity of [-1, 2, NaN, '1', null])
      expect(() =>
        validateGradientFill({ ...ramp(), stops: [{ ...ramp().stops[0], opacity }] }),
      ).toThrow('opacity');
    for (const color of ['red', '#fff', 'url(https://example.com)', '#ffffff00'])
      expect(() =>
        validateGradientFill({ ...ramp(), stops: [{ ...ramp().stops[0], color }] }),
      ).toThrow('color');
    for (const angle of [-1, 360, NaN, Infinity, '45'])
      expect(() => validateGradientFill({ ...ramp(), angle })).toThrow('angle');
    for (const value of [
      null,
      [],
      { top: Infinity },
      { left: -21474.83649 },
      { right: 21474.83648 },
    ])
      expect(() => validateGradientFill({ ...ramp(), tileRect: value })).toThrow('gradient');
    for (const value of [
      { scaled: 1 },
      { rotateWithShape: 'false' },
      { path: 'ellipse' },
      { flip: 'horizontal' },
    ])
      expect(() => validateGradientFill({ ...ramp(), ...value })).toThrow('gradient');
  });

  it('round-trips every paint consumer and independent alpha without changing legacy documents', () => {
    const legacy = createDeck();
    expect(JSON.stringify(validateDeck(legacy))).toBe(JSON.stringify(legacy));
    const text = legacy.slides[0].elements[0] as TextElement;
    text.decoration = {
      shape: 'roundRect',
      fill: { color: '#123456', opacity: 0.4, gradient: ramp() },
      line: { color: '#000000', opacity: 0.3, width: 2, dash: 'solid', gradient: ramp() },
    };
    const shape = {
      ...createElement('shape', legacy.theme),
      fillGradient: ramp(),
      strokeGradient: ramp(),
      fillOpacity: 0.6,
      strokeOpacity: 0.2,
      opacity: 0.5,
    };
    legacy.slides[0].elements.push(shape);
    legacy.slides[0].backgroundGradient = ramp();
    legacy.slides[0].backgroundOpacity = 0.25;
    expect(validateDeck(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
    const clone = cloneElement(text);
    clone.decoration!.fill!.gradient!.stops[0].color = '#ff0000';
    expect(text.decoration.fill!.gradient!.stops[0].color).toBe('#000000');
    for (const key of ['fillOpacity', 'strokeOpacity'] as const) {
      const invalid = structuredClone(legacy);
      (invalid.slides[0].elements.at(-1) as typeof shape)[key] = 1.1;
      expect(() => validateDeck(invalid)).toThrow('opacity');
    }
    legacy.slides[0].backgroundOpacity = NaN;
    expect(() => validateDeck(legacy)).toThrow('background opacity');
  });

  it('does not refit text when only gradient paint metadata changes', () => {
    const before = createDeck(),
      text = before.slides[0].elements[0] as TextElement;
    text.autoFit = { mode: 'shrink', fontScale: 0.5, lineSpacingReduction: 0 };
    const next = structuredClone(before),
      edited = next.slides[0].elements[0] as TextElement;
    edited.decoration = {
      shape: 'rect',
      fill: { color: '#000000', opacity: 1, gradient: ramp() },
      line: null,
    };
    const fit = vi.fn((element: TextElement) => element);
    expect(prepareTextLayout(before, next, fit)).toBe(next);
    expect(fit).not.toHaveBeenCalled();
  });
});

describe('gradient color sampling and geometry', () => {
  it('uses documented per-channel gamma only for endpoint-two-stop and symmetric-three-stop ramps', () => {
    expect(gradientColorAt(ramp(), 0.5)).toEqual({ color: '#b9b9b9', opacity: 1 });
    const reverse = {
      ...ramp(),
      stops: [...ramp().stops].reverse().map((stop) => ({ ...stop, position: 1 - stop.position })),
    };
    expect(gradientColorAt(reverse, 0.5).color).toBe('#b9b9b9');
    const ordinary = ramp();
    ordinary.stops[1].position = 0.99;
    expect(gradientColorAt(ordinary, 0.495).color).toBe('#808080');
    const symmetric = {
      ...ramp(),
      stops: [
        ramp().stops[0],
        { ...ramp().stops[1], position: 0.25 },
        { ...ramp().stops[0], position: 1 },
      ],
    };
    expect(gradientColorAt(symmetric, 0.125).color).toBe('#b9b9b9');
    expect(gradientColorAt(symmetric, 0.625).color).toBe('#b9b9b9');
  });

  it('retains alpha separately, empty/single native inputs, and stable hard edges', () => {
    const gradient = ramp();
    gradient.stops[0].opacity = 0;
    expect(gradientColorAt(gradient, 0.5).opacity).toBe(0.5);
    expect(gradientColorAt({ ...gradient, stops: [] }, 0.5)).toEqual({
      color: '#000000',
      opacity: 1,
    });
    expect(
      gradientColorAt(
        { ...gradient, stops: [{ position: 0.3, color: '#abcdef', opacity: 0.25 }] },
        1,
      ),
    ).toEqual({ color: '#abcdef', opacity: 0.25 });
    const hard: GradientFill = {
      kind: 'linear',
      stops: [
        { position: 1, color: '#ffffff', opacity: 1 },
        { position: 0.4, color: '#000000', opacity: 1 },
        { position: 0.4, color: '#ffffff', opacity: 0.5 },
        { position: 0, color: '#000000', opacity: 1 },
      ],
    };
    const original = structuredClone(hard);
    expect(gradientColorAt(hard, 0.39999).color).toBe('#000000');
    expect(gradientColorAt(hard, 0.4)).toEqual({ color: '#ffffff', opacity: 0.5 });
    expect(
      gradientDisplayStops(hard)
        .filter((stop) => stop.position === 0.4)
        .map((stop) => stop.color),
    ).toEqual(['#000000', '#ffffff']);
    expect(gradientDisplayStops(hard).length).toBeLessThanOrEqual(320);
    expect(hard).toEqual(original);
  });

  it('uses the corrected native scaled normal on a non-square region', () => {
    const scaled = gradientLinearGeometry(200, 100, { angle: 45, scaled: true });
    expect(scaled.x1).toBeCloseTo(60, 8);
    expect(scaled.y1).toBeCloseTo(-30, 8);
    expect(scaled.x2).toBeCloseTo(140, 8);
    expect(scaled.y2).toBeCloseTo(130, 8);
    const physical = gradientLinearGeometry(200, 100, { angle: 45 });
    expect(physical.x1).toBeCloseTo(25, 8);
    expect(physical.y1).toBeCloseTo(-25, 8);
    expect(physical.x2).toBeCloseTo(175, 8);
    expect(physical.y2).toBeCloseTo(125, 8);
    expect(gradientLinearGeometry(200, 100, {})).toEqual({ x1: 0, y1: 50, x2: 200, y2: 50 });
  });

  it('keeps signed tile/focus offsets distinct from effective defaults and preserves degenerate metadata', () => {
    expect(resolveGradientRect(undefined, 0.5)).toEqual({
      left: 0.5,
      top: 0.5,
      right: 0.5,
      bottom: 0.5,
    });
    expect(resolveGradientRect({}, 0.5)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(resolveGradientRect({ left: 0.25 }, 0.5)).toEqual({
      left: 0.25,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(
      relativeGradientBounds(
        { left: 10, top: 20, width: 200, height: 100 },
        { left: -0.25, right: 0.5, top: 0.2, bottom: 0.3 },
        0,
      ),
    ).toEqual({ left: -40, top: 40, width: 150, height: 50 });
    const gradient = { ...ramp(), tileRect: { left: 1, right: 1 } };
    expect(validateGradientFill(gradient)).toEqual(gradient);
    expect(gradientRenderingWarnings(gradient).join(' ')).toContain('Empty or inverted');
  });

  it('matches native circular focus from the shape anchor, with no solid inner area', () => {
    const measured = gradientCircleGeometry(270, 105, {
      fillToRect: { left: 0.15, top: 0.25, right: 0.55, bottom: 0.5 },
    });
    expect(measured.cx).toBe(135);
    expect(measured.cy).toBe(52.5);
    expect(measured.r).toBeCloseTo(Math.hypot(270, 105) / 2, 10);
    expect(measured.fx).toBeCloseTo(57.8571428571, 8);
    expect(measured.fy).toBe(35);
    expect(gradientCircleGeometry(270, 105, {})).toMatchObject({ fx: 135, fy: 52.5 });
    expect(gradientCircleGeometry(270, 105, { fillToRect: {} })).toMatchObject({ fx: 0, fy: 0 });
    expect(
      gradientCircleGeometry(270, 105, {
        fillToRect: { left: 0.25, top: 0.25, right: 0.25, bottom: 0.25 },
      }),
    ).toMatchObject({ fx: 135, fy: 52.5 });
  });

  it('composites active gradient backgrounds over white rather than the legacy fallback color', () => {
    const gradient = {
      ...ramp(),
      stops: [
        { position: 0, color: '#000000', opacity: 0.5 },
        { position: 1, color: '#000000', opacity: 0.5 },
      ],
    };
    expect(
      slideBackgroundColor({
        background: '#ff0000',
        backgroundGradient: gradient,
        backgroundOpacity: 0.5,
      }),
    ).toBe('#bfbfbf');
    expect(slideBackgroundColor({ background: '#000000', backgroundOpacity: 0.5 })).toBe('#808080');
    expect(slideBackgroundColor({ background: '#123456' })).toBe('#123456');
  });
});
