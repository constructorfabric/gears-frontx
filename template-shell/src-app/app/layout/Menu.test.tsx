import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScreenExtension } from '@gears-frontx/react';

const mockUseFrontX = vi.fn();
const mockUseMountedExtensions = vi.fn();

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, never>>()),
  useAppSelector: () => undefined,
  useFrontX: () => mockUseFrontX(),
  useMountedExtensions: () => mockUseMountedExtensions(),
}));

const screenExtension = (
  id: string,
  route: string,
  order: number,
  label: string = id
): ScreenExtension => ({
  id,
  domain: 'screen-domain',
  entry: `${id}.entry`,
  presentation: { label, route, order },
});

// Shaped like a real registry id - dots, tildes and all - so the test id
// assertion below stands as evidence that the id goes in verbatim rather than
// through a slug step that would flatten exactly this punctuation.
const tasks = screenExtension(
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.tasks.v1',
  '/tasks',
  20,
  'Tasks'
);

describe('Menu', () => {
  let app: {
    mfeRegistry: {
      getExtensionsForDomain: ReturnType<typeof vi.fn>;
      executeActionsChain: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    app = {
      mfeRegistry: {
        getExtensionsForDomain: vi.fn().mockReturnValue([tasks]),
        executeActionsChain: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockUseFrontX.mockReturnValue(app);
    mockUseMountedExtensions.mockReturnValue([]);
    window.history.pushState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const emptyState = () => screen.queryByText(/No screens yet/);

  it('pushes the screen route and mounts the screen when its menu item is clicked', async () => {
    const { Menu } = await import('./Menu');
    render(<Menu />);

    // Driven through the test id an unattended browser run addresses this item
    // by, spelled out rather than built with `menuItemTestId`: the point is to
    // hold the published derivation - the `menu-item-` prefix and the
    // extension id verbatim after it - which a shared helper on both sides
    // would let drift unnoticed.
    await userEvent.click(await screen.findByTestId(`menu-item-${tasks.id}`));

    expect(window.location.pathname).toBe(tasks.presentation.route);
    await waitFor(() => {
      expect(app.mfeRegistry.executeActionsChain).toHaveBeenCalledTimes(1);
    });
    const chain = app.mfeRegistry.executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(tasks.id);
  });

  it('mounts without touching the URL when the extension declares no route', async () => {
    const routeless = screenExtension('ext.routeless', '', 10);
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([routeless]);
    const { Menu } = await import('./Menu');
    render(<Menu />);

    await userEvent.click(await screen.findByText(routeless.presentation.label));

    expect(window.location.pathname).toBe('/');
    await waitFor(() => {
      expect(app.mfeRegistry.executeActionsChain).toHaveBeenCalledTimes(1);
    });
  });

  it('stays blank instead of claiming there are no screens while the MFEs are still registering', async () => {
    const { Menu, EMPTY_STATE_GRACE_MS } = await import('./Menu');
    // The registry is empty on the first poll and populated on the next one -
    // exactly what a hard page load looks like from the menu's side.
    app.mfeRegistry.getExtensionsForDomain.mockReturnValueOnce([]).mockReturnValue([tasks]);
    vi.useFakeTimers();
    render(<Menu />);

    expect(emptyState()).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(EMPTY_STATE_GRACE_MS);
    });

    expect(emptyState()).toBeNull();
    expect(screen.getByText(tasks.presentation.label)).toBeTruthy();
  });

  it('shows the empty state once the grace window passes with nothing registered', async () => {
    const { Menu, EMPTY_STATE_GRACE_MS } = await import('./Menu');
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([]);
    vi.useFakeTimers();
    render(<Menu />);

    expect(emptyState()).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(EMPTY_STATE_GRACE_MS);
    });

    expect(emptyState()).not.toBeNull();
  });
});
