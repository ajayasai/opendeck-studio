import { useCallback, useRef, useState } from 'react';
import type { Deck } from './types';

export interface CommitOptions {
  /** Loading a saved document preserves its recorded fitting results, even for the same ID. */
  preserveLayout?: boolean;
}
export type PrepareDocument = (before: Deck, next: Deck) => Deck;

/** History stores immutable document snapshots; a complete drag is one command. */
export function useEditor(initial: () => Deck, prepare?: PrepareDocument) {
  const [deck, setDeck] = useState(initial),
    current = useRef(deck),
    past = useRef<Deck[]>([]),
    future = useRef<Deck[]>([]);
  const [, tick] = useState(0);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const commit = useCallback((update: Deck | ((d: Deck) => Deck), options?: CommitOptions) => {
    const before = current.current,
      proposed = typeof update === 'function' ? update(before) : update;
    if (proposed === before) return;
    // Prepare before changing history/current so an unsuccessful fit cannot publish half an edit.
    const next = options?.preserveLayout
      ? proposed
      : (prepareRef.current?.(before, proposed) ?? proposed);
    if (next === before) return;
    past.current = [...past.current.slice(-79), before];
    future.current = [];
    const result = { ...next, updatedAt: new Date().toISOString() };
    current.current = result;
    setDeck(result);
  }, []);
  const reset = useCallback((next: Deck) => {
    current.current = next;
    past.current = [];
    future.current = [];
    setDeck(next);
  }, []);
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    current.current = previous;
    setDeck(previous);
    tick((v) => v + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    current.current = next;
    setDeck(next);
    tick((v) => v + 1);
  }, []);
  const getCurrentDeck = useCallback(() => current.current, []);
  return {
    deck,
    commit,
    reset,
    undo,
    redo,
    getCurrentDeck,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
