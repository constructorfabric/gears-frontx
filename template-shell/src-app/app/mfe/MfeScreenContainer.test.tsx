import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ScreenExtension } from '@gears-frontx/react';

const mockBootstrapMFE = vi.fn();
const mockUseFrontX = vi.fn();
const mockScreenDomain = { id: 'screen-domain' };

const screenExtension = (id: string, route: string, order: number): ScreenExtension => ({
  id,
  domain: mockScreenDomain.id,
  entry: `${id}.entry`,
  presentation: { label: id, route, order },
});

const firstScreen = screenExtension('ext.login', '/login', 10);
const secondScreen = screenExtension('ext.tasks', '/tasks', 20);

vi.mock('./bootstrap', () => ({
  bootstrapMFE: (...args: never[]) => mockBootstrapMFE(...args),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, never>>()),
  useFrontX: () => mockUseFrontX(),
  screenDomain: mockScreenDomain,
  ExtensionDomainSlot: ({
    registry,
    domainId,
    className,
  }: {
    registry: { mfeRegistry: Record<string, never> } | null;
    domainId: string;
    className?: string;
  }) => (
    <div
      data-testid="extension-domain-slot"
      data-registry-present={registry ? 'yes' : 'no'}
      data-domain-id={domainId}
      data-class-name={className}
    />
  ),
}));

describe('MfeScreenContainer', () => {
  let app: {
    mfeRegistry: {
      getExtensionsForDomain: ReturnType<typeof vi.fn>;
      executeActionsChain: ReturnType<typeof vi.fn>;
    };
  };
  const mountedSubjects = () =>
    app.mfeRegistry.executeActionsChain.mock.calls.map(
      (call) => (call[0] as { action: { payload: { subject: string } } }).action.payload.subject,
    );

  beforeEach(() => {
    app = {
      mfeRegistry: {
        getExtensionsForDomain: vi.fn().mockReturnValue([firstScreen, secondScreen]),
        executeActionsChain: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockUseFrontX.mockReturnValue(app);
    mockBootstrapMFE.mockReset();
    mockBootstrapMFE.mockResolvedValue(undefined);
    window.history.pushState(null, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing while bootstrap is pending', async () => {
    let resolveBootstrap: (() => void) | undefined;
    mockBootstrapMFE.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();

    resolveBootstrap?.();
  });

  it('bootstraps the MFE runtime only once across re-renders', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    const { rerender } = render(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);

    await waitFor(() => {
      expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
    });
    expect(mockBootstrapMFE).toHaveBeenCalledWith(app);
  });

  it('renders the screen-domain ExtensionDomainSlot after bootstrap succeeds', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      const slot = screen.getByTestId('extension-domain-slot');
      expect(slot.dataset.domainId).toBe(mockScreenDomain.id);
      expect(slot.dataset.registryPresent).toBe('yes');
      expect(slot.dataset.className).toContain('h-full');
    });
  });

  it('mounts the screen the current URL names once bootstrap has registered the extensions', async () => {
    window.history.pushState(null, '', '/tasks');
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(mountedSubjects()).toEqual([secondScreen.id]);
    });
    // Resolving before bootstrap resolves would search an empty registry.
    expect(app.mfeRegistry.getExtensionsForDomain).toHaveBeenCalledWith(mockScreenDomain.id);
  });

  it('mounts the first menu screen on a cold boot at the root path', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(mountedSubjects()).toEqual([firstScreen.id]);
    });
  });

  it('re-mounts the screen for the restored URL on back/forward', async () => {
    window.history.pushState(null, '', '/tasks');
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);
    await waitFor(() => {
      expect(mountedSubjects()).toEqual([secondScreen.id]);
    });

    window.history.pushState(null, '', '/login');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(mountedSubjects()).toEqual([secondScreen.id, firstScreen.id]);
    });
  });

  it('stops listening for back/forward once unmounted', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    const { unmount } = render(<MfeScreenContainer />);
    await waitFor(() => {
      expect(mountedSubjects()).toEqual([firstScreen.id]);
    });

    unmount();
    window.history.pushState(null, '', '/tasks');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(mountedSubjects()).toEqual([firstScreen.id]);
  });

  it('logs an error and renders nothing when bootstrap rejects', async () => {
    const error = new Error('boom');
    mockBootstrapMFE.mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();
  });
});
