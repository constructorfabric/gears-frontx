// @cpt-dod:cpt-frontx-dod-studio-devtools-control-panel:p1
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
