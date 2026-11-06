import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
