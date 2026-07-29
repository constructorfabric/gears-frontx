// @cpt-algo:cpt-frontx-algo-studio-devtools-clamp-to-viewport:p1
// @cpt-algo:cpt-frontx-algo-studio-devtools-default-position:p1
// @cpt-algo:cpt-frontx-algo-studio-devtools-event-routing:p1
// @cpt-flow:cpt-frontx-flow-studio-devtools-drag-panel:p1
// @cpt-flow:cpt-frontx-flow-studio-devtools-drag-button:p1
// @cpt-flow:cpt-frontx-flow-studio-devtools-viewport-clamp:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-viewport-clamping:p1
// @cpt-state:cpt-frontx-state-studio-devtools-drag:p1
import { useState, useEffect, useRef, useCallback } from 'react';
import { clamp } from 'lodash';
import { eventBus } from '@gears-frontx/react';
import type { Position, Size } from '../types';
import { loadStudioState } from '../utils/persistence';
import { STORAGE_KEYS } from '../types';
import { StudioEvents } from '../events/studioEvents';

const VIEWPORT_MARGIN = 20;

// @cpt-begin:cpt-frontx-algo-studio-devtools-clamp-to-viewport:p1:inst-1
function clampToViewport(pos: Position, size: Size): Position {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN);
  return {
    x: clamp(pos.x, VIEWPORT_MARGIN, maxX),
    y: clamp(pos.y, VIEWPORT_MARGIN, maxY),
  };
}
// @cpt-end:cpt-frontx-algo-studio-devtools-clamp-to-viewport:p1:inst-1

interface UseDraggableProps {
  panelSize: Size;
  storageKey?: string;
}

// @cpt-begin:cpt-frontx-algo-studio-devtools-default-position:p1:inst-1
// @cpt-begin:cpt-frontx-algo-studio-devtools-event-routing:p1:inst-1
// @cpt-begin:cpt-frontx-flow-studio-devtools-drag-panel:p1:inst-1
// @cpt-begin:cpt-frontx-flow-studio-devtools-drag-button:p1:inst-1
// @cpt-begin:cpt-frontx-flow-studio-devtools-viewport-clamp:p1:inst-1
// @cpt-begin:cpt-frontx-state-studio-devtools-drag:p1:inst-1
export const useDraggable = ({ panelSize, storageKey = STORAGE_KEYS.POSITION }: UseDraggableProps) => {
  // Calculate default position (bottom-right with margin)
  const getDefaultPosition = (): Position => ({
    x: window.innerWidth - panelSize.width - VIEWPORT_MARGIN,
    y: window.innerHeight - panelSize.height - VIEWPORT_MARGIN,
  });

  const [position, setPosition] = useState<Position>(() =>
    clampToViewport(loadStudioState(storageKey, getDefaultPosition()), panelSize)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<Position>({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - panelSize.width - VIEWPORT_MARGIN);
      const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - panelSize.height - VIEWPORT_MARGIN);
      const newX = clamp(e.clientX - dragStartPos.current.x, VIEWPORT_MARGIN, maxX);
      const newY = clamp(e.clientY - dragStartPos.current.y, VIEWPORT_MARGIN, maxY);

      const newPosition = { x: newX, y: newY };
      setPosition(newPosition);

      // Emit appropriate event based on storage key
      const eventName = storageKey === STORAGE_KEYS.BUTTON_POSITION
        ? StudioEvents.ButtonPositionChanged
        : StudioEvents.PositionChanged;
      eventBus.emit(eventName, { position: newPosition });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, panelSize.width, panelSize.height, storageKey]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const clamped = clampToViewport(prev, panelSize);
        if (clamped.x === prev.x && clamped.y === prev.y) return prev;
        const eventName =
          storageKey === STORAGE_KEYS.BUTTON_POSITION
            ? StudioEvents.ButtonPositionChanged
            : StudioEvents.PositionChanged;
        eventBus.emit(eventName, { position: clamped });
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelSize.width, panelSize.height, panelSize, storageKey]);

  return {
    position,
    isDragging,
    handleMouseDown,
  };
};
// @cpt-end:cpt-frontx-algo-studio-devtools-default-position:p1:inst-1
// @cpt-end:cpt-frontx-algo-studio-devtools-event-routing:p1:inst-1
// @cpt-end:cpt-frontx-flow-studio-devtools-drag-panel:p1:inst-1
// @cpt-end:cpt-frontx-flow-studio-devtools-drag-button:p1:inst-1
// @cpt-end:cpt-frontx-flow-studio-devtools-viewport-clamp:p1:inst-1
// @cpt-end:cpt-frontx-state-studio-devtools-drag:p1:inst-1
