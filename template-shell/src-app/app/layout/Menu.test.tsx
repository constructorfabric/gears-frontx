import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScreenExtension } from '@gears-frontx/react';
import { EMPTY_STATE_GRACE_MS, Menu } from './Menu';

const mockUseFrontX = vi.fn();
const mockUseMountedExtensions = vi.fn();

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const emptyState = () => screen.queryByText(/No screens yet/);

  it('mounts the screen a menu item names when that item is clicked through its test id', async () => {
    render(<Menu />);

    // Driven through the test id an unattended browser run addresses this item
    // by, spelled out rather than built with `menuItemTestId`: the point is to
    // hold the published derivation - the `menu-item-` prefix and the
    // extension id verbatim after it - which a shared helper on both sides
    // would let drift unnoticed.
    await userEvent.click(await screen.findByTestId(`menu-item-${tasks.id}`));

    await waitFor(() => {
      expect(app.mfeRegistry.executeActionsChain).toHaveBeenCalledTimes(1);
    });
    const chain = app.mfeRegistry.executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(tasks.id);
  });

  it('stays blank instead of claiming there are no screens while the MFEs are still registering', async () => {
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

  it('shows the empty state after the grace window when the app carries no MFE registry at all', async () => {
    // `mfeRegistry` is optional on the app, so a project without the
    // microfrontends plugin has no registry to poll and no screens coming.
    // That reader is the one the hint is written for, which is why the grace
    // window is timed from mount rather than from discovery: tied to the
    // registry it would never close here.
    mockUseFrontX.mockReturnValue({ mfeRegistry: undefined });
    vi.useFakeTimers();
    render(<Menu />);

    expect(emptyState()).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(EMPTY_STATE_GRACE_MS);
    });

    expect(emptyState()).not.toBeNull();
  });

  it('shows the empty state once the grace window passes with nothing registered', async () => {
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
