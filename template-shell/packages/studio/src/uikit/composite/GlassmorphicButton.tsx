// @cpt-dod:cpt-frontx-dod-studio-devtools-panel-overlay:p1
import React from 'react';
import { Button } from '../base/button';
import { ButtonVariant } from '../types';

interface GlassmorphicButtonProps {
  icon: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  isDragging?: boolean;
}

/**
 * Glassmorphic Button
 * Circular button with glassmorphic styling (blur, transparency, saturation)
 * Renders content behind it with a frosted glass effect
 */
export const GlassmorphicButton: React.FC<GlassmorphicButtonProps> = ({
  icon,
  onMouseDown,
  onClick,
  title,
  isDragging = false,
}) => {
  return (
    <Button
      variant={ButtonVariant.Ghost}
      onMouseDown={onMouseDown}
      onClick={onClick}
      title={title}
      className="w-12 h-12 p-0 rounded-full flex items-center justify-center pointer-events-auto bg-white/20 dark:bg-black/50 backdrop-blur-md backdrop-saturate-[180%] border border-white/30 dark:border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:bg-white/30 dark:hover:bg-black/60 transition-colors"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {icon}
    </Button>
  );
};

GlassmorphicButton.displayName = 'GlassmorphicButton';
