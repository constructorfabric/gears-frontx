import React from 'react';
import { Button, type ButtonProps } from './button';
import { cn } from '../../lib/utils';
import { ButtonVariant, ButtonSize, IconButtonSize } from '../types';

/**
 * IconButton component for FrontX UI-Core
 * Provides a consistent icon-only button across all screens
 * Composes UI Kit Button with icon size variant
 */

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'asChild'> {
  size?: IconButtonSize;
  'aria-label': string; // Required for accessibility
}

export const IconButton = (
  {
    ref,
    variant = ButtonVariant.Ghost,
    size = IconButtonSize.Default,
    className,
    ...props
  }: IconButtonProps & {
    ref?: React.Ref<HTMLButtonElement>;
  }
) => {
  // Apply custom sizes for icon buttons
  const sizeStyles: Record<IconButtonSize, string> = {
    [IconButtonSize.Small]: 'h-8 w-8',
    [IconButtonSize.Default]: 'h-9 w-9',
    [IconButtonSize.Large]: 'h-10 w-10',
  };

  return (
    <Button
      ref={ref}
      variant={variant}
      size={ButtonSize.Icon}
      className={cn(sizeStyles[size], className)}
      {...props}
    />
  );
};

IconButton.displayName = 'IconButton';

// Re-export ButtonVariant for convenience
export { ButtonVariant };
