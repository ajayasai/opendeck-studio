import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageView from './ImageView';
import { createDeck, createElement } from './model';
import { SlideView } from './SlideView';
import type { ImageElement } from './types';
import * as imageDimensions from './imageDimensions';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const picture = (): ImageElement => ({
  ...createElement('image', createDeck().theme),
  width: 400,
  height: 200,
  alt: 'Calibration photograph',
});

describe('shared picture rendering', () => {
  it('neutralizes metadata only for explicitly encoded pictures and leaves saved bytes unchanged', () => {
    const source = picture(),
      derived = 'data:image/png;base64,ZW5jb2RlZA==';
    const display = vi.spyOn(imageDimensions, 'imageDisplaySource').mockReturnValue(derived);
    const view = render(<ImageView element={source} />);
    expect(screen.getByAltText(source.alt).getAttribute('src')).toBe(source.src);
    expect(display).not.toHaveBeenCalled();
    view.rerender(<ImageView element={{ ...source, orientation: 'encoded' }} />);
    expect(screen.getByAltText(source.alt).getAttribute('src')).toBe(derived);
    expect(display).toHaveBeenCalledWith(source.src);
    expect(source).not.toHaveProperty('orientation');
    expect(source.src).not.toBe(derived);
  });
  it('keeps legacy automatic fits and accessible image descriptions without persisting dimensions', () => {
    const element = picture(),
      view = render(<ImageView element={element} />);
    const image = screen.getByAltText(element.alt) as HTMLImageElement;
    expect(image.style.objectFit).toBe('contain');
    expect(image.draggable).toBe(false);
    expect(view.container.querySelector('.picture-fill-viewport')).toBeNull();
    expect(element).not.toHaveProperty('crop');
    view.rerender(<ImageView element={{ ...element, fit: 'cover' }} />);
    expect(image.style.objectFit).toBe('cover');
  });

  it('clips the source window to its fill viewport and the outer frame, without waiting for image load', () => {
    const element = {
      ...picture(),
      fit: 'contain' as const,
      crop: { left: 0.25, right: 0.25 },
      fillRect: { left: 0.1, right: 0.2 },
    };
    const view = render(<ImageView element={element} />);
    const viewport = view.container.querySelector<HTMLElement>('.picture-fill-viewport')!;
    const image = screen.getByAltText(element.alt) as HTMLImageElement;
    expect(viewport.style.overflow).toBe('hidden');
    expect(viewport.style.left).toBe('10%');
    expect(viewport.style.width).toBe('70%');
    expect(image.style.left).toBe('-50%');
    expect(image.style.width).toBe('200%');
    expect(image.style.objectFit).toBe('fill');
    expect(view.container.querySelector<HTMLElement>('.picture-frame')!.style.overflow).toBe(
      'hidden',
    );
  });

  it('flips the entire cropped local frame before the existing object rotation', () => {
    const deck = createDeck(),
      image = {
        ...picture(),
        crop: { left: 0.2 },
        flipH: true,
        flipV: true,
        rotation: 30,
        opacity: 0.4,
      };
    deck.slides[0].elements = [image];
    const original = structuredClone(image);
    const view = render(<SlideView deck={deck} slide={deck.slides[0]} />);
    const frame = view.container.querySelector<HTMLElement>('.picture-frame')!;
    expect(frame.parentElement!.style.transform).toBe('rotate(30deg)');
    expect(frame.parentElement!.style.opacity).toBe('0.4');
    expect(frame.querySelector<HTMLElement>('.picture-orientation')!.style.transform).toBe(
      'scale(-1, -1)',
    );
    expect(image).toEqual(original);
  });

  it('does not draw inverted or unbounded windows but retains an accessible picture identity', () => {
    const element = { ...picture(), crop: { left: 1, right: 1 } };
    const view = render(<ImageView element={element} />);
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: element.alt }).getAttribute('title')).toContain(
      'not drawn',
    );
    expect(element.crop).toEqual({ left: 1, right: 1 });
  });
});
