import { render as renderUi, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

type User = ReturnType<typeof userEvent.setup>;

/**
 * Testing Library's `render`, plus a `user` from `userEvent.setup()` bound to the same document.
 * Components that need a provider (a router, a theme) are rendered through `options.wrapper`; the
 * kit's components need none, so the default is a bare render.
 */
export function render(
  ui: ReactElement,
  options?: RenderOptions,
): RenderResult & { user: User } {
  return { user: userEvent.setup(), ...renderUi(ui, options) };
}
