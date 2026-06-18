/**
 * Default theme for HAI3
 * Based on original PoC design with light color scheme
 * CSS custom properties map following shadcn/ui variable naming convention.
 */
// @cpt-algo:cpt-hai3-algo-ui-libraries-choice-theme-propagation:p1

import type { ThemeConfig } from '@gears-frontx/react';
import colors from './tailwindColors';
import { hslToVar } from './utils';

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = 'default' as const;

export const defaultTheme: ThemeConfig = {
  id: DEFAULT_THEME_ID,
  name: 'Default',
  default: true,
  variables: {
    // Shadcn color variables
    '--background': hslToVar(colors.white),
    '--foreground': hslToVar(colors.gray[900]),
    '--card': hslToVar(colors.white),
    '--card-foreground': hslToVar(colors.gray[900]),
    '--popover': hslToVar(colors.white),
    '--popover-foreground': hslToVar(colors.gray[900]),
    '--primary': hslToVar(colors.blue[600]),
    '--primary-foreground': hslToVar(colors.white),
    '--secondary': hslToVar(colors.gray[50]),
    '--secondary-foreground': hslToVar(colors.gray[900]),
    '--muted': hslToVar(colors.gray[100]),
    '--muted-foreground': hslToVar(colors.gray[900]),
    '--accent': hslToVar(colors.blue[100]),
    '--accent-foreground': hslToVar(colors.white),
    '--destructive': hslToVar(colors.red[500]),
    '--destructive-foreground': hslToVar(colors.gray[900]),
    '--border': hslToVar(colors.gray[200]),
    '--input': hslToVar(colors.gray[200]),
    '--ring': hslToVar(colors.blue[600]),

    // State colors
    '--error': hslToVar(colors.red[500]),
    '--warning': hslToVar(colors.orange[500]),
    '--success': hslToVar(colors.green[600]),
    '--info': hslToVar(colors.sky[500]),

    // Chart colors (OKLCH format, shadcn/ui light theme)
    '--chart-1': 'oklch(0.646 0.222 41.116)',
    '--chart-2': 'oklch(0.6 0.118 184.704)',
    '--chart-3': 'oklch(0.398 0.07 227.392)',
    '--chart-4': 'oklch(0.828 0.189 84.429)',
    '--chart-5': 'oklch(0.769 0.188 70.08)',

    // Left menu colors
    '--left-menu': hslToVar(colors.gray[900]),
    '--left-menu-foreground': hslToVar(colors.gray[400]),
    '--left-menu-hover': hslToVar(colors.gray[700]),
    '--left-menu-selected': hslToVar(colors.blue[600]),
    '--left-menu-border': hslToVar(colors.gray[700]),

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
    '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    '--shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',

    // Transitions
    '--transition-fast': '150ms',
    '--transition-base': '200ms',
    '--transition-slow': '300ms',
    '--transition-slower': '500ms',
  },
};
