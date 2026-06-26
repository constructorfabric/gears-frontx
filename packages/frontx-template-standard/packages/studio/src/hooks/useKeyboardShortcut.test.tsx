import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcut } from './useKeyboardShortcut';

describe('useKeyboardShortcut', () => {
  it('fires only for Shift+Backquote and prevents the browser default', () => {
    const handler = vi.fn();

    renderHook(() => {
      useKeyboardShortcut(handler);
    });

    const shortcutEvent = new KeyboardEvent('keydown', {
      code: 'Backquote',
      shiftKey: true,
      cancelable: true,
    });
    const repeatedShortcutEvent = new KeyboardEvent('keydown', {
      code: 'Backquote',
      shiftKey: true,
      cancelable: true,
    });

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', shiftKey: true }));
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', shiftKey: false }));
      globalThis.dispatchEvent(shortcutEvent);
      globalThis.dispatchEvent(repeatedShortcutEvent);
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(shortcutEvent.defaultPrevented).toBe(true);
    expect(repeatedShortcutEvent.defaultPrevented).toBe(true);
  });

  it('uses the latest handler after rerender', () => {
    const initialHandler = vi.fn();
    const nextHandler = vi.fn();

    const { rerender } = renderHook(
      ({ handler }: { handler: () => void }) => {
        useKeyboardShortcut(handler);
      },
      {
        initialProps: { handler: initialHandler },
      }
    );

    rerender({ handler: nextHandler });

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', shiftKey: true }));
    });

    expect(initialHandler).not.toHaveBeenCalled();
    expect(nextHandler).toHaveBeenCalledTimes(1);
  });

  it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => {
      useKeyboardShortcut(handler);
    });

    unmount();

    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', shiftKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
