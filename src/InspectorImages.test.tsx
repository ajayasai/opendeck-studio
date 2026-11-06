import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Inspector from './Inspector';
import { createDeck, createElement } from './model';
import type { ImageElement } from './types';

afterEach(cleanup);
function setup(locked = false) {
  const deck = createDeck();
  const source: ImageElement = {
    ...createElement('image', deck.theme),
    fit: 'stretch',
    crop: { left: 0.1234567 },
    fillRect: { top: 0.05 },
    flipH: true,
    flipV: false,
    orientation: 'encoded',
    locked,
  };
  const onCrop = vi.fn();
  function Harness() {
    const [element, setElement] = useState(source);
    return (
      <>
        <output data-testid="picture">{JSON.stringify(element)}</output>
        <Inspector
          deck={deck}
          slide={{ ...deck.slides[0], elements: [element] }}
          selected={[element]}
          onElementPatch={(patch) =>
            setElement((current) => ({ ...current, ...patch }) as ImageElement)
          }
          onSlidePatch={() => {}}
          onTheme={() => {}}
          onSelect={() => {}}
          onLayer={() => {}}
          onEditImageCrop={onCrop}
        />
      </>
    );
  }
  render(<Harness />);
  return { source, onCrop };
}
const current = () => JSON.parse(screen.getByTestId('picture').textContent!) as ImageElement;
describe('picture inspector', () => {
  it('identifies an imported custom crop and passes its exact metadata to the editor', () => {
    const { source, onCrop } = setup();
    expect((screen.getByRole('combobox', { name: 'Image fit' }) as HTMLSelectElement).value).toBe(
      'custom',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crop picture…' }));
    expect(onCrop).toHaveBeenCalledExactlyOnceWith(source);
  });
  it('deliberately resets rectangles when choosing a fitting mode, retaining image transforms and bytes', () => {
    const { source } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: 'Image fit' }), {
      target: { value: 'cover' },
    });
    expect(current()).toEqual({ ...source, fit: 'cover', crop: undefined, fillRect: undefined });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Flip picture vertically' }));
    expect(current()).toMatchObject({
      flipH: true,
      flipV: true,
      orientation: 'encoded',
      src: source.src,
      width: source.width,
      height: source.height,
    });
  });
  it('disables cropping, fitting, and flipping when a picture is locked', () => {
    const { onCrop } = setup(true);
    for (const element of [
      screen.getByRole('button', { name: 'Crop picture…' }),
      screen.getByRole('combobox', { name: 'Image fit' }),
      screen.getByRole('checkbox', { name: 'Flip picture horizontally' }),
    ])
      expect(element.matches(':disabled')).toBe(true);
    expect(onCrop).not.toHaveBeenCalled();
  });
});
