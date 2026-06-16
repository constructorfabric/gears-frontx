import { act, render, screen, waitFor } from '@testing-library/react';
import { HAI3_SHARED_PROPERTY_LANGUAGE, HAI3_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
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
    domainId: 'theme-domain',
    instanceId: 'theme-screen',
    initialProperties: {
      [HAI3_SHARED_PROPERTY_THEME]: 'solarized',
      [HAI3_SHARED_PROPERTY_LANGUAGE]: 'fr',
    },
  });
  const { container, unmount } = render(<CurrentThemeScreen bridge={bridgeFixture.bridge} />);
  const rootElement = container.firstChild as HTMLElement | null;
  const host = rootElement ? mockShadowHost(rootElement).host : document.createElement('div');

  await screen.findByRole('heading', { level: 1 });

  return {
    bridgeFixture,
    host,
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
    await setupCurrentThemeScreen();

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
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_THEME, expect.any(Function));
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_LANGUAGE, expect.any(Function));
    });
  });

  it('updates the language value and host direction', async () => {
    const { host, bridgeFixture } = await setupCurrentThemeScreen();

    await act(async () => {
      bridgeFixture.setProperty(HAI3_SHARED_PROPERTY_LANGUAGE, 'ar');
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
});
