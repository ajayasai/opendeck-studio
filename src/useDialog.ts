import { useEffect, useRef } from 'react';

const shellLocks = new WeakMap<HTMLElement, { count: number; originallyInert: boolean }>();
const selector = 'button, a[href], input, textarea, select, [tabindex]';
function topDialog(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).at(-1);
}
function focusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (
      element.matches(':disabled') ||
      element.tabIndex < 0 ||
      element.closest('[hidden],[inert],[aria-hidden="true"]')
    )
      return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/** Accessible behavior for modal dialogs. Call after rendering a role=dialog surface. */
export function useDialog(open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (shell) {
      const lock = shellLocks.get(shell) ?? {
        count: 0,
        originallyInert: shell.hasAttribute('inert'),
      };
      lock.count += 1;
      shellLocks.set(shell, lock);
      shell.setAttribute('inert', '');
    }
    const dialog = topDialog();
    if (dialog) {
      const first = focusable(dialog)[0];
      if (first) first.focus({ preventScroll: true });
      else {
        dialog.tabIndex = -1;
        dialog.focus({ preventScroll: true });
      }
    }
    const keydown = (event: KeyboardEvent) => {
      const activeDialog = topDialog();
      if (!activeDialog || activeDialog !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const choices = focusable(activeDialog),
        first = choices[0],
        last = choices.at(-1);
      if (!first || !last) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || !activeDialog.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !activeDialog.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      if (shell) {
        const lock = shellLocks.get(shell);
        if (lock && --lock.count === 0) {
          if (!lock.originallyInert) shell.removeAttribute('inert');
          shellLocks.delete(shell);
        }
      }
      if (previous?.isConnected && !previous.closest('[inert]'))
        previous.focus({ preventScroll: true });
    };
  }, [open]);
}
