import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createDeck, createElement, createSlide, validateDeck } from './model';
import { flattenElements } from './groups';
import type { Deck, GroupElement } from './types';

const persistence = vi.hoisted(() => ({
  loadDeck: vi.fn(),
  saveDeck: vi.fn(),
  listSavedDecks: vi.fn(),
  loadSavedDeck: vi.fn(),
}));
vi.mock('./storage', () => persistence);
class TestResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe() {
    this.callback(
      [{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}
function fixture() {
  const deck = createDeck();
  const slide = createSlide(deck.theme);
  const text = {
    ...createElement('text', deck.theme),
    name: 'Inside story',
    text: 'Original story',
    x: 110,
    y: 240,
    width: 150,
    height: 60,
  };
  const shape = {
    ...createElement('shape', deck.theme),
    name: 'Inside block',
    x: 310,
    y: 240,
    width: 100,
    height: 80,
  };
  const group: GroupElement = {
    ...createElement('group', deck.theme),
    type: 'group',
    name: 'Story group',
    x: 200,
    y: 100,
    width: 400,
    height: 200,
    rotation: 0,
    childFrame: { x: 100, y: 200, width: 400, height: 200 },
    children: [text, shape],
  };
  slide.elements = [group];
  deck.slides = [slide];
  return validateDeck(deck);
}
beforeEach(() => {
  persistence.loadDeck.mockReset().mockResolvedValue(fixture());
  persistence.saveDeck.mockReset().mockResolvedValue(undefined);
  persistence.listSavedDecks.mockReset().mockResolvedValue([]);
  persistence.loadSavedDeck.mockReset().mockResolvedValue(null);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function boot(deck?: Deck) {
  if (deck) persistence.loadDeck.mockResolvedValue(deck);
  render(<App />);
  await act(async () => {});
}
async function save(): Promise<Deck> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
  return persistence.saveDeck.mock.calls.at(-1)![0];
}
const key = (value: string, shiftKey = false) =>
  fireEvent.keyDown(window, { key: value, ctrlKey: true, shiftKey });
const openGroup = () =>
  fireEvent.doubleClick(screen.getByRole('button', { name: 'group: Story group' }));
const choose = (name: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: ' ' });
function deferredImage() {
  let resolve!: () => void;
  const src = createElement('image', fixture().theme).src;
  class Reader {
    result = src;
    onload: (() => void) | null = null;
    readAsDataURL() {
      void Promise.resolve().then(() => this.onload?.());
    }
  }
  class Image {
    src = '';
    naturalWidth = 400;
    naturalHeight = 200;
    decode() {
      return new Promise<void>((done) => {
        resolve = done;
      });
    }
  }
  vi.stubGlobal('FileReader', Reader);
  vi.stubGlobal('Image', Image);
  return () => resolve();
}
async function startPicture() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Insert image file'), {
      target: { files: [new File(['raster'], 'deferred.png', { type: 'image/png' })] },
    });
  });
}

describe('group authoring and recovery', () => {
  it('uses outer extents as an editing viewport for zero child axes without changing saved frames', async () => {
    const deck = fixture();
    const group = deck.slides[0].elements[0] as GroupElement;
    group.childFrame.width = 0;
    group.childFrame.height = 0;
    await boot(deck);
    openGroup();
    const canvas = screen.getByTestId('slide-canvas');
    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('200px');
    expect(screen.getByRole('button', { name: 'text: Inside story' }).style.left).toBe('10px');
    expect((await save()).slides[0].elements).toEqual(deck.slides[0].elements);
  });
  it('inserts a deferred picture into its original group without selecting it in a different scope', async () => {
    const decode = deferredImage();
    await boot();
    openGroup();
    await startPicture();
    fireEvent.click(screen.getByRole('button', { name: 'Back to slide' }));
    key('a');
    await act(async () => decode());
    expect(screen.getByLabelText('Object name')).toHaveProperty('value', 'Story group');
    const group = (await save()).slides[0].elements[0] as GroupElement;
    expect(group.children.map((e) => e.type)).toEqual(['text', 'shape', 'image']);
    expect(group.children[2].x).toBeGreaterThanOrEqual(group.childFrame.x);
  });
  it('discards a deferred picture when its ancestor group becomes locked', async () => {
    const decode = deferredImage();
    await boot();
    openGroup();
    await startPicture();
    fireEvent.click(screen.getByRole('button', { name: 'Back to slide' }));
    key('a');
    fireEvent.click(screen.getByRole('button', { name: 'Lock selected objects' }));
    await act(async () => decode());
    expect(screen.getByRole('status').textContent).toContain('group is no longer available');
    const group = (await save()).slides[0].elements[0] as GroupElement;
    expect(group.locked).toBe(true);
    expect(group.children).toHaveLength(2);
  });
  it('edits child coordinates without flattening the group, and retains the edit through undo/redo and save', async () => {
    await boot();
    openGroup();
    expect(screen.getByRole('navigation', { name: 'Group editing path' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'text: Inside story' }).style.left).toBe('10px');
    choose('shape: Inside block');
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '333' } });
    fireEvent.blur(screen.getByLabelText('X'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to slide' }));
    let deck = await save();
    expect(deck.slides[0].elements[0]).toMatchObject({
      type: 'group',
      x: 200,
      childFrame: { x: 100 },
      children: [{ text: 'Original story' }, { x: 333 }],
    });
    key('z');
    deck = await save();
    expect((deck.slides[0].elements[0] as GroupElement).children[1].x).toBe(310);
    key('z', true);
    deck = await save();
    expect((deck.slides[0].elements[0] as GroupElement).children[1].x).toBe(333);
    expect(validateDeck(deck)).toEqual(deck);
  });
  it('groups sibling selection and safely ungroups it as single undoable commands', async () => {
    const deck = fixture();
    const original = (deck.slides[0].elements[0] as GroupElement).children;
    deck.slides[0].elements = original;
    await boot(deck);
    key('a');
    key('g');
    expect(screen.getByRole('button', { name: 'group: Group' })).toBeTruthy();
    let stored = await save();
    expect((stored.slides[0].elements[0] as GroupElement).children).toEqual(original);
    key('g', true);
    stored = await save();
    expect(stored.slides[0].elements).toEqual(original);
    key('z');
    expect(screen.getByRole('button', { name: 'group: Group' })).toBeTruthy();
  });
  it('creates nested groups, edits a text draft before leaving, and clones all descendant IDs', async () => {
    await boot();
    openGroup();
    key('a');
    key('g');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'group: Group' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'text: Inside story' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit text on slide' }), {
      target: { value: 'Nested story' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to slide' }));
    // Select the outer group through the layer list without opening it.
    fireEvent.click(screen.getByRole('tab', { name: 'Layers' }));
    fireEvent.click(screen.getByText('Story group', { selector: '.layer-name' }));
    key('d');
    const deck = await save();
    expect(deck.slides[0].elements).toHaveLength(2);
    const all = flattenElements(deck.slides[0].elements);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect(all.filter((e) => e.type === 'text').map((e) => e.text)).toEqual([
      'Nested story',
      'Nested story',
    ]);
    expect(validateDeck(deck)).toEqual(deck);
  });
  it('leaves scaled groups intact and explains the ungroup boundary', async () => {
    const deck = fixture();
    deck.slides[0].elements[0].width = 800;
    await boot(deck);
    key('a');
    key('g', true);
    expect(screen.getByRole('status').textContent).toContain('scaling or flips');
    expect((await save()).slides[0].elements).toEqual(deck.slides[0].elements);
  });
  it('does not enter a locked group and does not group locked members', async () => {
    const deck = fixture();
    deck.slides[0].elements[0].locked = true;
    await boot(deck);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'group: Story group (locked)' }));
    expect(screen.queryByRole('navigation', { name: 'Group editing path' })).toBeNull();
    key('a');
    key('g');
    expect((await save()).slides[0].elements).toEqual(deck.slides[0].elements);
  });
  it('keeps insert, delete, and select-all inside the current group', async () => {
    await boot();
    openGroup();
    key('a');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: 'shape: Inside block' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const deck = await save();
    const group = deck.slides[0].elements[0] as GroupElement;
    expect(deck.slides[0].elements).toHaveLength(1);
    expect(group.children).toHaveLength(1);
    expect(group.children[0].type).toBe('text');
    expect(group.children[0].x).toBeGreaterThanOrEqual(group.childFrame.x);
    expect(group.children[0].y).toBeGreaterThanOrEqual(group.childFrame.y);
  });
});
