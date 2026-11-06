import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RichTextEditor from './RichTextEditor';
import { createElement, THEMES } from './model';
import { withParagraphs } from './richText';

beforeEach(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('rich text modal', () => {
  it('keeps a numeric draft focused through Save mousedown, then flushes and closes on the same click', async () => {
    const element = withParagraphs(createElement('text', THEMES[0]), [
      { runs: [{ text: 'Pending exact spacing' }], lineSpacingPoints: 36 },
    ]);
    const original = structuredClone(element),
      onSave = vi.fn(),
      onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <RichTextEditor
          element={element}
          onSave={onSave}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null;
    }
    render(<Harness />);
    await screen.findByRole('textbox', { name: 'Rich text content' });
    const user = userEvent.setup();
    const input = screen.getByLabelText('Line spacing (pt)') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '48');
    expect(document.activeElement).toBe(input);
    const save = screen.getByRole('button', { name: 'Save text' });
    await user.pointer({ target: save, keys: '[MouseLeft>]' });
    // A default focus transfer here would run NumericSetting.onBlur and the
    // editor's focus/scroll command before the browser has delivered the click.
    expect(document.activeElement).toBe(input);
    expect(onSave).not.toHaveBeenCalled();
    await user.pointer({ keys: '[/MouseLeft]' });
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0].paragraphs[0]).toMatchObject({ lineSpacingPoints: 48 });
    expect(onSave.mock.calls[0][0].paragraphs[0]).not.toHaveProperty('lineSpacing');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(element).toEqual(original);
  });

  it('keeps imported exact zero spacing and saved shrink parameters on a no-op Save', async () => {
    const element = withParagraphs(
      {
        ...createElement('text', THEMES[0]),
        autoFit: { mode: 'shrink' as const, fontScale: 0.63, lineSpacingReduction: 0.11 },
      },
      [{ runs: [{ text: 'Keep authored sizes', fontSize: 24 }], lineSpacingPoints: 0 }],
    );
    const original = structuredClone(element),
      onSave = vi.fn();
    render(<RichTextEditor element={element} onSave={onSave} onClose={vi.fn()} />);
    await screen.findByRole('textbox', { name: 'Rich text content' });
    expect((screen.getByLabelText('Line spacing mode') as HTMLSelectElement).value).toBe('points');
    const points = screen.getByLabelText('Line spacing (pt)') as HTMLInputElement;
    expect(points.value).toBe('0');
    fireEvent.focus(points);
    fireEvent.blur(points);
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0];
    expect(saved.autoFit).toEqual(element.autoFit);
    expect(saved.paragraphs[0]).toMatchObject({
      lineSpacingPoints: 0,
      runs: [{ text: 'Keep authored sizes', fontSize: 24 }],
    });
    expect(saved.paragraphs[0]).not.toHaveProperty('lineSpacing');
    expect(element).toEqual(original);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('switches exact and relative spacing while clearing the alternate value and accepting exact zero', async () => {
    const element = withParagraphs({ ...createElement('text', THEMES[0]), fontSize: 20 }, [
      { runs: [{ text: 'Spacing mode' }], lineSpacingPoints: 30 },
    ]);
    const onSave = vi.fn();
    render(<RichTextEditor element={element} onSave={onSave} onClose={vi.fn()} />);
    await screen.findByRole('textbox', { name: 'Rich text content' });
    const mode = screen.getByLabelText('Line spacing mode');
    fireEvent.change(mode, { target: { value: 'relative' } });
    expect((screen.getByLabelText('Line spacing') as HTMLInputElement).value).toBe('1.5');
    const multiple = screen.getByLabelText('Line spacing');
    fireEvent.change(multiple, { target: { value: '2' } });
    fireEvent.blur(multiple);
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(onSave.mock.calls[0][0].paragraphs[0]).toMatchObject({ lineSpacing: 2 });
    expect(onSave.mock.calls[0][0].paragraphs[0]).not.toHaveProperty('lineSpacingPoints');
    fireEvent.change(mode, { target: { value: 'points' } });
    expect((screen.getByLabelText('Line spacing (pt)') as HTMLInputElement).value).toBe('40');
    const points = screen.getByLabelText('Line spacing (pt)');
    fireEvent.change(points, { target: { value: '0' } });
    fireEvent.blur(points);
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(onSave.mock.calls[1][0].paragraphs[0]).toMatchObject({ lineSpacingPoints: 0 });
    expect(onSave.mock.calls[1][0].paragraphs[0]).not.toHaveProperty('lineSpacing');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens real editable content and saves a rich document only when Save is chosen', async () => {
    const element = withParagraphs(createElement('text', THEMES[0]), [
      {
        runs: [
          { text: 'A rich idea', bold: true },
          { text: ' with a link', hyperlink: 'https://example.com' },
        ],
        lineSpacing: 1.5,
      },
    ]);
    const original = structuredClone(element),
      onSave = vi.fn(),
      onClose = vi.fn();
    render(<RichTextEditor element={element} onSave={onSave} onClose={onClose} />);
    const content = await screen.findByRole('textbox', { name: 'Rich text content' });
    expect(content.getAttribute('contenteditable')).toBe('true');
    expect(content.textContent).toBe('A rich idea with a link');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].text).toBe(element.text);
    expect(onSave.mock.calls[0][0].paragraphs[0].lineSpacing).toBe(1.5);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(element).toEqual(original);
  });

  it('cancels without saving, including through Escape', async () => {
    const onSave = vi.fn(),
      onClose = vi.fn();
    render(
      <RichTextEditor
        element={createElement('text', THEMES[0])}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    await screen.findByRole('textbox', { name: 'Rich text content' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows an inline error for an unsafe link without saving the element', async () => {
    const onSave = vi.fn();
    render(
      <RichTextEditor
        element={createElement('text', THEMES[0])}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('textbox', { name: 'Rich text content' });
    fireEvent.click(screen.getByRole('button', { name: 'Add or edit hyperlink' }));
    fireEvent.change(screen.getByLabelText('Hyperlink URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Other protocols are not supported'),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the editor selection while toolbar font, size, and color inputs take focus', async () => {
    const onSave = vi.fn();
    render(
      <RichTextEditor
        element={createElement('text', THEMES[0])}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    const content = await screen.findByRole('textbox', { name: 'Rich text content' });
    fireEvent.keyDown(content, { key: 'a', ctrlKey: true });
    fireEvent.change(screen.getByLabelText('Selected font'), { target: { value: 'Georgia' } });
    const size = screen.getByLabelText('Selected size (pt)');
    fireEvent.change(size, { target: { value: '19' } });
    fireEvent.blur(size);
    fireEvent.change(screen.getByLabelText('Selected color'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    const runs = onSave.mock.calls[0][0].paragraphs[0].runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      text: 'Your next big idea',
      fontFamily: 'Georgia',
      fontSize: 19,
      color: '#ff0000',
    });
  });

  it('previews white text against the supplied slide background', async () => {
    const element = { ...createElement('text', THEMES[0]), color: '#ffffff' };
    render(
      <RichTextEditor element={element} background="#123456" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const content = await screen.findByRole('textbox', { name: 'Rich text content' });
    expect((content.closest('.rich-editor-area') as HTMLElement).style.backgroundColor).toBe(
      'rgb(18, 52, 86)',
    );
    expect((content.querySelector('span') as HTMLElement).style.color).toBe('rgb(255, 255, 255)');
  });

  it('keeps white text readable on an opaque dark text-box fill over a white slide and preserves the paints on Save', async () => {
    const element = {
      ...createElement('text', THEMES[0]),
      color: '#ffffff',
      textOpacity: 0.6,
      decoration: {
        shape: 'roundRect' as const,
        cornerRadius: 0.25,
        fill: { color: '#123456', opacity: 1 },
        line: { color: '#ffcc00', opacity: 0.5, width: 4, dash: 'dot' as const },
      },
    };
    const original = structuredClone(element),
      onSave = vi.fn();
    render(
      <RichTextEditor element={element} background="#ffffff" onSave={onSave} onClose={vi.fn()} />,
    );
    const content = await screen.findByRole('textbox', { name: 'Rich text content' });
    expect((content.closest('.rich-editor-area') as HTMLElement).style.backgroundColor).toBe(
      'rgb(18, 52, 86)',
    );
    expect((content.querySelector('span') as HTMLElement).style.color).toBe('rgb(255, 255, 255)');
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({
      decoration: original.decoration,
      opacity: original.opacity,
      textOpacity: 0.6,
      text: original.text,
    });
    expect(element).toEqual(original);
  });

  it('previews partially transparent decoration over the actual slide background', async () => {
    const element = {
      ...createElement('text', THEMES[0]),
      opacity: 0.5,
      decoration: { shape: 'rect' as const, fill: { color: '#000000', opacity: 0.5 }, line: null },
    };
    render(
      <RichTextEditor element={element} background="#ffffff" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const content = await screen.findByRole('textbox', { name: 'Rich text content' });
    expect((content.closest('.rich-editor-area') as HTMLElement).style.backgroundColor).toBe(
      'rgb(191, 191, 191)',
    );
    expect(element.decoration.fill.opacity).toBe(0.5);
    expect(element.opacity).toBe(0.5);
  });

  it('reports legacy text exceeding the rich paragraph capacity without crashing or changing it', async () => {
    const element = { ...createElement('text', THEMES[0]), text: '\n'.repeat(5000) };
    const onSave = vi.fn();
    render(<RichTextEditor element={element} onSave={onSave} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('5,000 paragraphs');
    expect((screen.getByRole('button', { name: 'Save text' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(element.text).toHaveLength(5000);
  });
});
