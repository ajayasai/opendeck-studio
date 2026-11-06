import type { GroupElement, SlideElement } from './types';

export const MAX_GROUP_DEPTH = 16;
export const MAX_SLIDE_NODES = 2000;
export const MAX_DECK_NODES = 20000;
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
export interface Point {
  x: number;
  y: number;
}

export function transformPoint(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}
/** Compose left × right, so right acts first. */
export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}
export function invertMatrix(matrix: Matrix): Matrix | undefined {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) return undefined;
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

/** Map native child-coordinate points/centers into the parent; rotated leaf corners require frame relayout first. */
export function groupMatrix(group: GroupElement): Matrix {
  const sx = group.childFrame.width === 0 ? 1 : group.width / group.childFrame.width;
  const sy = group.childFrame.height === 0 ? 1 : group.height / group.childFrame.height;
  const angle = (group.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const flipX = group.flipH ? -1 : 1,
    flipY = group.flipV ? -1 : 1;
  const a = cos * flipX * sx,
    b = sin * flipX * sx,
    c = -sin * flipY * sy,
    d = cos * flipY * sy;
  const centerX = group.width / 2,
    centerY = group.height / 2;
  return {
    a,
    b,
    c,
    d,
    e:
      group.x +
      centerX -
      cos * flipX * centerX +
      sin * flipY * centerY -
      a * group.childFrame.x -
      c * group.childFrame.y,
    f:
      group.y +
      centerY -
      sin * flipX * centerX -
      cos * flipY * centerY -
      b * group.childFrame.x -
      d * group.childFrame.y,
  };
}

/** Native group resizing changes child frames before their rotations; fonts and strokes stay unscaled. */
export function layoutGroupChildren(group: GroupElement): SlideElement[] {
  const sx = group.childFrame.width === 0 ? 1 : group.width / group.childFrame.width;
  const sy = group.childFrame.height === 0 ? 1 : group.height / group.childFrame.height;
  return group.children
    .map((child) => {
      const size = rotatedGroupScale({ x: sx, y: sy }, child.rotation);
      const width = child.width * size.x,
        height = child.height * size.y;
      return {
        ...child,
        width,
        height,
        x: (child.x + child.width / 2 - group.childFrame.x) * sx - width / 2,
        y: (child.y + child.height / 2 - group.childFrame.y) * sy - height / 2,
      };
    })
    .filter(groupDisplayGeometryIsSafe);
}

/** Bound derived CSS geometry only; source coordinates and hierarchy are never clamped. */
function groupDisplayGeometryIsSafe(element: SlideElement): boolean {
  return (
    [element.x, element.y, element.width, element.height].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 1e9,
    ) &&
    element.width > 0 &&
    element.height > 0
  );
}

export function groupRenderingWarnings(elements: SlideElement[]): string[] {
  for (const element of elements)
    if (element.type === 'group') {
      const children = layoutGroupChildren(element);
      if (children.length !== element.children.length || groupRenderingWarnings(children).length)
        return [
          'Some group contents exceed the safe browser geometry range and are not drawn; their source hierarchy is retained.',
        ];
    }
  return [];
}

/** Native quarter-turn bands exchange dimension axes, while center positions keep the original axes. */
export function groupRotationSwapsAxes(rotation: number): boolean {
  const angle = ((rotation % 360) + 360) % 360;
  return (angle >= 45 && angle < 135) || (angle >= 225 && angle < 315);
}
function rotatedGroupScale(
  scale: { x: number; y: number },
  rotation: number,
): { x: number; y: number } {
  return groupRotationSwapsAxes(rotation) ? { x: scale.y, y: scale.x } : scale;
}

export function groupLayoutContext(
  ancestors: GroupElement[],
  rotation = 0,
): { position: { x: number; y: number }; size: { x: number; y: number } } {
  let x = 1,
    y = 1;
  for (const group of ancestors) {
    const size = rotatedGroupScale({ x, y }, group.rotation);
    x = group.childFrame.width === 0 ? 1 : (size.x * group.width) / group.childFrame.width;
    y = group.childFrame.height === 0 ? 1 : (size.y * group.height) / group.childFrame.height;
  }
  return { position: { x, y }, size: rotatedGroupScale({ x, y }, rotation) };
}
export function groupTextScale(ancestors: GroupElement[], rotation = 0): { x: number; y: number } {
  return groupLayoutContext(ancestors, rotation).size;
}

/** Project relative to the unshifted parent origin for export-time fit/orientation preparation. */
export function projectGroupFrame<T extends SlideElement>(
  element: T,
  ancestors: GroupElement[],
): T {
  const context = groupLayoutContext(ancestors, element.rotation);
  const width = element.width * context.size.x,
    height = element.height * context.size.y;
  return {
    ...element,
    width,
    height,
    x: (element.x + element.width / 2) * context.position.x - width / 2,
    y: (element.y + element.height / 2) * context.position.y - height / 2,
  };
}
/** Invert with the resulting rotation, which may change dimension axes after EXIF materialization. */
export function restoreGroupFrame<T extends SlideElement>(
  element: T,
  ancestors: GroupElement[],
): T {
  const context = groupLayoutContext(ancestors, element.rotation);
  const width = element.width / context.size.x,
    height = element.height / context.size.y;
  return {
    ...element,
    width,
    height,
    x: (element.x + element.width / 2) / context.position.x - width / 2,
    y: (element.y + element.height / 2) / context.position.y - height / 2,
  };
}

export function elementBounds(element: SlideElement): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const angle = (element.rotation * Math.PI) / 180;
  const width =
    Math.abs(element.width * Math.cos(angle)) + Math.abs(element.height * Math.sin(angle));
  const height =
    Math.abs(element.width * Math.sin(angle)) + Math.abs(element.height * Math.cos(angle));
  const x = element.x + element.width / 2,
    y = element.y + element.height / 2;
  return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
}

export function flattenElements(elements: SlideElement[]): SlideElement[] {
  return elements.flatMap((element) =>
    element.type === 'group' ? [element, ...flattenElements(element.children)] : [element],
  );
}
/** Postorder mapping preserves unchanged containers/arrays and does not mutate input. */
export function mapElements(
  elements: SlideElement[],
  mapper: (element: SlideElement) => SlideElement,
): SlideElement[] {
  let changed = false;
  const next = elements.map((element) => {
    const children = element.type === 'group' ? mapElements(element.children, mapper) : undefined;
    const current =
      element.type === 'group' && children !== element.children
        ? { ...element, children: children! }
        : element;
    const mapped = mapper(current);
    if (mapped !== element) changed = true;
    return mapped;
  });
  return changed ? next : elements;
}
export function getGroupPath(elements: SlideElement[], path: string[]): GroupElement[] {
  const result: GroupElement[] = [];
  let current = elements;
  for (const id of path) {
    const group = current.find((element) => element.id === id);
    if (group?.type !== 'group') break;
    result.push(group);
    current = group.children;
  }
  return result;
}
export function getElementsAtPath(
  elements: SlideElement[],
  path: string[],
): SlideElement[] | undefined {
  const groups = getGroupPath(elements, path);
  return groups.length !== path.length ? undefined : (groups.at(-1)?.children ?? elements);
}
export function findGroupPath(elements: SlideElement[], groupId: string): string[] | undefined {
  for (const element of elements)
    if (element.type === 'group') {
      if (element.id === groupId) return [element.id];
      const nested = findGroupPath(element.children, groupId);
      if (nested) return [element.id, ...nested];
    }
  return undefined;
}
export function updateElementsAtPath(
  elements: SlideElement[],
  path: string[],
  update: (items: SlideElement[]) => SlideElement[],
): SlideElement[] {
  if (!path.length) return update(elements);
  const [id, ...rest] = path,
    index = elements.findIndex((element) => element.id === id),
    group = elements[index];
  if (group?.type !== 'group' || group.locked) return elements;
  const children = updateElementsAtPath(group.children, rest, update);
  if (children === group.children) return elements;
  return elements.map((element, i) => (i === index ? { ...group, children } : element));
}

export interface GroupOperationResult {
  elements: SlideElement[];
  selected: string[];
  reason?: string;
}
const failure = (
  elements: SlideElement[],
  selected: string[],
  reason: string,
): GroupOperationResult => ({ elements, selected, reason });
const legal = (element: Pick<SlideElement, 'x' | 'y' | 'width' | 'height'>) =>
  Math.abs(element.x) <= 100000 &&
  Math.abs(element.y) <= 100000 &&
  element.width >= 0.01 &&
  element.height >= 0.01 &&
  element.width <= 100000 &&
  element.height <= 100000;
const groupDepth = (element: SlideElement): number =>
  element.type === 'group' ? 1 + Math.max(0, ...element.children.map(groupDepth)) : 0;

export function groupSelection(elements: SlideElement[], ids: string[]): GroupOperationResult {
  const selected = new Set(ids),
    children = elements.filter((element) => selected.has(element.id));
  if (children.length < 2)
    return failure(elements, ids, 'Select at least two sibling objects to group.');
  if (children.some((element) => element.locked))
    return failure(elements, ids, 'Unlock selected objects before grouping them.');
  if (children.some((element) => groupDepth(element) >= MAX_GROUP_DEPTH))
    return failure(elements, ids, 'This group would exceed the supported nesting depth.');
  if (flattenElements(elements).length >= MAX_SLIDE_NODES)
    return failure(elements, ids, 'Grouping would exceed the slide object limit.');
  const bounds = children.map(elementBounds);
  const x = Math.min(...bounds.map((bound) => bound.left)),
    y = Math.min(...bounds.map((bound) => bound.top));
  const width = Math.max(...bounds.map((bound) => bound.right)) - x,
    height = Math.max(...bounds.map((bound) => bound.bottom)) - y;
  if (!legal({ x, y, width, height }))
    return failure(
      elements,
      ids,
      'The selected bounds exceed the supported group geometry limits.',
    );
  const group: GroupElement = {
    type: 'group',
    id:
      globalThis.crypto?.randomUUID?.() ??
      `od-group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'Group',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    animation: 'none',
    childFrame: { x, y, width, height },
    children,
  };
  const last = elements.reduce(
    (lastIndex, element, index) => (selected.has(element.id) ? index : lastIndex),
    -1,
  );
  return {
    elements: elements.flatMap((element, index) =>
      index === last ? [group] : selected.has(element.id) ? [] : [element],
    ),
    selected: [group.id],
  };
}

export function ungroupSelection(
  elements: SlideElement[],
  ids: string[],
  ancestors: GroupElement[] = [],
): GroupOperationResult {
  const selected = new Set(ids),
    groups = elements.filter((element) => selected.has(element.id));
  if (!groups.length || groups.some((element) => element.type !== 'group'))
    return failure(elements, ids, 'Select one or more groups to ungroup.');
  if (ancestors.some((group) => group.locked))
    return failure(elements, ids, 'Unlock enclosing groups before ungrouping their contents.');
  if (
    ancestors.some(
      (group) =>
        group.childFrame.width === 0 ||
        group.childFrame.height === 0 ||
        Math.abs(group.width / group.childFrame.width - 1) > 1e-9 ||
        Math.abs(group.height / group.childFrame.height - 1) > 1e-9,
    )
  )
    return failure(
      elements,
      ids,
      'Ungrouping inside a scaled or zero-extent group can change native layout. Keep the hierarchy while editing its contents.',
    );
  const expanded = new Map<string, SlideElement[]>();
  for (const candidate of groups) {
    if (candidate.type !== 'group') continue;
    const group = candidate;
    if (group.locked)
      return failure(elements, ids, 'Unlock selected groups before ungrouping them.');
    if (group.childFrame.width === 0 || group.childFrame.height === 0)
      return failure(
        elements,
        ids,
        'This group uses zero child extents; keep its hierarchy to preserve native layout.',
      );
    const sx = group.childFrame.width === 0 ? 1 : group.width / group.childFrame.width,
      sy = group.childFrame.height === 0 ? 1 : group.height / group.childFrame.height;
    if (Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9 || group.flipH || group.flipV)
      return failure(
        elements,
        ids,
        'This group has scaling or flips that cannot be removed without changing its contents. Edit its contents while keeping the group.',
      );
    if (group.opacity !== 1 || group.animation !== 'none')
      return failure(
        elements,
        ids,
        'This group has shared opacity or animation that cannot be preserved when ungrouping.',
      );
    const matrix = groupMatrix(group);
    const children = group.children.map((child) => {
      const center = transformPoint(matrix, {
        x: child.x + child.width / 2,
        y: child.y + child.height / 2,
      });
      const rotation = child.rotation + group.rotation;
      return {
        ...child,
        x: center.x - child.width / 2,
        y: center.y - child.height / 2,
        rotation: Math.abs(rotation) > 360000 ? rotation % 360 : rotation,
      };
    });
    if (children.some((child) => !legal(child)))
      return failure(
        elements,
        ids,
        'Ungrouping would exceed the supported object coordinate limits.',
      );
    expanded.set(group.id, children);
  }
  return {
    elements: elements.flatMap((element) => expanded.get(element.id) ?? [element]),
    selected: groups.flatMap((group) => expanded.get(group.id)!.map((child) => child.id)),
  };
}
