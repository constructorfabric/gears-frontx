import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '@gears-frontx/react';
import { StudioEvents } from '../events/studioEvents';
import { STORAGE_KEYS } from '../types';
import { useDraggable } from './useDraggable';

vi.mock('@gears-frontx/react', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe('useDraggable', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(globalThis, 'innerHeight', { value: 900, configurable: true });
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the stored position and clamps it to the viewport', () => {
    localStorage.setItem(STORAGE_KEYS.POSITION, JSON.stringify({ x: 4000, y: -50 }));

    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 400, height: 300 },
      })
    );

    expect(result.current.position).toEqual({ x: 780, y: 20 });
  });

  it('emits position changes while dragging the panel', () => {
    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 400, height: 300 },
      })
    );

    act(() => {
      result.current.handleMouseDown({ clientX: 790, clientY: 590 } as React.MouseEvent);
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 620, clientY: 440 }));
    });

    expect(result.current.position).toEqual({ x: 610, y: 430 });
    expect(eventBus.emit).toHaveBeenCalledWith(StudioEvents.PositionChanged, {
      position: { x: 610, y: 430 },
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('routes collapsed button drags through the button position event', () => {
    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 48, height: 48 },
        storageKey: STORAGE_KEYS.BUTTON_POSITION,
      })
    );

    act(() => {
      result.current.handleMouseDown({ clientX: 1140, clientY: 840 } as React.MouseEvent);
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 868, clientY: 568 }));
    });

    expect(eventBus.emit).toHaveBeenCalledWith(StudioEvents.ButtonPositionChanged, {
      position: { x: 860, y: 560 },
    });
  });

  it('re-clamps the current position when the viewport shrinks', () => {
    localStorage.setItem(STORAGE_KEYS.POSITION, JSON.stringify({ x: 760, y: 560 }));

    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 400, height: 300 },
      })
    );

    Object.defineProperty(globalThis, 'innerWidth', { value: 700, configurable: true });
    Object.defineProperty(globalThis, 'innerHeight', { value: 500, configurable: true });

    act(() => {
      globalThis.dispatchEvent(new Event('resize'));
    });

    expect(result.current.position).toEqual({ x: 280, y: 180 });
    expect(eventBus.emit).toHaveBeenCalledWith(StudioEvents.PositionChanged, {
      position: { x: 280, y: 180 },
    });
  });
});
