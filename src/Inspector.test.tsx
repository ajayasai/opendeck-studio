import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Inspector from './Inspector';
import { createDeck, createElement, createSlide } from './model';
import { applyTextPatch, withParagraphs } from './richText';
import type { TextAutoFit, TextDecoration, TextElement, TextFrame } from './types';

afterEach(cleanup);

describe('Inspector hex color entry', () => {
  it('commits a keyboard-entered color once and updates the whole text box', async () => {
    const { onPatch } = setup();
    const input = screen.getByRole('textbox', { name: 'Text color hex' });
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '123abc');
    expect(onPatch).not.toHaveBeenCalled();
    await user.tab();
    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ color: '#123abc' });
    expect(current().color).toBe('#123abc');
    expect(current().paragraphs![0].runs[0].color).toBe('#123abc');
    expect((input as HTMLInputElement).value).toBe('#123ABC');
  });

  it('rejects invalid drafts and lets Escape discard a color change', () => {
    const { source, onPatch } = setup();
    const input = screen.getByRole('textbox', { name: 'Text color hex' });
    fireEvent.change(input, { target: { value: 'zz0000' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('The color was not changed');
    expect(current().color).toBe(source.color);
    fireEvent.change(input, { target: { value: '#000000' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe(source.color.toUpperCase());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('does not rewrite untouched colors and disables hex entry for locked objects', () => {
    const { onPatch } = setup({ locked: true });
    const input = screen.getByRole('textbox', { name: 'Text color hex' });
    expect(input.matches(':disabled')).toBe(true);
    expect(onPatch).not.toHaveBeenCalled();
  });
});

const sampleFrame = (): TextFrame => ({
  insets: { top: 12.125, right: 23, bottom: 34, left: 45 },
  wrap: 'none',
  horizontalOverflow: 'overflow',
  verticalOverflow: 'clip',
});
function setup(
  options: {
    frame?: TextFrame;
    locked?: boolean;
    autoFit?: TextAutoFit;
    decoration?: TextDecoration;
    textOpacity?: number;
  } = {},
) {
  const original = createDeck(),
    originalSlide = createSlide(original.theme);
  const source = withParagraphs(createElement('text', original.theme), [
    { runs: [{ text: 'Keep me', bold: true, color: '#AA3322' }], align: 'right', lineSpacing: 1.5 },
  ]);
  source.locked = options.locked ?? false;
  if (options.frame) source.textFrame = options.frame;
  if (options.autoFit) source.autoFit = options.autoFit;
  if (options.decoration) source.decoration = options.decoration;
  if (options.textOpacity !== undefined) source.textOpacity = options.textOpacity;
  const onPatch = vi.fn(),
    onFit = vi.fn();
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
          onFitText={onFit}
        />
      </>
    );
  }
  render(<Harness />);
  return { source, onPatch, onFit };
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
    expect(
      (screen.getByLabelText('Include spacing at text box edges') as HTMLInputElement).checked,
    ).toBe(true);
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
      'Include spacing at text box edges',
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

  it('updates edge spacing while retaining it through margin reset and other frame edits', () => {
    const { source } = setup({ frame: sampleFrame() });
    fireEvent.click(screen.getByLabelText('Include spacing at text box edges'));
    expect(current().textFrame!.paragraphSpacingAtEdges).toBe(false);
    editMargin('Top margin (px)', '9');
    fireEvent.click(screen.getByRole('button', { name: 'Reset margins' }));
    expect(current().textFrame).toEqual({
      ...sampleFrame(),
      paragraphSpacingAtEdges: false,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    fireEvent.click(screen.getByLabelText('Include spacing at text box edges'));
    expect(current().textFrame!.paragraphSpacingAtEdges).toBe(true);
    expect(current().paragraphs).toEqual(source.paragraphs);
  });
});

describe('Inspector text-box decoration', () => {
  const decorated = (): TextDecoration => ({
    shape: 'roundRect',
    cornerRadius: 0.1875,
    fill: { color: '#AABBCC', opacity: 0.4 },
    line: { color: '#112233', opacity: 0.7, width: 3.25, dash: 'longDashDot' },
  });

  it('shows transparent defaults without adding optional decoration or text opacity fields', () => {
    const { onPatch } = setup();
    expect((screen.getByLabelText('Text box shape') as HTMLSelectElement).value).toBe('rect');
    expect((screen.getByLabelText('Text box fill') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Text box outline') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Text opacity %') as HTMLInputElement).value).toBe('100');
    expect(screen.queryByLabelText('Outline width (px)')).toBeNull();
    expect(current()).not.toHaveProperty('decoration');
    expect(current()).not.toHaveProperty('textOpacity');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('edits each paint independently and keeps text, fitting, whole opacity and geometry unchanged', () => {
    const { source } = setup({
      decoration: decorated(),
      frame: sampleFrame(),
      autoFit: { mode: 'shrink', fontScale: 0.6, lineSpacingReduction: 0.1 },
    });
    fireEvent.change(screen.getByLabelText('Text box fill color'), {
      target: { value: '#ffcc00' },
    });
    editMargin('Fill opacity (%)', '25');
    editMargin('Outline opacity (%)', '75');
    editMargin('Outline width (px)', '0');
    fireEvent.change(screen.getByLabelText('Outline dash'), { target: { value: 'sysDashDotDot' } });
    fireEvent.change(screen.getByLabelText('Outline cap'), { target: { value: 'round' } });
    editMargin('Corner roundness (%)', '35');
    editMargin('Text opacity %', '45');
    expect(current().decoration).toEqual({
      shape: 'roundRect',
      cornerRadius: 0.35,
      fill: { color: '#ffcc00', opacity: 0.25 },
      line: { color: '#112233', opacity: 0.75, width: 0, dash: 'sysDashDotDot', cap: 'round' },
    });
    expect(screen.getByText(/Hairline outline/)).toBeTruthy();
    expect(current().textOpacity).toBe(0.45);
    expect(current().opacity).toBe(source.opacity);
    expect(current().text).toBe(source.text);
    expect(current().paragraphs).toEqual(source.paragraphs);
    expect(current().autoFit).toEqual(source.autoFit);
    expect(current().textFrame).toEqual(source.textFrame);
    expect([current().width, current().height, current().x, current().y]).toEqual([
      source.width,
      source.height,
      source.x,
      source.y,
    ]);
  });

  it('toggles paint off independently, bounds controls, and offers all supported shape/dash modes', () => {
    setup({ decoration: decorated() });
    expect((screen.getByLabelText('Outline dash') as HTMLSelectElement).options).toHaveLength(11);
    expect((screen.getByLabelText('Outline cap') as HTMLSelectElement).value).toBe('flat');
    expect((screen.getByLabelText('Outline cap') as HTMLSelectElement).options).toHaveLength(3);
    expect((screen.getByLabelText('Text box shape') as HTMLSelectElement).options).toHaveLength(4);
    editMargin('Fill opacity (%)', '-20');
    editMargin('Outline width (px)', '200');
    editMargin('Corner roundness (%)', '75');
    expect(current().decoration!.fill!.opacity).toBe(0);
    expect(current().decoration!.line!.width).toBe(100);
    expect(current().decoration!.cornerRadius).toBe(0.5);
    fireEvent.click(screen.getByLabelText('Text box fill'));
    expect(current().decoration!.fill).toBeNull();
    expect(current().decoration!.line).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Text box shape'), { target: { value: 'ellipse' } });
    expect(current().decoration!.shape).toBe('ellipse');
    expect(screen.queryByLabelText('Corner roundness (%)')).toBeNull();
    fireEvent.click(screen.getByLabelText('Text box outline'));
    expect(current().decoration!.line).toBeNull();
    fireEvent.click(screen.getByLabelText('Text box fill'));
    fireEvent.click(screen.getByLabelText('Text box outline'));
    expect(current().decoration!.fill).toEqual({ color: '#ffffff', opacity: 1 });
    expect(current().decoration!.line).toMatchObject({ opacity: 1, width: 1, dash: 'solid' });
  });

  it('edits outline joins and retains a bounded native miter ratio while changing modes', () => {
    setup({ decoration: decorated() });
    expect((screen.getByLabelText('Outline join') as HTMLSelectElement).value).toBe('round');
    expect(screen.queryByLabelText('Miter limit')).toBeNull();
    expect(current().decoration!.line).not.toHaveProperty('join');
    fireEvent.change(screen.getByLabelText('Outline join'), { target: { value: 'miter' } });
    expect((screen.getByLabelText('Miter limit') as HTMLInputElement).value).toBe('8');
    editMargin('Miter limit', '0');
    expect(current().decoration!.line).toMatchObject({ join: 'miter', miterLimit: 0 });
    fireEvent.change(screen.getByLabelText('Outline join'), { target: { value: 'bevel' } });
    expect(screen.queryByLabelText('Miter limit')).toBeNull();
    expect(current().decoration!.line).toMatchObject({ join: 'bevel', miterLimit: 0 });
    fireEvent.change(screen.getByLabelText('Outline join'), { target: { value: 'miter' } });
    editMargin('Miter limit', '50000');
    expect(current().decoration!.line!.miterLimit).toBe(21474.83647);
    editMargin('Miter limit', '-2');
    expect(current().decoration!.line!.miterLimit).toBe(0);
  });

  it('does not rewrite untouched imported opacity after focus and blur', () => {
    const paint = decorated();
    paint.fill!.opacity = 0.123456;
    const { onPatch, source } = setup({ decoration: paint, textOpacity: 0.333333 });
    for (const label of ['Fill opacity (%)', 'Text opacity %', 'Corner roundness (%)']) {
      const input = screen.getByLabelText(label);
      fireEvent.focus(input);
      fireEvent.blur(input);
    }
    expect(onPatch).not.toHaveBeenCalled();
    expect(current()).toEqual(source);
  });

  it('locks all decoration controls with the object', async () => {
    const paint = decorated();
    paint.fill!.opacity = 0.123456;
    paint.line!.join = 'miter';
    const { onPatch, source } = setup({ decoration: paint, textOpacity: 0.333333, locked: true });
    for (const label of [
      'Text box shape',
      'Corner roundness (%)',
      'Text box fill',
      'Text box fill color',
      'Fill opacity (%)',
      'Text box outline',
      'Text box outline color',
      'Outline opacity (%)',
      'Outline width (px)',
      'Outline dash',
      'Outline cap',
      'Outline join',
      'Miter limit',
      'Text opacity %',
    ])
      expect(screen.getByLabelText(label).matches(':disabled')).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Text box fill'));
    await user.selectOptions(screen.getByLabelText('Outline dash'), 'solid');
    await user.type(screen.getByLabelText('Outline width (px)'), '8');
    expect(current()).toEqual(source);
    expect(onPatch).not.toHaveBeenCalled();
  });
});

describe('Inspector autofit controls', () => {
  const inspector = () => within(screen.getByLabelText('Slide inspector'));
  it('shows the legacy disabled fitting mode without introducing fitting metadata', () => {
    const { onPatch } = setup();
    expect((screen.getByLabelText('Text fitting') as HTMLSelectElement).value).toBe('none');
    expect(screen.queryByRole('button', { name: 'Recalculate fit' })).toBeNull();
    expect(inspector().queryByRole('status')).toBeNull();
    expect(current()).not.toHaveProperty('autoFit');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('reports imported shrink parameters and recalculates only through the dedicated callback', () => {
    const { source, onPatch, onFit } = setup({
      autoFit: { mode: 'shrink', fontScale: 0.6234, lineSpacingReduction: 0.125 },
    });
    expect((screen.getByLabelText('Text fitting') as HTMLSelectElement).value).toBe('shrink');
    expect(inspector().getByRole('status').textContent).toContain('62.34%');
    expect(inspector().getByRole('status').textContent).toContain('12.5 percentage points');
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate fit' }));
    expect(onFit).toHaveBeenCalledExactlyOnceWith(source);
    expect(onPatch).not.toHaveBeenCalled();
    expect(current()).toEqual(source);
  });

  it('changes fitting modes without rewriting authored text, runs or frame settings', () => {
    const { source } = setup({ frame: sampleFrame() });
    const select = screen.getByLabelText('Text fitting');
    fireEvent.change(select, { target: { value: 'shrink' } });
    expect(current().autoFit).toEqual({ mode: 'shrink', fontScale: 1, lineSpacingReduction: 0 });
    expect(inspector().getByRole('status').textContent).toContain('100%');
    fireEvent.change(select, { target: { value: 'resize' } });
    expect(current().autoFit).toEqual({ mode: 'resize' });
    expect(inspector().queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Recalculate fit' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'none' } });
    expect(current().autoFit).toEqual({ mode: 'none' });
    expect(screen.queryByRole('button', { name: 'Recalculate fit' })).toBeNull();
    expect(current().paragraphs).toEqual(source.paragraphs);
    expect(current().textFrame).toEqual(source.textFrame);
    expect(current().fontSize).toBe(source.fontSize);
  });

  it('explains the minimum scale and prevents locked-object fitting commands', async () => {
    const { onPatch, onFit } = setup({
      locked: true,
      autoFit: { mode: 'shrink', fontScale: 0.01, lineSpacingReduction: 0 },
    });
    expect(screen.getByRole('alert').textContent).toContain('Minimum text scale');
    const select = screen.getByLabelText('Text fitting'),
      recalculate = screen.getByRole('button', { name: 'Recalculate fit' });
    expect(select.matches(':disabled')).toBe(true);
    expect(recalculate.matches(':disabled')).toBe(true);
    const user = userEvent.setup();
    await user.selectOptions(select, 'resize');
    await user.click(recalculate);
    expect(onPatch).not.toHaveBeenCalled();
    expect(onFit).not.toHaveBeenCalled();
  });
});
