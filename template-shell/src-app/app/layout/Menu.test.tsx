import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const screenExtension = (id: string, route: string, order: number): ScreenExtension => ({
  id,
  domain: 'screen-domain',
  entry: `${id}.entry`,
  presentation: { label: id, route, order },
});

const tasks = screenExtension('ext.tasks', '/tasks', 20);

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

  it('pushes the screen route and mounts the screen when its menu item is clicked', async () => {
    const { Menu } = await import('./Menu');
    render(<Menu />);

    await userEvent.click(await screen.findByText(tasks.presentation.label));

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
});
