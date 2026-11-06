import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageCropEditor from './ImageCropEditor';
import { createDeck, createElement } from './model';
import type { ImageElement } from './types';
import { imageGeometry } from './imageGeometry';

vi.mock('./imageDimensions', () => ({
  readImageDimensions: () => ({ width: 800, height: 400, type: 'png' }),
  imageDisplaySource: (source: string) => source,
}));
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
beforeEach(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(patch: Partial<ImageElement> = {}) {
  const element = {
    ...createElement('image', createDeck().theme),
    width: 400,
    height: 300,
    fit: 'contain' as const,
    ...patch,
  };
  const onSave = vi.fn(),
    onClose = vi.fn();
  render(<ImageCropEditor element={element} onSave={onSave} onClose={onClose} />);
  return { element, onSave, onClose };
}
function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save crop' }));
}

describe('picture crop draft', () => {
  it('preserves the exact untouched source, crop metadata and absent values', () => {
    const { element, onSave } = setup({
      fit: 'stretch',
      crop: { left: 0.123456789, right: 0.2 },
      fillRect: {},
      flipH: false,
    });
    const field = screen.getByRole('spinbutton', { name: 'Crop left (%)', hidden: true });
    fireEvent.focus(field);
    fireEvent.blur(field);
    save();
    expect(onSave).toHaveBeenCalledExactlyOnceWith(element);
    expect(onSave.mock.calls[0][0]).toBe(element);
    expect(element.crop?.left).toBe(0.123456789);
  });
  it('pans and zooms a contained picture without rewriting bytes or moving its frame', () => {
    const { element, onSave } = setup();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Crop preview' }), {
      key: 'ArrowRight',
      shiftKey: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom picture in' }));
    expect(onSave).not.toHaveBeenCalled();
    save();
    const saved = onSave.mock.calls[0][0] as ImageElement;
    const geometry = imageGeometry(saved)!;
    expect(geometry.image.x).toBeCloseTo(-9);
    expect(geometry.image.y).toBeCloseTo(40);
    expect(geometry.image.width).toBeCloseTo(440);
    expect(geometry.image.height).toBeCloseTo(220);
    expect(saved).toMatchObject({
      x: element.x,
      y: element.y,
      width: 400,
      height: 300,
      src: element.src,
      fit: 'stretch',
    });
    expect(element.crop).toBeUndefined();
  });
  it('moves visually right when flipped, retaining destination margins', () => {
    const { onSave } = setup({
      fit: 'stretch',
      crop: { left: 0.2, right: 0.1 },
      fillRect: { left: 0.1, bottom: 0.2 },
      flipH: true,
    });
    fireEvent.keyDown(screen.getByRole('group', { name: 'Crop preview' }), {
      key: 'ArrowRight',
      shiftKey: true,
    });
    save();
    const saved = onSave.mock.calls[0][0] as ImageElement;
    expect(saved.fillRect).toEqual({ left: 0.1, bottom: 0.2 });
    expect(saved.crop!.left).toBeCloseTo(0.2 + 10 / (360 / 0.7));
    expect(saved.flipH).toBe(true);
  });
  it('scales pointer movement into picture coordinates and cancels an interrupted drag', () => {
    const { element, onSave } = setup({ fit: 'stretch' });
    const preview = screen.getByRole('group', { name: 'Crop preview' });
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 150,
      width: 200,
      height: 150,
      toJSON() {},
    });
    fireEvent.pointerDown(preview, { pointerId: 3, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(preview, { pointerId: 3, clientX: 70, clientY: 60 });
    fireEvent.pointerCancel(preview, { pointerId: 3 });
    save();
    expect(onSave.mock.calls[0][0]).toBe(element);
    onSave.mockClear();
    fireEvent.pointerDown(preview, { pointerId: 4, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(preview, { pointerId: 4, clientX: 70, clientY: 60 });
    fireEvent.pointerUp(preview, { pointerId: 4 });
    save();
    expect(imageGeometry(onSave.mock.calls[0][0])!.image).toMatchObject({
      x: 40,
      y: 20,
      width: 400,
      height: 300,
    });
  });
  it('commits a pending exact edge on the first Save click', async () => {
    const { onSave } = setup({ fit: 'stretch' });
    fireEvent.click(screen.getByText('Exact crop and fill edges'));
    const field = screen.getByRole('spinbutton', { name: 'Crop left (%)' });
    const user = userEvent.setup();
    await user.clear(field);
    await user.type(field, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save crop' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].crop.left).toBe(0.125);
  });
  it('starts a pointer gesture from the latest pending edge edit', () => {
    const { onSave } = setup({ fit: 'stretch' });
    const field = screen.getByRole('spinbutton', { name: 'Crop left (%)', hidden: true });
    field.focus();
    fireEvent.change(field, { target: { value: '20' } });
    const preview = screen.getByRole('group', { name: 'Crop preview' });
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON() {},
    });
    fireEvent.pointerDown(preview, { pointerId: 5, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(preview, { pointerId: 5, clientX: 110, clientY: 100 });
    fireEvent.pointerUp(preview, { pointerId: 5 });
    save();
    const saved = onSave.mock.calls[0][0] as ImageElement;
    expect(imageGeometry(saved)!.image.width).toBeCloseTo(500);
    expect(saved.crop!.left).toBeCloseTo(0.18);
    expect(saved.crop!.right).toBeCloseTo(0.02);
  });
  it('rejects newly empty crops and recovers with a fitting preset', () => {
    const { onSave } = setup({ fit: 'stretch' });
    const field = screen.getByRole('spinbutton', { name: 'Crop left (%)', hidden: true });
    fireEvent.change(field, { target: { value: '100' } });
    fireEvent.blur(field);
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('no visible picture area');
    fireEvent.click(screen.getByRole('button', { name: 'Fit picture' }));
    save();
    expect(onSave.mock.calls[0][0]).toMatchObject({
      fit: 'contain',
      crop: undefined,
      fillRect: undefined,
    });
  });
  it('cancels local changes and blocks locked-picture keyboard edits', () => {
    const { onSave, onClose } = setup({ locked: true });
    expect(screen.getByRole('button', { name: 'Save crop' }).matches(':disabled')).toBe(true);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Crop preview' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
