// @cpt-dod:cpt-frontx-dod-studio-devtools-control-panel:p1
import React from 'react';
import { Button } from '../base/button';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';
import { ButtonVariant } from '../types';
import { cn } from '../lib/utils';

export interface DropdownButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}

export const DropdownButton = ({
  ref,
  children,
  variant = ButtonVariant.Outline,
  className,
  ...props
}: DropdownButtonProps & {
  ref?: React.Ref<HTMLButtonElement>;
}) => {
  return (
    <Button
      ref={ref}
      variant={variant}
      className={cn('min-w-40 justify-between rtl:flex-row-reverse', className)}
      {...props}
    >
      <span>{children}</span>
      <ChevronDownIcon className="h-4 w-4" />
    </Button>
  );
};

DropdownButton.displayName = 'DropdownButton';
