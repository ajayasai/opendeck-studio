import type { Deck } from './types';
import { validateDeck } from './model';

const DB_NAME = 'opendeck-studio';
const STORE = 'presentations';
const KEY = 'current';
const FALLBACK_KEY = 'opendeck-studio:current:v1';
const DECK_PREFIX = 'deck:';
const SUMMARY_PREFIX = 'summary:';
const FALLBACK_PREFIX = 'opendeck-studio:';

export interface SavedDeckSummary {
  id: string;
  title: string;
  slideCount: number;
  updatedAt: string;
}
const summary = (deck: Deck): SavedDeckSummary => ({
  id: deck.id,
  title: deck.title,
  slideCount: deck.slides.length,
  updatedAt: deck.updatedAt,
});
const validSummary = (value: unknown): value is SavedDeckSummary => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.title === 'string' &&
    Number.isInteger(item.slideCount) &&
    (item.slideCount as number) > 0 &&
    typeof item.updatedAt === 'string' &&
    Number.isFinite(Date.parse(item.updatedAt))
  );
};
const sorted = (items: SavedDeckSummary[]): SavedDeckSummary[] => {
  const unique = new Map<string, SavedDeckSummary>();
  for (const item of items) {
    const existing = unique.get(item.id);
    if (!existing || Date.parse(item.updatedAt) >= Date.parse(existing.updatedAt))
      unique.set(item.id, item);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
};

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Browser storage could not be opened.'));
    request.onblocked = () =>
      reject(
        new Error(
          'Browser storage is blocked by another OpenDeck window. Close that window and try again.',
        ),
      );
  });
}

function storageError(error: unknown): Error {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'QuotaExceededError')
    return new Error(
      'Browser storage is full. Download an OpenDeck file now to keep your changes, then free some browser storage.',
    );
  return new Error(
    'Autosave is unavailable in this browser. Download an OpenDeck file to keep your changes.',
    { cause: error },
  );
}

export async function loadDeck(): Promise<Deck | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    if (!db) {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? validateDeck(JSON.parse(raw)) : null;
    }
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = db!.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return raw === undefined ? null : validateDeck(raw);
  } finally {
    db?.close();
  }
}

export async function saveDeck(deck: Deck): Promise<void> {
  const safeDeck = validateDeck(deck);
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    if (!db) {
      // Archive first: localStorage has no transactions. If a later write fails,
      // the previous current deck is still readable and existing archives survive.
      const previous = localStorage.getItem(FALLBACK_KEY);
      if (previous) {
        try {
          const old = validateDeck(JSON.parse(previous));
          if (old.id !== safeDeck.id) {
            localStorage.setItem(FALLBACK_PREFIX + DECK_PREFIX + old.id, JSON.stringify(old));
            localStorage.setItem(
              FALLBACK_PREFIX + SUMMARY_PREFIX + old.id,
              JSON.stringify(summary(old)),
            );
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'QuotaExceededError') throw error;
        }
      }
      const serialized = JSON.stringify(safeDeck);
      localStorage.setItem(FALLBACK_PREFIX + DECK_PREFIX + safeDeck.id, serialized);
      localStorage.setItem(
        FALLBACK_PREFIX + SUMMARY_PREFIX + safeDeck.id,
        JSON.stringify(summary(safeDeck)),
      );
      localStorage.setItem(FALLBACK_KEY, serialized);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const previous = store.get(KEY);
      previous.onsuccess = () => {
        // Also migrate a deck saved before the library existed.
        if (previous.result) {
          try {
            const old = validateDeck(previous.result);
            if (old.id !== safeDeck.id) {
              store.put(old, DECK_PREFIX + old.id);
              store.put(summary(old), SUMMARY_PREFIX + old.id);
            }
          } catch {
            /* A deliberate new/open action may replace a damaged current copy. */
          }
        }
        store.put(safeDeck, DECK_PREFIX + safeDeck.id);
        store.put(summary(safeDeck), SUMMARY_PREFIX + safeDeck.id);
        store.put(safeDeck, KEY);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Save was interrupted.'));
    });
  } catch (error) {
    throw storageError(error);
  } finally {
    db?.close();
  }
}

export async function loadSavedDeck(id: string): Promise<Deck | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    if (!db) {
      const raw = localStorage.getItem(FALLBACK_PREFIX + DECK_PREFIX + id);
      if (raw) return validateDeck(JSON.parse(raw));
      const current = await loadDeck();
      return current?.id === id ? current : null;
    }
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = db!.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const request = store.get(DECK_PREFIX + id);
      request.onsuccess = () => {
        if (request.result !== undefined) {
          resolve(request.result);
          return;
        }
        const current = store.get(KEY);
        current.onsuccess = () => resolve(current.result?.id === id ? current.result : undefined);
        current.onerror = () => reject(current.error);
      };
      request.onerror = () => reject(request.error);
    });
    return raw === undefined ? null : validateDeck(raw);
  } finally {
    db?.close();
  }
}

export async function listSavedDecks(): Promise<SavedDeckSummary[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    if (!db) {
      const items: SavedDeckSummary[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(FALLBACK_PREFIX + SUMMARY_PREFIX)) continue;
        try {
          const item: unknown = JSON.parse(localStorage.getItem(key)!);
          if (validSummary(item)) items.push(item);
        } catch {
          /* Ignore corrupt summaries; preserve their source data. */
        }
      }
      try {
        const current = await loadDeck();
        if (current) items.push(summary(current));
      } catch {
        /* A damaged current deck must not hide other library entries. */
      }
      return sorted(items);
    }
    return await new Promise<SavedDeckSummary[]>((resolve, reject) => {
      const transaction = db!.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const items: SavedDeckSummary[] = [];
      const request = store.getAll(IDBKeyRange.bound(SUMMARY_PREFIX, SUMMARY_PREFIX + '\uffff'));
      request.onsuccess = () => items.push(...request.result.filter(validSummary));
      const current = store.get(KEY);
      current.onsuccess = () => {
        try {
          if (current.result) items.push(summary(validateDeck(current.result)));
        } catch {
          /* Keep usable library entries available. */
        }
      };
      transaction.oncomplete = () => resolve(sorted(items));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Library loading was interrupted.'));
    });
  } finally {
    db?.close();
  }
}
