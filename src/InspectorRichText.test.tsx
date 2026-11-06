import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Inspector from './Inspector';
import { createDeck, createElement } from './model';
import { withParagraphs } from './richText';

afterEach(cleanup);

function setup(rich = true) {
  const deck = createDeck();
  const original = createElement('text', deck.theme);
  const element = rich
    ? withParagraphs(original, [{ runs: [{ text: 'Original text', bold: true }] }])
    : original;
  const onElementPatch = vi.fn();
  render(
    <Inspector
      deck={deck}
      slide={deck.slides[0]}
      selected={[element]}
      onElementPatch={onElementPatch}
      onSlidePatch={vi.fn()}
      onTheme={vi.fn()}
      onSelect={vi.fn()}
      onLayer={vi.fn()}
      onEditRichText={vi.fn()}
    />,
  );
  return { element, onElementPatch, input: screen.getByLabelText('Text') as HTMLTextAreaElement };
}

describe('inspector rich plain-text input limits', () => {
  it('rejects an oversized paragraph paste before accepting it and keeps the original available', () => {
    const { element, input, onElementPatch } = setup();
    fireEvent.change(input, { target: { value: '\n'.repeat(5000) } });
    expect(input.value).toBe(element.text);
    const error = screen.getByRole('alert');
    expect(error.textContent).toContain('5,000 paragraphs');
    expect(error.textContent).toContain('edit was not accepted');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    fireEvent.blur(input);
    expect(onElementPatch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit styles & lists' })).toBeTruthy();
  });

  it('retains the last valid draft after a rejected paste and commits only that accepted text', () => {
    const { input, onElementPatch } = setup();
    fireEvent.change(input, { target: { value: 'Accepted draft' } });
    fireEvent.change(input, { target: { value: '\n'.repeat(5000) } });
    expect(input.value).toBe('Accepted draft');
    expect(onElementPatch).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onElementPatch).toHaveBeenCalledExactlyOnceWith({ text: 'Accepted draft' });
  });

  it('clears the validation error after a valid correction and commits exactly that correction', () => {
    const { input, onElementPatch } = setup();
    fireEvent.change(input, { target: { value: '\n'.repeat(5000) } });
    fireEvent.change(input, { target: { value: 'A corrected\nparagraph' } });
    expect(input.value).toBe('A corrected\nparagraph');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    fireEvent.blur(input);
    expect(onElementPatch).toHaveBeenCalledExactlyOnceWith({ text: 'A corrected\nparagraph' });
  });

  it('keeps the existing plain-text behavior for legacy boxes without rich paragraphs', () => {
    const { input, onElementPatch } = setup(false);
    const text = '\n'.repeat(5000);
    fireEvent.change(input, { target: { value: text } });
    expect(input.value).toBe(text);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(input);
    expect(onElementPatch).toHaveBeenCalledExactlyOnceWith({ text });
  });
});
