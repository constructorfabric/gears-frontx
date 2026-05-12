import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockBootstrapMFE = vi.fn();
const mockUseHAI3 = vi.fn();
const mockScreenDomain = { id: 'screen-domain' };

vi.mock('./bootstrap', () => ({
  bootstrapMFE: (...args: unknown[]) => mockBootstrapMFE(...args),
}));

vi.mock('@cyberfabric/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useHAI3: () => mockUseHAI3(),
  screenDomain: mockScreenDomain,
  ExtensionDomainSlot: ({
    registry,
    domainId,
    className,
  }: {
    registry: unknown;
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
  let app: { mfeRegistry: object };

  beforeEach(() => {
    app = { mfeRegistry: {} };
    mockUseHAI3.mockReturnValue(app);
    mockBootstrapMFE.mockReset();
    mockBootstrapMFE.mockResolvedValue(undefined);
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
