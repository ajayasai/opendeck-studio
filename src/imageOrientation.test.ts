import { describe, expect, it } from 'vitest';
import { createDeck, createElement, validateDeck } from './model';
import { imageGeometry } from './imageGeometry';
import { imageOrientedDimensions, materializeImageOrientation } from './imageOrientation';
import type { ImageElement } from './types';

const picture = (): ImageElement => ({
  ...createElement('image', createDeck().theme),
  x: 100,
  y: 80,
  width: 240,
  height: 150,
  rotation: 37,
  fit: 'stretch',
  crop: { left: 0.13, top: -0.1, right: 0.07, bottom: 0.21 },
  fillRect: { left: -0.08, top: 0.05, right: 0.15, bottom: 0.19 },
});
const orientedPoint = (orientation: number, u: number, v: number): [number, number] =>
  [
    [u, v],
    [1 - u, v],
    [1 - u, 1 - v],
    [u, 1 - v],
    [v, u],
    [1 - v, u],
    [1 - v, 1 - u],
    [v, 1 - u],
  ][orientation - 1] as [number, number];
function worldPoint(element: ImageElement, u: number, v: number) {
  const bitmap = imageGeometry(element)!.image;
  const x = (bitmap.x + u * bitmap.width - element.width / 2) * (element.flipH ? -1 : 1);
  const y = (bitmap.y + v * bitmap.height - element.height / 2) * (element.flipV ? -1 : 1);
  const angle = (element.rotation * Math.PI) / 180;
  return {
    x: element.x + element.width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    y: element.y + element.height / 2 + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

describe('legacy EXIF to encoded picture conversion', () => {
  it('preserves physical bitmap points for all EXIF orientations and existing local flips/rotation', () => {
    for (let orientation = 1; orientation <= 8; orientation++) {
      for (const flipH of [false, true])
        for (const flipV of [false, true]) {
          const source = { ...picture(), flipH, flipV },
            original = structuredClone(source);
          const encoded = materializeImageOrientation(source, orientation);
          for (const [u, v] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
            [0.31, 0.63],
          ]) {
            const [displayU, displayV] = orientedPoint(orientation, u, v);
            const before = worldPoint(source, displayU, displayV),
              after = worldPoint(encoded, u, v);
            expect(after.x).toBeCloseTo(before.x, 8);
            expect(after.y).toBeCloseTo(before.y, 8);
          }
          expect(encoded.orientation).toBe('encoded');
          expect(encoded.src).toBe(source.src);
          expect(source).toEqual(original);
        }
    }
  });

  it('keeps empty/partial rectangle presence and is idempotent after materialization', () => {
    const source = { ...picture(), crop: { left: 0.2 }, fillRect: {} };
    const encoded = materializeImageOrientation(source, 6);
    expect(encoded.crop).toEqual({ bottom: 0.2 });
    expect(encoded.fillRect).toEqual({});
    expect(encoded.width).toBe(150);
    expect(encoded.height).toBe(240);
    expect(encoded.x).toBe(145);
    expect(encoded.y).toBe(35);
    expect(encoded.rotation).toBe(127);
    expect(materializeImageOrientation(encoded, 6)).toBe(encoded);
    expect(
      materializeImageOrientation({ ...source, crop: undefined, fillRect: undefined }, 2).crop,
    ).toBeUndefined();
  });

  it('resolves intrinsic axes without changing legacy documents or encoded dimensions', () => {
    expect(imageOrientedDimensions({ width: 800, height: 400, orientation: 6 })).toEqual({
      width: 400,
      height: 800,
    });
    expect(imageOrientedDimensions({ width: 800, height: 400, orientation: 6 }, 'encoded')).toEqual(
      { width: 800, height: 400 },
    );
    expect(imageOrientedDimensions({ width: 800, height: 400, orientation: 2 })).toEqual({
      width: 800,
      height: 400,
    });
    expect(materializeImageOrientation(picture(), 99)).toMatchObject({
      rotation: 37,
      width: 240,
      height: 150,
      orientation: 'encoded',
    });
  });

  it('strictly validates the optional encoded-axis marker and preserves legacy absence', () => {
    const deck = createDeck();
    deck.slides[0].elements = [picture()];
    expect(validateDeck(deck).slides[0].elements[0]).not.toHaveProperty('orientation');
    deck.slides[0].elements[0] = materializeImageOrientation(picture(), 7);
    expect(validateDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    for (const orientation of ['auto', '', null, true, 6]) {
      const source = JSON.parse(JSON.stringify(deck));
      source.slides[0].elements[0].orientation = orientation;
      expect(() => validateDeck(source)).toThrow('image orientation');
    }
  });
});
