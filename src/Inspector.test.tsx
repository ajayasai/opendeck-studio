import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Inspector from './Inspector';
import { createDeck, createElement, createSlide } from './model';
import { applyTextPatch, withParagraphs } from './richText';
import type { TextElement, TextFrame } from './types';

afterEach(cleanup);
const sampleFrame = (): TextFrame => ({
  insets: { top: 12.125, right: 23, bottom: 34, left: 45 },
  wrap: 'none',
  horizontalOverflow: 'overflow',
  verticalOverflow: 'clip',
});
function setup(options: { frame?: TextFrame; locked?: boolean } = {}) {
  const original = createDeck(),
    originalSlide = createSlide(original.theme);
  const source = withParagraphs(createElement('text', original.theme), [
    { runs: [{ text: 'Keep me', bold: true, color: '#AA3322' }], align: 'right', lineSpacing: 1.5 },
  ]);
  source.locked = options.locked ?? false;
  if (options.frame) source.textFrame = options.frame;
  const onPatch = vi.fn();
  function Harness() {
    const [element, setElement] = useState(source);
    const slide = { ...originalSlide, elements: [element] },
      deck = { ...original, slides: [slide] };
    return (
      <>
        <output data-testid="inspector-element">{JSON.stringify(element)}</output>
        <Inspector
          deck={deck}
          slide={slide}
          selected={[element]}
          onElementPatch={(patch) => {
            onPatch(patch);
            setElement((current) => applyTextPatch(current, patch as Partial<TextElement>));
          }}
          onSlidePatch={vi.fn()}
          onTheme={vi.fn()}
          onSelect={vi.fn()}
          onLayer={vi.fn()}
        />
      </>
    );
  }
  render(<Harness />);
  return { source, onPatch };
}
const current = (): TextElement => JSON.parse(screen.getByTestId('inspector-element').textContent!);
function editMargin(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('Inspector text-frame controls', () => {
  it('shows legacy defaults without writing an explicit frame merely by viewing controls', () => {
    const { onPatch } = setup();
    for (const side of ['Top', 'Right', 'Bottom', 'Left'])
      expect((screen.getByLabelText(`${side} margin (px)`) as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Wrap text') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Text beyond width') as HTMLSelectElement).value).toBe('clip');
    expect((screen.getByLabelText('Text beyond height') as HTMLSelectElement).value).toBe('clip');
    expect(onPatch).not.toHaveBeenCalled();
    expect(current()).not.toHaveProperty('textFrame');
  });

  it('does not rewrite imported fractional margins after focus and blur without an edit', () => {
    const { onPatch } = setup({ frame: sampleFrame() });
    const input = screen.getByLabelText('Top margin (px)');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onPatch).not.toHaveBeenCalled();
    expect(current().textFrame!.insets.top).toBe(12.125);
  });

  it('edits signed margins and independent axes, then resets only margins while preserving rich content', () => {
    const { source } = setup({ frame: sampleFrame() });
    editMargin('Left margin (px)', '-20.5');
    expect(current().textFrame!.insets).toEqual({ ...sampleFrame().insets, left: -20.5 });
    fireEvent.click(screen.getByLabelText('Wrap text'));
    fireEvent.change(screen.getByLabelText('Text beyond height'), {
      target: { value: 'overflow' },
    });
    expect(current().textFrame).toMatchObject({
      wrap: 'square',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'overflow',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset margins' }));
    expect(current().textFrame).toEqual({
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      wrap: 'square',
      horizontalOverflow: 'overflow',
      verticalOverflow: 'overflow',
    });
    expect(current().paragraphs).toEqual(source.paragraphs);
    expect(current().text).toBe(source.text);
    expect(current().fontSize).toBe(source.fontSize);
  });

  it('bounds inset edits and explains an empty content area until margins are reset', () => {
    setup({ frame: sampleFrame() });
    editMargin('Left margin (px)', '-20000');
    expect(current().textFrame!.insets.left).toBe(-10000);
    editMargin('Left margin (px)', '20000');
    expect(current().textFrame!.insets.left).toBe(10000);
    expect(screen.getByRole('alert').textContent).toContain('Margins leave no room for text');
    fireEvent.click(screen.getByRole('button', { name: 'Reset margins' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps margin, wrap, overflow, and reset controls disabled for locked objects', async () => {
    const { source, onPatch } = setup({ frame: sampleFrame(), locked: true });
    for (const label of [
      'Top margin (px)',
      'Right margin (px)',
      'Bottom margin (px)',
      'Left margin (px)',
      'Wrap text',
      'Text beyond width',
      'Text beyond height',
    ])
      expect(screen.getByLabelText(label).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Reset margins' }).matches(':disabled')).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reset margins' }));
    await user.click(screen.getByLabelText('Wrap text'));
    await user.type(screen.getByLabelText('Left margin (px)'), '90');
    expect(onPatch).not.toHaveBeenCalled();
    expect(current()).toEqual(source);
  });
});
