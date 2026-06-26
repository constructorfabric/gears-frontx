import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '@gears-frontx/react';
import { StudioEvents } from '../events/studioEvents';
import { PANEL_CONSTRAINTS, STORAGE_KEYS } from '../types';
import { useResizable } from './useResizable';

vi.mock('@gears-frontx/react', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe('useResizable', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the persisted size', () => {
    localStorage.setItem(STORAGE_KEYS.SIZE, JSON.stringify({ width: 420, height: 520 }));

    const { result } = renderHook(() => useResizable());

    expect(result.current.size).toEqual({ width: 420, height: 520 });
  });

  it('resizes within constraints and emits size updates', () => {
    const stopPropagation = vi.fn();
    const { result } = renderHook(() => useResizable());

    act(() => {
      result.current.handleMouseDown({
        clientX: 400,
        clientY: 500,
        stopPropagation,
      });
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(result.current.isResizing).toBe(true);
    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.cursor).toBe('nwse-resize');

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 1200 }));
    });

    expect(result.current.size).toEqual({
      width: PANEL_CONSTRAINTS.MAX_WIDTH,
      height: PANEL_CONSTRAINTS.MAX_HEIGHT,
    });
    expect(eventBus.emit).toHaveBeenCalledWith(StudioEvents.SizeChanged, {
      size: {
        width: PANEL_CONSTRAINTS.MAX_WIDTH,
        height: PANEL_CONSTRAINTS.MAX_HEIGHT,
      },
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isResizing).toBe(false);
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
  });
});
