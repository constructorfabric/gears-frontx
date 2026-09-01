import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { within } from '@testing-library/dom';

/**
 * Mounts a screen and hands back queries scoped to its container.
 *
 * Deliberately a local mount rather than `@testing-library/react`'s `render`:
 * that package resolves React and React DOM from its own location, and the
 * screens here render against the copy the kit resolves (see
 * `vitest.config.ts`). Importing the renderer directly keeps every React in
 * the test on one instance. `@testing-library/dom` supplies the queries and
 * pulls in no renderer of its own.
 */
export function renderScreen(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    ...within(container),
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
