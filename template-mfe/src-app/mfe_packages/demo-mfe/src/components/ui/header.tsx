import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Header Props
 */
export interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Header Component
 * Base layout primitive for app header
 * FrontX custom component (not from shadcn)
 * Accepts children for flexible content (user info, actions, etc.)
 */
export const Header = (
  {
    ref,
    children,
    className
  }: HeaderProps & {
    ref?: React.Ref<HTMLElement>;
  }
) => {
  return (
    <header
      ref={ref}
      className={cn(
        'flex items-center justify-end px-6 py-4 bg-background border-b border-border h-16 w-full',
        className
      )}
    >
      <div className="flex items-center gap-4">{children}</div>
    </header>
  );
};

Header.displayName = 'Header';
