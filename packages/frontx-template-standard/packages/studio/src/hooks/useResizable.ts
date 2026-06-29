// @cpt-flow:cpt-frontx-flow-studio-devtools-resize-panel:p1
// @cpt-state:cpt-frontx-state-studio-devtools-resize:p1
import { useState, useEffect, useCallback, useRef } from 'react';
import { clamp } from 'lodash';
import { eventBus } from '@gears-frontx/react';
import type { Size } from '../types';
import { loadStudioState } from '../utils/persistence';
import { STORAGE_KEYS, PANEL_CONSTRAINTS } from '../types';
import { StudioEvents } from '../events/studioEvents';

type ResizeStartEvent = {
  clientX: number;
  clientY: number;
  stopPropagation: () => void;
};

// @cpt-begin:cpt-frontx-flow-studio-devtools-resize-panel:p1:inst-1
// @cpt-begin:cpt-frontx-state-studio-devtools-resize:p1:inst-1
export const useResizable = () => {
  const [size, setSize] = useState<Size>(() =>
    loadStudioState(STORAGE_KEYS.SIZE, {
      width: PANEL_CONSTRAINTS.DEFAULT_WIDTH,
      height: PANEL_CONSTRAINTS.DEFAULT_HEIGHT,
    })
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; width: number; height: number } | null>(null);

  const handleMouseDown = useCallback((e: ResizeStartEvent) => {
    e.stopPropagation(); // Don't trigger drag

    // Store initial mouse position and current size
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: size.width,
      height: size.height,
    };

    setIsResizing(true);
  }, [size.width, size.height]);

  useEffect(() => {
    if (!isResizing || !resizeStartRef.current) return;

    const startState = resizeStartRef.current;

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate delta from initial mouse position
      const deltaX = e.clientX - startState.mouseX;
      const deltaY = e.clientY - startState.mouseY;

      // Apply delta to initial size
      const newWidth = clamp(
        startState.width + deltaX,
        PANEL_CONSTRAINTS.MIN_WIDTH,
        PANEL_CONSTRAINTS.MAX_WIDTH
      );
      const newHeight = clamp(
        startState.height + deltaY,
        PANEL_CONSTRAINTS.MIN_HEIGHT,
        PANEL_CONSTRAINTS.MAX_HEIGHT
      );

      const newSize = { width: newWidth, height: newHeight };
      setSize(newSize);
      eventBus.emit(StudioEvents.SizeChanged, { size: newSize });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Ensure cleanup on unmount
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  return {
    size,
    isResizing,
    handleMouseDown,
  };
};
// @cpt-end:cpt-frontx-flow-studio-devtools-resize-panel:p1:inst-1
// @cpt-end:cpt-frontx-state-studio-devtools-resize:p1:inst-1
