import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createDeck } from './model';
import { listSavedDecks, loadDeck, loadSavedDeck, saveDeck } from './storage';
import type { Deck } from './types';

describe('browser persistence fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('returns null before a first save and restores a complete deck', async () => {
    expect(await loadDeck()).toBeNull();
    const deck = createDeck();
    await saveDeck(deck);
    expect(await loadDeck()).toEqual(deck);
  });
  it('surfaces invalid stored data rather than silently replacing it', async () => {
    localStorage.setItem('opendeck-studio:current:v1', '{"schemaVersion":99}');
    await expect(loadDeck()).rejects.toThrow('version');
    expect(localStorage.getItem('opendeck-studio:current:v1')).toContain('99');
  });
  it('explains how to recover from a quota failure', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota full', 'QuotaExceededError');
    });
    await expect(saveDeck(createDeck())).rejects.toThrow('Download an OpenDeck file now');
  });
  it('does not overwrite a valid save with an invalid document', async () => {
    const deck = createDeck();
    await saveDeck(deck);
    await expect(saveDeck({ ...deck, slides: [] })).rejects.toThrow('1–500');
    expect(await loadDeck()).toEqual(deck);
  });
  it('keeps earlier decks in the library after saving a new deck', async () => {
    const previous = createDeck();
    previous.title = 'Earlier story';
    await saveDeck(previous);
    const next = createDeck();
    next.title = 'Next story';
    await saveDeck(next);
    expect(await loadDeck()).toEqual(next);
    expect(await loadSavedDeck(previous.id)).toEqual(previous);
    expect(await loadSavedDeck(next.id)).toEqual(next);
    expect((await listSavedDecks()).map((item) => item.title).sort()).toEqual([
      'Earlier story',
      'Next story',
    ]);
  });
  it('preserves the previous current deck if a later fallback write runs out of space', async () => {
    const previous = createDeck();
    await saveDeck(previous);
    const next = createDeck();
    next.title = 'New work';
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'opendeck-studio:current:v1')
        throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    await expect(saveDeck(next)).rejects.toThrow('Browser storage is full');
    expect(await loadDeck()).toEqual(previous);
    expect(await loadSavedDeck(previous.id)).toEqual(previous);
    expect(await loadSavedDeck(next.id)).toEqual(next);
  });
});

async function seedLegacyCurrent(deck: Deck) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('opendeck-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('presentations');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result,
        transaction = db.transaction('presentations', 'readwrite');
      transaction.objectStore('presentations').put(deck, 'current');
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

describe('IndexedDB transactions and presentation library', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('round-trips a complete document using real IndexedDB requests and transactions', async () => {
    expect(await loadDeck()).toBeNull();
    expect(await listSavedDecks()).toEqual([]);
    const deck = createDeck();
    await saveDeck(deck);
    expect(await loadDeck()).toEqual(deck);
    expect(await loadSavedDeck(deck.id)).toEqual(deck);
    expect(await loadSavedDeck('missing')).toBeNull();
  });
  it('retains multiple decks, updates one without duplication, and lists most recently changed first', async () => {
    const old = createDeck();
    old.updatedAt = '2026-01-01T00:00:00.000Z';
    old.title = 'First';
    const next = createDeck();
    next.updatedAt = '2026-02-01T00:00:00.000Z';
    next.title = 'Second';
    await saveDeck(old);
    await saveDeck(next);
    expect((await listSavedDecks()).map((item) => item.title)).toEqual(['Second', 'First']);
    expect(await loadSavedDeck(old.id)).toEqual(old);
    old.title = 'First, revised';
    old.updatedAt = '2026-03-01T00:00:00.000Z';
    await saveDeck(old);
    const library = await listSavedDecks();
    expect(library).toHaveLength(2);
    expect(library[0]).toEqual({
      id: old.id,
      title: old.title,
      slideCount: 5,
      updatedAt: old.updatedAt,
    });
    expect(await loadSavedDeck(next.id)).toEqual(next);
  });
  it('discovers a legacy current-only save and archives it before a new deck replaces current', async () => {
    const legacy = createDeck();
    legacy.title = 'Legacy work';
    await seedLegacyCurrent(legacy);
    expect((await listSavedDecks())[0].id).toBe(legacy.id);
    expect(await loadSavedDeck(legacy.id)).toEqual(legacy);
    const fresh = createDeck();
    await saveDeck(fresh);
    expect(await loadDeck()).toEqual(fresh);
    expect(await loadSavedDeck(legacy.id)).toEqual(legacy);
    expect(await listSavedDecks()).toHaveLength(2);
  });
  it('rolls back current, archive, and summary together when a save transaction aborts', async () => {
    const previous = createDeck();
    await saveDeck(previous);
    const next = createDeck();
    next.title = 'Interrupted save';
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      const request = put.call(this, value, key);
      if (key === 'current' && value.id === next.id) this.transaction.abort();
      return request;
    });
    await expect(saveDeck(next)).rejects.toThrow('Autosave is unavailable');
    expect(await loadDeck()).toEqual(previous);
    expect(await loadSavedDeck(previous.id)).toEqual(previous);
    expect(await loadSavedDeck(next.id)).toBeNull();
    expect((await listSavedDecks()).map((item) => item.id)).toEqual([previous.id]);
  });
});
