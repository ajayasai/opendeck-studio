import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneElement, createDeck, createElement, validateDeck } from './model';
import {
  elementBounds,
  findGroupPath,
  flattenElements,
  getElementsAtPath,
  getGroupPath,
  groupMatrix,
  groupSelection,
  groupTextScale,
  groupRenderingWarnings,
  groupRotationSwapsAxes,
  groupLayoutContext,
  projectGroupFrame,
  restoreGroupFrame,
  invertMatrix,
  mapElements,
  layoutGroupChildren,
  multiplyMatrices,
  transformPoint,
  ungroupSelection,
  updateElementsAtPath,
} from './groups';
import { fitTextInGroups, prepareTextLayout } from './textFit';
import { fitTextElement } from './textFitting';
import { materializeImageOrientation } from './imageOrientation';
import { SlideView } from './SlideView';
import type { GroupElement, SlideElement, TextElement } from './types';
afterEach(cleanup);
const theme = createDeck().theme;
const group = (children: SlideElement[] = []): GroupElement => ({
  ...createElement('group', theme),
  x: 100,
  y: 200,
  width: 300,
  height: 100,
  childFrame: { x: 10, y: 20, width: 150, height: 100 },
  children,
});

describe('group native model and tree operations', () => {
  it('retains nested local coordinates, zero extents and optional defaults while reconstructing known fields', () => {
    const deck = createDeck(),
      child = createElement('image', theme),
      inner = group([child]),
      outer = group([inner]);
    outer.childFrame.width = 0;
    outer.flipH = true;
    inner.flipV = false;
    deck.slides[0].elements = [outer];
    expect(validateDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    const source = JSON.parse(JSON.stringify(deck));
    source.slides[0].elements[0].childFrame.untrusted = 9;
    source.slides[0].elements[0].children[0].unknown = 9;
    expect(validateDeck(source)).toEqual(deck);
    const legacy = createDeck();
    expect(validateDeck(legacy)).toEqual(legacy);
  });

  it('enforces depth, global identity and recursive per-slide counts including containers', () => {
    const deck = createDeck();
    let nested: SlideElement = createElement('shape', theme);
    for (let depth = 0; depth < 16; depth++) nested = group([nested]);
    deck.slides[0].elements = [nested];
    expect(() => validateDeck(deck)).not.toThrow();
    deck.slides[0].elements = [group([nested])];
    expect(() => validateDeck(deck)).toThrow('16 levels');
    const same = createElement('shape', theme);
    deck.slides[0].elements = [same, group([same])];
    expect(() => validateDeck(deck)).toThrow();
    deck.slides[0].elements = [
      group(Array.from({ length: 2000 }, () => createElement('shape', theme))),
    ];
    expect(() => validateDeck(deck)).toThrow('2,000');
    for (const frame of [
      { x: 0, y: 0, width: -1, height: 1 },
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: Infinity, height: 1 },
    ]) {
      deck.slides[0].elements = [{ ...group(), childFrame: frame }];
      expect(() => validateDeck(deck)).toThrow('group child');
    }
  });

  it('clones all descendant identities without offsetting their local coordinates or renaming them', () => {
    const leaf = createElement('text', theme),
      source = group([group([leaf])]);
    const copy = cloneElement(source);
    const before = flattenElements([source]),
      after = flattenElements([copy]);
    expect(after.map((e) => e.id).some((id) => before.some((e) => e.id === id))).toBe(false);
    expect(copy.x).toBe(source.x + 20);
    expect(copy.children[0].x).toBe(source.children[0].x);
    expect(after[2].name).toBe(leaf.name);
    (after[2] as TextElement).text = 'Changed';
    expect(leaf.text).not.toBe('Changed');
  });

  it('updates only valid unlocked paths and preserves unaffected branches', () => {
    const leaf = createElement('shape', theme),
      inner = group([leaf]),
      outer = group([inner]),
      sibling = createElement('text', theme);
    const elements = [outer, sibling],
      path = [outer.id, inner.id];
    expect(findGroupPath(elements, inner.id)).toEqual(path);
    expect(getGroupPath(elements, [...path, 'missing'])).toEqual([outer, inner]);
    expect(getElementsAtPath(elements, path)).toBe(inner.children);
    expect(getElementsAtPath(elements, ['missing'])).toBeUndefined();
    const next = updateElementsAtPath(elements, path, (items) => [
      ...items,
      createElement('shape', theme),
    ]);
    expect(next[1]).toBe(sibling);
    expect((next[0] as GroupElement).children[0]).not.toBe(inner);
    expect(updateElementsAtPath(elements, ['missing'], () => [])).toBe(elements);
    outer.locked = true;
    expect(updateElementsAtPath(elements, path, () => [])).toBe(elements);
    expect(mapElements(elements, (e) => e)).toBe(elements);
    const mapped = mapElements(elements, (e) => (e.id === leaf.id ? { ...e, name: 'New' } : e));
    expect(mapped[1]).toBe(sibling);
    expect(flattenElements(mapped).find((e) => e.id === leaf.id)?.name).toBe('New');
  });
});

describe('group geometry and safe grouping commands', () => {
  it('matches native quarter-turn thresholds and preserves the normally scaled center', () => {
    const child = { ...createElement('shape', theme), x: 400, y: 80, width: 60, height: 20 };
    const parent = {
      ...group(),
      x: 50,
      y: 100,
      width: 600,
      height: 125,
      childFrame: { x: 0, y: 0, width: 400, height: 200 },
    };
    for (const [rotation, swap] of [
      [44.999, false],
      [45, true],
      [134.999, true],
      [135, false],
      [224.999, false],
      [225, true],
      [314.999, true],
      [315, false],
      [-70, true],
      [-300, true],
      [-45, false],
      [405, true],
    ] as const) {
      expect(groupRotationSwapsAxes(rotation)).toBe(swap);
      const projected = layoutGroupChildren({ ...parent, children: [{ ...child, rotation }] })[0];
      expect(projected.width).toBe(swap ? 37.5 : 90);
      expect(projected.height).toBe(swap ? 30 : 12.5);
      expect(projected.x + projected.width / 2).toBe(645);
      expect(projected.y + projected.height / 2).toBe(56.25);
      if (rotation === 45) expect(projected.x + parent.x).toBe(676.25);
    }
  });

  it('selects axes at each local nested rotation independently of outer world rotation', () => {
    const children = [0, 30, 60].map((rotation) => ({
      ...createElement('shape', theme),
      x: 20,
      y: 30,
      width: 60,
      height: 20,
      rotation,
    }));
    const inner = {
      ...group(children),
      x: 10,
      y: 10,
      width: 180,
      height: 160,
      rotation: 60,
      childFrame: { x: 0, y: 0, width: 180, height: 160 },
    };
    for (const rotation of [0, 100]) {
      const parent = {
        ...group([inner]),
        rotation,
        width: 600,
        height: 125,
        childFrame: { x: 0, y: 0, width: 400, height: 200 },
      };
      const projected = layoutGroupChildren(parent)[0] as GroupElement;
      expect(projected).toMatchObject({ width: 112.5, height: 240, rotation: 60 });
      expect(layoutGroupChildren(projected).map((e) => [e.width, e.height])).toEqual([
        [37.5, 30],
        [37.5, 30],
        [90, 12.5],
      ]);
      expect(groupLayoutContext([parent, inner], 60)).toEqual({
        position: { x: 0.625, y: 1.5 },
        size: { x: 1.5, y: 0.625 },
      });
    }
  });

  it('projects and restores picture frames using the resulting rotation after EXIF materialization', () => {
    const picture = {
      ...createElement('image', theme),
      x: 40,
      y: 30,
      width: 100,
      height: 200,
      rotation: 20,
    };
    const parent = {
      ...group(),
      width: 480,
      height: 180,
      childFrame: { x: 0, y: 0, width: 400, height: 200 },
    };
    const projected = projectGroupFrame(picture, [parent]);
    expect(projected).toMatchObject({ width: 120, height: 180 });
    const encoded = materializeImageOrientation(projected, 6);
    expect(encoded).toMatchObject({ width: 180, height: 120, rotation: 110 });
    const restored = restoreGroupFrame(encoded, [parent]);
    const displayed = projectGroupFrame(restored, [parent]);
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(displayed[key]).toBeCloseTo(encoded[key], 8);
    expect(restored).toMatchObject({ width: 200, height: 100, rotation: 110 });
    expect(picture).not.toHaveProperty('orientation');
  });
  it('matches native nonuniform frame relayout without shearing rotated shapes or scaling fonts and strokes', () => {
    const shape = {
      ...createElement('shape', theme),
      x: 20,
      y: 40,
      width: 65,
      height: 35,
      rotation: 30,
      strokeWidth: 4,
    };
    const text = { ...createElement('text', theme), fontSize: 20, width: 210, height: 40 };
    const parent = {
      ...group([shape, text]),
      width: 600,
      height: 125,
      childFrame: { x: 0, y: 0, width: 400, height: 200 },
    };
    const laidOut = layoutGroupChildren(parent);
    expect(laidOut[0]).toMatchObject({
      x: 30,
      y: 25,
      width: 97.5,
      height: 21.875,
      rotation: 30,
      strokeWidth: 4,
    });
    expect(laidOut[1]).toMatchObject({ width: 315, height: 25, fontSize: 20 });
    const zero = { ...group(), childFrame: { x: 0, y: 0, width: 0, height: 100 } };
    expect(groupTextScale([parent, zero])).toEqual({ x: 1, y: 0.625 });
  });
  it('maps nonuniform child coordinates, local flips, rotation and zero scale axes', () => {
    const source = group();
    expect(transformPoint(groupMatrix(source), { x: 10, y: 20 })).toEqual({ x: 100, y: 200 });
    expect(transformPoint(groupMatrix(source), { x: 160, y: 120 })).toEqual({ x: 400, y: 300 });
    source.flipH = true;
    source.rotation = 90;
    const corner = transformPoint(groupMatrix(source), { x: 10, y: 20 });
    expect(corner.x).toBeCloseTo(300);
    expect(corner.y).toBeCloseTo(400);
    const matrix = groupMatrix(source),
      inverse = invertMatrix(matrix)!;
    const point = { x: 37, y: -29 };
    const result = transformPoint(multiplyMatrices(inverse, matrix), point);
    expect(result.x).toBeCloseTo(point.x);
    expect(result.y).toBeCloseTo(point.y);
    source.flipH = false;
    source.rotation = 0;
    source.childFrame.width = 0;
    expect(transformPoint(groupMatrix(source), { x: 20, y: 30 })).toEqual({ x: 110, y: 210 });
    expect(invertMatrix({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toBeUndefined();
  });

  it('bounds extreme derived nested display geometry without rewriting native coordinates', () => {
    const inner = {
      ...group([createElement('shape', theme)]),
      width: 100000,
      childFrame: { x: 0, y: 0, width: 0.01, height: 100 },
    };
    const parent = {
      ...group([inner]),
      width: 100000,
      childFrame: { x: 0, y: 0, width: 0.01, height: 100 },
    };
    const original = structuredClone(parent);
    expect(layoutGroupChildren(parent)).toEqual([]);
    expect(groupRenderingWarnings([parent])[0]).toContain('not drawn');
    expect(parent).toEqual(original);
  });

  it('groups rotated bounds without changing child coordinates or sibling order, and reverses a safe group', () => {
    const a = {
        ...createElement('shape', theme),
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        rotation: 90,
      },
      between = createElement('text', theme),
      b = { ...createElement('image', theme), x: 160, y: 30, width: 50, height: 60 };
    expect(elementBounds(a)).toEqual({ left: 40, top: -10, right: 80, bottom: 90 });
    const source = [a, between, b],
      made = groupSelection(source, [a.id, b.id]);
    expect(made.reason).toBeUndefined();
    expect(made.elements[0]).toBe(between);
    const grouped = made.elements[1] as GroupElement;
    expect(grouped.children).toEqual([a, b]);
    expect(grouped.children[0]).toBe(a);
    expect(grouped.childFrame).toEqual({ x: 40, y: -10, width: 170, height: 100 });
    expect(transformPoint(groupMatrix(grouped), { x: a.x, y: a.y })).toEqual({ x: a.x, y: a.y });
    const undone = ungroupSelection(made.elements, made.selected);
    expect(undone.reason).toBeUndefined();
    expect(undone.elements).toEqual([between, a, b]);
    expect(undone.selected).toEqual([a.id, b.id]);
  });

  it('composes safe rotation and refuses unrepresentable or behavior-changing ungrouping atomically', () => {
    const leaf = {
      ...createElement('shape', theme),
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      rotation: 15,
    };
    const parent = {
      ...group([leaf]),
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      childFrame: { x: 0, y: 0, width: 100, height: 100 },
      rotation: 90,
    };
    const result = ungroupSelection([parent], [parent.id]);
    expect(result.elements[0]).toMatchObject({
      x: 185,
      y: 105,
      width: 20,
      height: 10,
      rotation: 105,
    });
    for (const patch of [
      { width: 200 },
      { flipH: true },
      { opacity: 0.5 },
      { animation: 'fade' as const },
      { locked: true },
    ]) {
      const unsafe = { ...parent, ...patch },
        source = [unsafe];
      const rejected = ungroupSelection(source, [unsafe.id]);
      expect(rejected.elements).toBe(source);
      expect(rejected.reason).toBeTruthy();
    }
    expect(groupSelection([leaf], [leaf.id]).reason).toBeTruthy();
    const scaled = { ...parent, width: 200, rotation: 0 },
      cancelled = { ...parent, width: 50, rotation: 0 };
    expect(groupTextScale([scaled, cancelled])).toEqual({ x: 1, y: 1 });
    const source = [parent];
    expect(ungroupSelection(source, [parent.id], [scaled, cancelled])).toMatchObject({
      elements: source,
      reason: expect.stringContaining('scaled'),
    });
    expect(
      ungroupSelection(source, [parent.id], [{ ...parent, rotation: 45 }]).reason,
    ).toBeUndefined();
    expect(
      ungroupSelection([{ ...parent, childFrame: { ...parent.childFrame, width: 0 } }], [parent.id])
        .reason,
    ).toContain('zero');
  });
});

describe('nested rendering and layout preparation', () => {
  it('matches native reflected nested text angles without mirroring glyphs twice', () => {
    const text = createElement('text', theme);
    const unit = (children: SlideElement[], rotation: number, flipV = false): GroupElement => ({
      ...group(children),
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      childFrame: { x: 0, y: 0, width: 300, height: 100 },
      rotation,
      flipV,
    });
    const innermost = unit([text], 20),
      inner = unit([innermost], 20, true),
      outer = unit([inner], -10, true);
    const deck = createDeck();
    deck.slides[0].elements = [outer];
    const view = render(<SlideView deck={deck} slide={deck.slides[0]} />);
    expect(view.container.querySelector('.group-text-orientation')).toBeNull();
    const linear = multiplyMatrices(
      multiplyMatrices(groupMatrix(outer), groupMatrix(inner)),
      groupMatrix(innermost),
    );
    const angle = ((Math.atan2(linear.b, linear.a) * 180) / Math.PI + 360) % 360;
    expect(angle).toBeCloseTo(350, 8);
    expect(view.container.querySelectorAll('.group-child-coordinates')).toHaveLength(3);
  });
  it('renders recursive child transforms with inherited alpha and unclipped local overflow', () => {
    const text = createElement('text', theme),
      inner = group([text]),
      outer = { ...group([inner]), flipH: true, opacity: 0.5, rotation: 30 };
    const deck = createDeck();
    deck.slides[0].elements = [outer];
    const view = render(<SlideView deck={deck} slide={deck.slides[0]} />);
    const frames = view.container.querySelectorAll<HTMLElement>('.group-child-coordinates');
    expect(frames).toHaveLength(2);
    expect(frames[0].style.transform).toBe('scale(-1,1)');
    expect(frames[0].style.overflow).toBe('visible');
    expect(frames[0].parentElement!.style.transform).toBe('rotate(30deg)');
    expect(frames[0].parentElement!.style.opacity).toBe('0.5');
    expect(view.container.querySelector(`[data-group-child="${text.id}"]`)).toBeTruthy();
    expect(
      view.container.querySelector<HTMLElement>(`[data-group-child="${inner.id}"]`)!.style.width,
    ).toBe('600px');
    expect(
      view.container.querySelector<HTMLElement>(`[data-group-child="${text.id}"]`)!.style.width,
    ).toBe(`${text.width * 4}px`);
    expect(
      view.container.querySelector<HTMLElement>('.group-text-orientation')!.style.transform,
    ).toBe('scaleX(-1)');
  });

  it('fits edited nested text once, but preserves saved fitting during group transforms and recursive clones', () => {
    const text = {
      ...createElement('text', theme),
      autoFit: { mode: 'shrink' as const, fontScale: 0.5, lineSpacingReduction: 0 },
    };
    const before = createDeck(),
      parent = group([group([text])]);
    before.slides[0].elements = [parent];
    const fit = vi.fn((e: TextElement) => ({
      ...e,
      autoFit: { mode: 'shrink' as const, fontScale: 0.8, lineSpacingReduction: 0 },
    }));
    const transformed = {
      ...before,
      slides: [{ ...before.slides[0], elements: [{ ...parent, rotation: 90, flipH: true }] }],
    };
    expect(prepareTextLayout(before, transformed, fit)).toBe(transformed);
    expect(fit).not.toHaveBeenCalled();
    const next = {
      ...before,
      slides: [
        {
          ...before.slides[0],
          elements: mapElements([parent], (e) =>
            e.id === text.id ? { ...text, text: 'Edited content' } : e,
          ),
        },
      ],
    };
    const accepted = prepareTextLayout(before, next, fit);
    expect(fit).toHaveBeenCalledOnce();
    expect(
      (flattenElements(accepted.slides[0].elements).find((e) => e.id === text.id) as TextElement)
        .autoFit,
    ).toMatchObject({ fontScale: 0.8 });
    fit.mockClear();
    const copy = { ...before, slides: [{ ...before.slides[0], elements: [cloneElement(parent)] }] };
    expect(prepareTextLayout(before, copy, fit)).toBe(copy);
    expect(fit).not.toHaveBeenCalled();
    const resized = {
      ...before,
      slides: [{ ...before.slides[0], elements: [{ ...parent, width: 600 }] }],
    };
    prepareTextLayout(before, resized, fit);
    expect(fit).toHaveBeenCalledOnce();
    expect(fit.mock.calls[0][0].width).toBe(text.width * 8);
    expect(fit.mock.calls[0][0].fontSize).toBe(text.fontSize);
  });

  it('converts displayed resize results back to child coordinates and bounds unsupported fits', () => {
    const text = createElement('text', theme),
      parent = group();
    const fitted = fitTextInGroups(text, [parent], (rendered) => ({
      ...rendered,
      width: rendered.width + 100,
      height: rendered.height + 30,
      x: rendered.x - 50,
      y: rendered.y - 15,
    }));
    expect(fitted.width).toBe(text.width + 50);
    expect(fitted.height).toBe(text.height + 30);
    expect(fitted.x).toBe(text.x - 25);
    expect(fitted.y).toBe(text.y - 15);
    const callback = vi.fn((e: TextElement) => e);
    expect(
      fitTextInGroups(
        text,
        [{ ...parent, width: 100000, childFrame: { ...parent.childFrame, width: 0.01 } }],
        callback,
      ),
    ).toBe(text);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not relocate large but valid child coordinates while fitting a scaled group', () => {
    const text = {
      ...createElement('text', theme),
      x: 90000,
      y: 20,
      width: 200,
      height: 100,
      autoFit: { mode: 'resize' as const },
      verticalAlign: 'top' as const,
    };
    const parent = { ...group(), childFrame: { x: 90000, y: 0, width: 150, height: 100 } };
    const fitted = fitTextInGroups(text, [parent], (element) =>
      fitTextElement(element, () => ({ width: 400, height: 60 })),
    );
    expect(fitted).toMatchObject({ x: 90000, y: 20, width: 200, height: 60 });
    expect(text.height).toBe(100);
  });

  it('fits against swapped displayed dimensions and inverts center and size axes separately', () => {
    const text = {
      ...createElement('text', theme),
      x: 30,
      y: 40,
      width: 60,
      height: 20,
      rotation: 60,
    };
    const parent = {
      ...group(),
      width: 600,
      height: 125,
      childFrame: { x: 0, y: 0, width: 400, height: 200 },
    };
    const fit = vi.fn((rendered: TextElement) => ({
      ...rendered,
      x: rendered.x - 10,
      y: rendered.y - 6,
      width: rendered.width + 20,
      height: rendered.height + 12,
    }));
    const fitted = fitTextInGroups(text, [parent], fit);
    expect(fit.mock.calls[0][0]).toMatchObject({
      width: 37.5,
      height: 30,
      rotation: 60,
      fontSize: text.fontSize,
    });
    expect(fitted).toMatchObject({ width: 92, height: 28, x: 14, y: 36 });
    expect(fitted.x + fitted.width / 2).toBe(text.x + text.width / 2);
    expect(fitted.y + fitted.height / 2).toBe(text.y + text.height / 2);
  });
});
