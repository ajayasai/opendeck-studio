import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeck } from './model';
import { useEditor } from './useEditor';
import type { Deck } from './types';

afterEach(cleanup);

describe('document preparation and history', () => {
  it('publishes an edit and its prepared layout as one undoable snapshot with a synchronous getter', () => {
    const initial = createDeck();
    const prepare = vi.fn((before: Deck, next: Deck) => ({
      ...next,
      title: `${next.title} fitted`,
    }));
    const { result } = renderHook(() => useEditor(() => initial, prepare));
    act(() => {
      result.current.commit((deck) => ({ ...deck, title: 'Edited' }));
      expect(result.current.getCurrentDeck().title).toBe('Edited fitted');
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0][0]).toBe(initial);
    const fitted = result.current.deck;
    act(() => result.current.undo());
    expect(result.current.deck).toBe(initial);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    expect(result.current.deck).toBe(fitted);
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('preserves loaded layout even for the same deck ID and reset bypasses preparation', () => {
    const initial = createDeck(),
      loaded = { ...initial, title: 'Saved layout' };
    const prepare = vi.fn((_: Deck, next: Deck) => next);
    const { result } = renderHook(() => useEditor(() => initial, prepare));
    act(() => result.current.commit(loaded, { preserveLayout: true }));
    expect(result.current.deck.title).toBe('Saved layout');
    act(() => result.current.undo());
    expect(result.current.deck).toBe(initial);
    act(() => result.current.redo());
    expect(result.current.deck.title).toBe('Saved layout');
    act(() => result.current.reset(loaded));
    expect(result.current.deck).toBe(loaded);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not alter current or history on preparation failure and keeps redo available', () => {
    const initial = createDeck();
    const prepare = vi.fn((_: Deck, next: Deck) => next);
    const { result } = renderHook(() => useEditor(() => initial, prepare));
    act(() => result.current.commit({ ...initial, title: 'Recoverable' }));
    const recoverable = result.current.deck;
    act(() => result.current.undo());
    prepare.mockImplementationOnce(() => {
      throw new Error('Measurement failed');
    });
    act(() =>
      expect(() => result.current.commit({ ...initial, title: 'Failed' })).toThrow(
        'Measurement failed',
      ),
    );
    expect(result.current.getCurrentDeck()).toBe(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.deck).toBe(recoverable);
  });

  it('uses the latest prepare callback without changing commit identity and skips identity no-ops', () => {
    const initial = createDeck(),
      oldPrepare = vi.fn((_: Deck, next: Deck) => next);
    const nextPrepare = vi.fn((_: Deck, next: Deck) => ({ ...next, title: 'New preparation' }));
    const { result, rerender } = renderHook(({ prepare }) => useEditor(() => initial, prepare), {
      initialProps: { prepare: oldPrepare },
    });
    const commit = result.current.commit;
    rerender({ prepare: nextPrepare });
    expect(result.current.commit).toBe(commit);
    act(() => result.current.commit((deck) => deck));
    expect(result.current.canUndo).toBe(false);
    expect(nextPrepare).not.toHaveBeenCalled();
    act(() => result.current.commit({ ...initial, title: 'Edit' }));
    expect(result.current.deck.title).toBe('New preparation');
    expect(nextPrepare).toHaveBeenCalledOnce();
    expect(oldPrepare).not.toHaveBeenCalled();
  });
});
