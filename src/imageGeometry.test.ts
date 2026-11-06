import { describe, expect, it } from 'vitest';
import { cloneElement, createDeck, createElement, validateDeck } from './model';
import {
  fitToRects,
  imageFitGeometry,
  imageGeometry,
  imageRectsFromBounds,
  resolveImageRect,
  validateImageRect,
} from './imageGeometry';
import type { ImageElement } from './types';

const picture = (): ImageElement => ({
  ...createElement('image', createDeck().theme),
  width: 400,
  height: 200,
  fit: 'stretch',
});

describe('native picture rectangle validation', () => {
  it('retains signed ratios, explicit zero/empty fields and source spelling without adding legacy fields', () => {
    expect(
      validateImageRect({ left: -21474.83648, right: 21474.83647, top: 0, unknown: 9 }),
    ).toEqual({ left: -21474.83648, right: 21474.83647, top: 0 });
    expect(validateImageRect({})).toEqual({});
    const source = createDeck();
    const image = createElement('image', source.theme);
    source.slides[0].elements = [image];
    expect(validateDeck(source)).toEqual(source);
    expect(validateDeck(source).slides[0].elements[0]).not.toHaveProperty('crop');
    expect(resolveImageRect()).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(resolveImageRect()).not.toBe(resolveImageRect());
  });

  it('rejects unsafe or nonfinite metadata without coercion', () => {
    for (const rect of [
      null,
      [],
      '',
      { top: '0' },
      { left: NaN },
      { right: Infinity },
      { bottom: -21474.83649 },
      { top: 21474.83648 },
    ])
      expect(() => validateImageRect(rect)).toThrow('Invalid image rectangle');
    const deck = createDeck();
    deck.slides[0].elements = [picture()];
    for (const key of ['flipH', 'flipV'] as const) {
      for (const value of [null, 0, 'false', {}]) {
        const source = structuredClone(deck) as unknown as {
          slides: { elements: Record<string, unknown>[] }[];
        };
        source.slides[0].elements[0][key] = value;
        expect(() => validateDeck(source)).toThrow('flip');
      }
    }
  });

  it('round-trips and deeply clones source/fill rectangles and flips independently', () => {
    const deck = createDeck(),
      image = picture();
    image.crop = { left: -0.2, top: 0.1, right: 0.3 };
    image.fillRect = {};
    image.flipH = true;
    image.flipV = false;
    image.rotation = 37;
    deck.slides[0].elements = [image];
    expect(validateDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    const copy = cloneElement(image);
    copy.crop!.left = 0.5;
    copy.fillRect!.bottom = 0.1;
    expect(image.crop.left).toBe(-0.2);
    expect(image.fillRect).toEqual({});
    expect(copy.flipH).toBe(true);
    expect(copy.rotation).toBe(37);
  });
});

describe('picture source to destination mapping', () => {
  it('maps an asymmetric source window onto an independent fill viewport without decoding', () => {
    const element = {
      ...picture(),
      fit: 'contain' as const,
      crop: { left: 0.25, right: 0.25, top: 0.1, bottom: 0.2 },
      fillRect: { left: 0.1, right: 0.2, top: 0.25, bottom: 0.25 },
    };
    const original = structuredClone(element),
      result = imageGeometry(element)!;
    expect(result.renderable).toBe(true);
    expect(result.viewport).toEqual({ x: 40, y: 50, width: 280, height: 100 });
    expect(result.image.x).toBe(-100);
    expect(result.image.width).toBe(560);
    expect(result.image.height).toBeCloseTo(142.8571428571, 8);
    expect(result.image.y).toBeCloseTo(35.7142857143, 8);
    // Both crop boundaries land on the target rectangle, independently of the bitmap ratio.
    expect(result.image.x + 0.25 * result.image.width).toBe(40);
    expect(result.image.x + 0.75 * result.image.width).toBe(320);
    expect(element).toEqual(original);
  });

  it('represents negative source outsets as transparent margins rather than clipping the source metadata', () => {
    const result = imageGeometry({
      ...picture(),
      width: 200,
      height: 100,
      crop: { left: -0.25, right: -0.25, top: -0.5, bottom: -0.5 },
    })!;
    expect(result.viewport).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(result.image.x).toBeCloseTo(100 / 3, 8);
    expect(result.image.width).toBeCloseTo(400 / 3, 8);
    expect(result.image.y).toBe(25);
    expect(result.image.height).toBe(50);
  });

  it('separates contain letterboxing, cover cropping and stretch, retaining the outer frame', () => {
    const contain = imageFitGeometry(200, 100, 100, 200, 'contain')!;
    expect(contain.image).toEqual({ x: 75, y: 0, width: 50, height: 100 });
    expect(fitToRects(200, 100, 100, 200, 'contain')).toEqual({
      fillRect: { left: 0.375, top: 0, right: 0.375, bottom: 0 },
    });
    const cover = imageFitGeometry(200, 100, 100, 200, 'cover')!;
    expect(cover.image).toEqual({ x: 0, y: -150, width: 200, height: 400 });
    expect(fitToRects(200, 100, 100, 200, 'cover')).toEqual({
      crop: { left: 0, top: 0.375, right: 0, bottom: 0.375 },
    });
    expect(imageFitGeometry(200, 100, 100, 200, 'stretch')!.image).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    for (const fit of ['contain', 'cover', 'stretch'] as const) {
      const explicit = fitToRects(200, 100, 100, 200, fit)!;
      expect(imageGeometry({ ...picture(), width: 200, height: 100, ...explicit })!.image).toEqual(
        imageFitGeometry(200, 100, 100, 200, fit)!.image,
      );
    }
  });

  it('requires intrinsic dimensions only for automatic fits and preserves explicit-empty override semantics', () => {
    expect(imageGeometry({ ...picture(), fit: 'cover' })).toBeNull();
    expect(
      imageGeometry({ ...picture(), fit: 'cover' }, { width: 100, height: 100 })!.image,
    ).toEqual({ x: 0, y: -100, width: 400, height: 400 });
    expect(imageGeometry({ ...picture(), fit: 'cover', crop: {} })!.image).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
    expect(imageFitGeometry(200, 100, 0, 100, 'contain')).toBeNull();
    expect(fitToRects(200, 100, 100, NaN, 'cover')).toBeNull();
  });

  it('inverts panned/zoomed bitmap bounds while retaining signed target offsets', () => {
    const fillRect = { left: -0.1, right: 0.2, top: 0.1, bottom: 0.25 };
    const bitmap = { x: -120, y: -50, width: 600, height: 320 };
    const rects = imageRectsFromBounds(400, 200, bitmap, fillRect)!;
    expect(rects.fillRect).toEqual(fillRect);
    expect(rects.fillRect).not.toBe(fillRect);
    const mapped = imageGeometry({ ...picture(), ...rects })!;
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(mapped.image[key]).toBeCloseTo(bitmap[key], 8);
  });

  it('retains degenerate/inverted metadata but produces bounded empty display geometry', () => {
    for (const patch of [
      { crop: { left: 0.5, right: 0.5 } },
      { crop: { top: 1.2 } },
      { fillRect: { bottom: 2 } },
      { crop: { left: 1 - Number.EPSILON } },
    ]) {
      const source = { ...picture(), ...patch },
        original = structuredClone(source);
      const result = imageGeometry(source)!;
      expect(result.renderable).toBe(false);
      expect(result.reason).toBeTruthy();
      expect(Object.values(result.image).every(Number.isFinite)).toBe(true);
      expect(source).toEqual(original);
      expect(() => validateImageRect(source.crop ?? source.fillRect)).not.toThrow();
    }
    expect(imageRectsFromBounds(400, 200, { x: 0, y: 0, width: 0, height: 20 })).toBeNull();
    expect(imageRectsFromBounds(400, 200, { x: Infinity, y: 0, width: 40, height: 20 })).toBeNull();
  });
});
