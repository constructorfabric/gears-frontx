// @cpt-flow:cpt-frontx-flow-studio-devtools-drag-button:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-panel-overlay:p1
import React, { useRef } from 'react';
import { useTranslation } from '@gears-frontx/react';
import { useDraggable } from './hooks/useDraggable';
import { BUTTON_SIZE, STORAGE_KEYS } from './types';
import { GlassmorphicButton } from './uikit/composite/GlassmorphicButton';
import { StudioIcon } from './uikit/icons/StudioIcon';

interface CollapsedButtonProps {
  toggleCollapsed: () => void;
}

// @cpt-begin:cpt-frontx-flow-studio-devtools-drag-button:p1:inst-1
export const CollapsedButton: React.FC<CollapsedButtonProps> = ({ toggleCollapsed }) => {
  const { t } = useTranslation();
  const { position, isDragging, handleMouseDown } = useDraggable({
    panelSize: BUTTON_SIZE,
    storageKey: STORAGE_KEYS.BUTTON_POSITION,
  });
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);

  // Handle click vs drag distinction
  const handleButtonMouseDown = (e: React.MouseEvent) => {
    dragStartPosition.current = { x: e.clientX, y: e.clientY };
    handleMouseDown(e);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    // Only toggle if mouse didn't move significantly (< 5px indicates click, not drag)
    if (dragStartPosition.current) {
      const dx = Math.abs(e.clientX - dragStartPosition.current.x);
      const dy = Math.abs(e.clientY - dragStartPosition.current.y);
      if (dx < 5 && dy < 5) {
        toggleCollapsed();
      }
    }
  };

  return (
    <div
      className="fixed z-[10000]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <GlassmorphicButton
        icon={<StudioIcon className="w-6 h-6 text-foreground" />}
        onMouseDown={handleButtonMouseDown}
        onClick={handleButtonClick}
        title={t('studio:aria.openButton')}
        isDragging={isDragging}
      />
    </div>
  );
};

CollapsedButton.displayName = 'CollapsedButton';
// @cpt-end:cpt-frontx-flow-studio-devtools-drag-button:p1:inst-1
