import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { importPptx } from './pptx';
import { groupLayoutContext, layoutGroupChildren } from './groups';
import type { GroupElement } from './types';

describe('independent PowerPoint rotation-band fixture', () => {
  it('matches native threshold dimensions and centers in the original COM-authored package', async () => {
    const bytes = await readFile('tests/fixtures/powerpoint-groups-rotation.pptx');
    const data = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const { deck } = await importPptx(data);
    expect(deck.slides).toHaveLength(3);
    const group = deck.slides[0].elements.find((e) => e.type === 'group') as GroupElement;
    const children = layoutGroupChildren(group);
    for (const [name, width, height] of [
      ['Angle 44.999', 90, 12.5],
      ['Angle 45', 37.5, 30],
      ['Angle 134.999', 37.5, 30],
      ['Angle 135', 90, 12.5],
      ['Angle 224.999', 90, 12.5],
      ['Angle 225', 37.5, 30],
      ['Angle 314.999', 37.5, 30],
      ['Angle 315', 90, 12.5],
    ] as const) {
      const child = children.find((e) => e.name === name)!;
      expect(child, name).toBeTruthy();
      expect(child.width * 0.75, name).toBeCloseTo(width, 5);
      expect(child.height * 0.75, name).toBeCloseTo(height, 5);
    }
    const boundary = children.find((e) => e.name === 'Angle 45')!;
    expect((group.x + boundary.x) * 0.75).toBeCloseTo(676.25, 5);
    expect((group.y + boundary.y) * 0.75).toBeCloseTo(103.75, 5);
    for (const slide of deck.slides.slice(1)) {
      const outer = slide.elements.find((e) => e.type === 'group') as GroupElement;
      const inner = outer.children.find((e) => e.type === 'group') as GroupElement;
      const projectedInner = layoutGroupChildren(outer).find(
        (e) => e.id === inner.id,
      ) as GroupElement;
      expect(projectedInner.width * 0.75).toBeCloseTo(112.5, 5);
      expect(projectedInner.height * 0.75).toBeCloseTo(240, 5);
      const nested = layoutGroupChildren(projectedInner);
      for (const [name, width, height] of [
        ['Nested local 0', 37.5, 30],
        ['Nested local 30', 37.5, 30],
        ['Nested local 60', 90, 12.5],
      ] as const) {
        const child = nested.find((e) => e.name === name)!;
        expect(child.width * 0.75, name).toBeCloseTo(width, 5);
        expect(child.height * 0.75, name).toBeCloseTo(height, 5);
      }
      const context = groupLayoutContext([outer, inner], 60);
      expect(context.position.x).toBeCloseTo(0.625, 10);
      expect(context.position.y).toBeCloseTo(1.5, 10);
      expect(context.size.x).toBeCloseTo(1.5, 10);
      expect(context.size.y).toBeCloseTo(0.625, 10);
    }
  });
});
