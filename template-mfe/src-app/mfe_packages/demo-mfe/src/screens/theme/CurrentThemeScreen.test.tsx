import { act, render, screen, waitFor } from '@testing-library/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useScreenTranslationsMock } = vi.hoisted(() => ({
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

async function setupCurrentThemeScreen() {
  const { CurrentThemeScreen } = await import('./CurrentThemeScreen');
  const bridgeFixture = createMfeBridgeFixture({
    extDomainId: 'theme-domain',
    extensionId: 'theme-screen',
    initialProperties: {
      [FRONTX_SHARED_PROPERTY_THEME]: 'solarized',
      [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'fr',
    },
  });
  // Raised before the render, so the screen's mount effect has a host to write
  // its direction on. Attached afterwards, that first pass reaches no host at
  // all and the initial LTR direction is asserted by nothing.
  const { host } = mockShadowHost(HTMLDivElement);
  const { rerender, unmount } = render(<CurrentThemeScreen bridge={bridgeFixture.bridge} />);

  await screen.findByRole('heading', { level: 1 });

  return {
    CurrentThemeScreen,
    bridgeFixture,
    host,
    rerender,
    unmount,
  };
}

describe('CurrentThemeScreen', () => {
  beforeEach(() => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders bridge values and theme swatches', async () => {
    const { host } = await setupCurrentThemeScreen();

    // `fr` resolves to the left-to-right default, written on the shadow host.
    expect(host.dir).toBe('ltr');
    expect(screen.getAllByText('solarized').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('fr')).toBeTruthy();
    expect(screen.getByText('theme-domain')).toBeTruthy();
    expect(screen.getByText('theme-screen')).toBeTruthy();
    expect(screen.getAllByText(/^bg-/).length).toBeGreaterThanOrEqual(7);
    expect(screen.getAllByText(/^--/).length).toBeGreaterThanOrEqual(12);
  });

  it('subscribes to theme and language bridge properties', async () => {
    const { bridgeFixture } = await setupCurrentThemeScreen();

    await waitFor(() => {
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_THEME, expect.any(Function));
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_LANGUAGE, expect.any(Function));
    });
  });

  it('updates the language value and host direction', async () => {
    const { host, bridgeFixture } = await setupCurrentThemeScreen();

    expect(host.dir).toBe('ltr');

    await act(async () => {
      bridgeFixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'ar');
    });

    await waitFor(() => {
      expect(host.getAttribute('dir')).toBe('rtl');
      expect(screen.getByText('ar')).toBeTruthy();
    });
  });

  it('unsubscribes from bridge properties on unmount', async () => {
    const { unmount, bridgeFixture } = await setupCurrentThemeScreen();

    unmount();

    for (const { unsubscribe } of bridgeFixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });

  // The host may hand the screen a different bridge without unmounting it. The
  // lazy useState initializers ran once on mount, so only the re-read during
  // render carries the new instance's current values across; the subscription
  // effect delivers future changes and never fires here. Getting this wrong is
  // silent: the screen keeps painting the previous host's theme and language
  // while listening to a bridge nobody is publishing on any more.
  it('re-reads current properties when the host swaps the bridge instance', async () => {
    const { CurrentThemeScreen, bridgeFixture, host, rerender } =
      await setupCurrentThemeScreen();
    const swapped = createMfeBridgeFixture({
      extDomainId: 'swapped-domain',
      extensionId: 'swapped-screen',
      initialProperties: {
        [FRONTX_SHARED_PROPERTY_THEME]: 'swapped-theme',
        [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'ar',
      },
    });

    rerender(<CurrentThemeScreen bridge={swapped.bridge} />);

    expect(screen.getAllByText('swapped-theme').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ar')).toBeTruthy();
    expect(screen.getByText('swapped-domain')).toBeTruthy();
    expect(screen.getByText('swapped-screen')).toBeTruthy();
    expect(screen.queryByText('solarized')).toBeNull();

    await waitFor(() => {
      expect(host.getAttribute('dir')).toBe('rtl');
    });

    // The first bridge is released exactly once, and the second one is
    // subscribed to in its place.
    expect(bridgeFixture.unsubscriptions).toHaveLength(2);
    for (const { unsubscribe } of bridgeFixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
    expect(swapped.subscribeToProperty).toHaveBeenCalledTimes(2);
  });
});
