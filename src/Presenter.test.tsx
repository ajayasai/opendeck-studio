import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Presenter from './Presenter';
import { createDeck } from './model';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let activeFullscreen: Element | null;
let request: ReturnType<typeof vi.fn>, exit: ReturnType<typeof vi.fn>;
let previousElement: PropertyDescriptor | undefined,
  previousRequest: PropertyDescriptor | undefined,
  previousExit: PropertyDescriptor | undefined;
const fullscreenChanged = () => document.dispatchEvent(new Event('fullscreenchange'));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  activeFullscreen = null;
  previousElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  previousRequest = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen');
  previousExit = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => activeFullscreen,
  });
  request = vi.fn(function (this: HTMLElement) {
    activeFullscreen = this;
    fullscreenChanged();
    return Promise.resolve();
  });
  exit = vi.fn(() => {
    activeFullscreen = null;
    fullscreenChanged();
    return Promise.resolve();
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    writable: true,
    value: request,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    writable: true,
    value: exit,
  });
});
afterEach(() => {
  cleanup();
  for (const [object, key, original] of [
    [document, 'fullscreenElement', previousElement],
    [HTMLElement.prototype, 'requestFullscreen', previousRequest],
    [document, 'exitFullscreen', previousExit],
  ] as const) {
    if (original) Object.defineProperty(object, key, original);
    else Reflect.deleteProperty(object, key);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const open = () => render(<Presenter deck={createDeck()} start={0} onClose={vi.fn()} />);
async function toggle(label = 'Enter fullscreen') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
}

describe('presenter fullscreen state and failure handling', () => {
  it('requests only its own surface and reflects successful entry and exit in the toggle', async () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Presentation' });
    await toggle();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.contexts[0]).toBe(dialog);
    expect(activeFullscreen).toBe(dialog);
    expect(
      screen.getByRole('button', { name: 'Exit fullscreen' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await toggle('Exit fullscreen');
    expect(exit).toHaveBeenCalledOnce();
    expect(activeFullscreen).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Enter fullscreen' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('observes browser-driven fullscreen changes instead of retaining stale toggle state', async () => {
    const view = open();
    await toggle();
    act(() => {
      activeFullscreen = null;
      fullscreenChanged();
    });
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
    view.unmount();
    expect(exit).not.toHaveBeenCalled();
  });

  it('explains a denied request and keeps presentation navigation usable', async () => {
    request.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    open();
    await toggle();
    const message = screen.getByRole('alert');
    expect(message.textContent).toContain('browser did not allow fullscreen');
    expect(
      screen.getByRole('button', { name: 'Enter fullscreen' }).getAttribute('aria-describedby'),
    ).toBe(message.id);
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByText('2 / 5')).toBeTruthy();
  });

  it('reports unsupported browsers and requests that resolve without entering fullscreen', async () => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const view = open();
    await toggle();
    expect(screen.getByRole('alert').textContent).toContain('not available in this browser');
    view.unmount();
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    open();
    await toggle();
    expect(screen.getByRole('alert').textContent).toContain('browser did not allow fullscreen');
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
  });

  it('reports an exit failure without falsely switching to the Enter state', async () => {
    open();
    await toggle();
    exit.mockRejectedValue(new DOMException('Exit denied', 'InvalidStateError'));
    await toggle('Exit fullscreen');
    expect(screen.getByRole('alert').textContent).toContain('browser did not leave fullscreen');
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });

  it('exits owned fullscreen on close and leaves unrelated fullscreen alone', async () => {
    const owned = open();
    await toggle();
    owned.unmount();
    expect(exit).toHaveBeenCalledOnce();
    exit.mockClear();
    activeFullscreen = document.body;
    const unrelated = open();
    unrelated.unmount();
    expect(exit).not.toHaveBeenCalled();
    expect(activeFullscreen).toBe(document.body);
  });

  it('cleans up a fullscreen request that finishes after the presenter was closed', async () => {
    let finish!: () => void;
    let requestedTarget!: HTMLElement;
    request.mockImplementation(function (this: HTMLElement) {
      requestedTarget = this;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const view = open();
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    view.unmount();
    await act(async () => {
      activeFullscreen = requestedTarget;
      finish();
    });
    expect(exit).toHaveBeenCalledOnce();
    expect(activeFullscreen).toBeNull();
  });
});
