import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: [
    './index.html',
    // Host app chrome (layout, menu, studio, components/ui). MFE packages
    // under src-app/mfe_packages/* build their own CSS and are intentionally
    // excluded here (scanning their node_modules/dist OOMs the host).
    './src-app/app/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
    // Workspace package sources + built output (e.g. @gears-frontx/react UI)
    './packages/*/src/**/*.{js,ts,jsx,tsx}',
    './packages/*/dist/**/*.{js,mjs}',
  ],
  safelist: [
    // RTL utilities used in package components
    'rtl:flex-row-reverse',
    'rtl:rotate-180',
    'rtl:-translate-x-4',
    'ms-auto',  // Direction-aware margin (margin-inline-start: auto)
    // Data attribute + RTL combos for Switch
    'data-[state=checked]:ltr:translate-x-4',
    'data-[state=checked]:rtl:-translate-x-4',
    // ARIA invalid state for form elements
    'aria-[invalid=true]:ring-2',
    'aria-[invalid=true]:ring-destructive/30',
    'aria-[invalid=true]:border-destructive',
    // Calendar cell size CSS variable
    '[--cell-size:2.75rem]',
    'md:[--cell-size:3rem]',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        error: 'hsl(var(--error))',
        warning: 'hsl(var(--warning))',
        success: 'hsl(var(--success))',
        info: 'hsl(var(--info))',
        mainMenu: {
          DEFAULT: 'hsl(var(--left-menu))',
          foreground: 'hsl(var(--left-menu-foreground))',
          hover: 'hsl(var(--left-menu-hover))',
          selected: 'hsl(var(--left-menu-selected))',
          border: 'hsl(var(--left-menu-border))',
        },
      },
      spacing: {
        xs: 'var(--spacing-xs)',
        sm: 'var(--spacing-sm)',
        md: 'var(--spacing-md)',
        lg: 'var(--spacing-lg)',
        xl: 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
      },
      borderRadius: {
        none: '0',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: '9999px',
      },
      zIndex: {
        dropdown: '1000',
        sticky: '1020',
        fixed: '1030',
        modal: '1040',
        popover: '1050',
        tooltip: '1060',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
        slower: '500ms',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
