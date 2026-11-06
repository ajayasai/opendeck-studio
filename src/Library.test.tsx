import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Library from './Library';
import { createDeck } from './model';
import type { Deck } from './types';

const storage = vi.hoisted(() => ({ listSavedDecks: vi.fn(), loadSavedDeck: vi.fn() }));
vi.mock('./storage', () => storage);

beforeEach(() => {
  storage.listSavedDecks.mockReset().mockResolvedValue([
    {
      id: 'quarterly',
      title: 'Quarterly review',
      slideCount: 4,
      updatedAt: '2026-11-06T00:00:00Z',
    },
    { id: 'workshop', title: 'Design workshop', slideCount: 8, updatedAt: '2026-11-05T00:00:00Z' },
  ]);
  storage.loadSavedDeck.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('local presentation library', () => {
  it('lists and searches saved presentations without opening or changing a deck', async () => {
    const onOpen = vi.fn();
    render(<Library onClose={vi.fn()} onOpen={onOpen} />);
    await screen.findByRole('button', { name: 'Open Quarterly review' });
    expect(screen.getByRole('button', { name: 'Open Design workshop' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search saved presentations'), {
      target: { value: 'WORKSHOP' },
    });
    expect(screen.queryByRole('button', { name: 'Open Quarterly review' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Design workshop' })).toBeTruthy();
    expect(storage.loadSavedDeck).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('loads the requested saved deck before passing it to the editor', async () => {
    const deck = createDeck();
    storage.loadSavedDeck.mockResolvedValue(deck);
    const onOpen = vi.fn(),
      onClose = vi.fn();
    render(<Library onClose={onClose} onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Quarterly review' }));
    await act(async () => {});
    expect(storage.loadSavedDeck).toHaveBeenCalledWith('quarterly');
    expect(onOpen).toHaveBeenCalledWith(deck);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the editor untouched when the saved entry is missing or corrupt', async () => {
    storage.loadSavedDeck.mockResolvedValue(null);
    const onOpen = vi.fn(),
      onClose = vi.fn();
    render(<Library onClose={onClose} onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Quarterly review' }));
    expect((await screen.findByRole('alert')).textContent).toContain('no longer available');
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    storage.loadSavedDeck.mockRejectedValue(new Error('Invalid document version'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Quarterly review' }));
    await act(async () => {});
    expect(screen.getByRole('alert').textContent).toContain('Invalid document version');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not replace the editor if a pending load resolves after the library is closed', async () => {
    let resolveLoad!: (deck: Deck) => void;
    storage.loadSavedDeck.mockImplementation(
      () =>
        new Promise<Deck>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const onOpen = vi.fn();
    const view = render(<Library onClose={vi.fn()} onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Quarterly review' }));
    view.unmount();
    await act(async () => resolveLoad(createDeck()));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows a read failure and lets the user retry', async () => {
    storage.listSavedDecks.mockRejectedValueOnce(new Error('Browser storage is blocked'));
    render(<Library onClose={vi.fn()} onOpen={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Browser storage is blocked');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Open Quarterly review' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
