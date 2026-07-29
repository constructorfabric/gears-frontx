/**
 * Dark theme for FrontX
 * CSS custom properties map following shadcn/ui variable naming convention.
 */
// @cpt-algo:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1

import type { ThemeConfig } from '@gears-frontx/react';
import colors from './tailwindColors';
import { hslToVar } from './utils';

/**
 * Dark theme ID
 */
export const DARK_THEME_ID = 'dark' as const;

export const darkTheme: ThemeConfig = {
  id: DARK_THEME_ID,
  name: 'Dark',
  variables: {
    // Shadcn color variables
    '--background': hslToVar(colors.zinc[950]),
    '--foreground': hslToVar(colors.zinc[50]),
    '--card': hslToVar(colors.zinc[950]),
    '--card-foreground': hslToVar(colors.zinc[50]),
    '--popover': hslToVar(colors.zinc[950]),
    '--popover-foreground': hslToVar(colors.zinc[50]),
    '--primary': hslToVar(colors.zinc[50]),
    '--primary-foreground': hslToVar(colors.zinc[950]),
    '--secondary': hslToVar(colors.zinc[800]),
    '--secondary-foreground': hslToVar(colors.zinc[50]),
    '--muted': hslToVar(colors.zinc[800]),
    '--muted-foreground': hslToVar(colors.zinc[50]),
    '--accent': hslToVar(colors.zinc[400]),
    '--accent-foreground': hslToVar(colors.zinc[950]),
    '--destructive': hslToVar(colors.red[900]),
    '--destructive-foreground': hslToVar(colors.zinc[50]),
    '--border': hslToVar(colors.zinc[800]),
    '--input': hslToVar(colors.zinc[800]),
    '--ring': hslToVar(colors.zinc[50]),

    // State colors
    '--error': hslToVar(colors.red[900]),
    '--warning': hslToVar(colors.orange[500]),
    '--success': hslToVar(colors.green[500]),
    '--info': hslToVar(colors.sky[500]),

    // Chart colors (OKLCH format, shadcn/ui dark theme)
    '--chart-1': 'oklch(0.488 0.243 264.376)',
    '--chart-2': 'oklch(0.696 0.17 162.48)',
    '--chart-3': 'oklch(0.769 0.188 70.08)',
    '--chart-4': 'oklch(0.627 0.265 303.9)',
    '--chart-5': 'oklch(0.645 0.246 16.439)',

    // Left menu colors
    '--left-menu': hslToVar(colors.black),
    '--left-menu-foreground': hslToVar(colors.zinc[400]),
    '--left-menu-hover': hslToVar(colors.zinc[900]),
    '--left-menu-selected': hslToVar(colors.zinc[500]),
    '--left-menu-border': hslToVar(colors.zinc[800]),

    // Spacing
    '--spacing-xs': '0.25rem',
    '--spacing-sm': '0.5rem',
    '--spacing-md': '1rem',
    '--spacing-lg': '1.5rem',
    '--spacing-xl': '2rem',
    '--spacing-2xl': '3rem',
    '--spacing-3xl': '4rem',

    // Border radius
    '--radius-none': '0',
    '--radius-sm': '0.125rem',
    '--radius-md': '0.25rem',
    '--radius-lg': '0.5rem',
    '--radius-xl': '1rem',
    '--radius-full': '9999px',

    // Shadows
    '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
    '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    '--shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.6)',

    // Transitions
    '--transition-fast': '150ms',
    '--transition-base': '200ms',
    '--transition-slow': '300ms',
    '--transition-slower': '500ms',
  },
};
