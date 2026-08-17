import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeSelector } from './ThemeSelector';

const setTheme = vi.fn();

const themes = [
  { id: 'default', name: 'Default' },
  { id: 'dracula-large', name: 'Dracula Large' },
];

vi.mock('@gears-frontx/react', () => ({
  useTheme: () => ({ currentTheme: 'default', themes, setTheme }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../StudioProvider', () => ({
  useStudioContext: () => ({ portalContainer: null }),
}));

describe('ThemeSelector', () => {
  // The switcher is what an unattended browser run applies a theme with and
  // reads the applied theme back from, so both halves of that contract are
  // held here: the trigger's own text is the active theme, and every
  // registered theme is reachable by an id built from the theme's registry id.
  it('offers every registered theme by id and applies the one selected', async () => {
    render(<ThemeSelector />);

    const trigger = screen.getByTestId('studio-theme-trigger');
    expect(trigger.textContent).toContain('Default');

    await userEvent.click(trigger);

    // Spelled out rather than built with `studioThemeOptionTestId`: a helper
    // used on both sides would let the published derivation drift unnoticed.
    expect(screen.getByTestId('studio-theme-option-default')).toBeTruthy();
    await userEvent.click(screen.getByTestId('studio-theme-option-dracula-large'));

    expect(setTheme).toHaveBeenCalledWith('dracula-large');
  });
});
