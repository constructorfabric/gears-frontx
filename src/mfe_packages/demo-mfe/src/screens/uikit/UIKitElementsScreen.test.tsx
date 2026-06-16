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

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

// Stub children to isolate the screen's bridge wiring. No assertions are made on
// their output; their only purpose is to keep JSDOM happy (Radix portals, toasts,
// and the heavy UIKit tree would otherwise force additional global polyfills without
// adding coverage over what E2E tests already cover).
vi.mock('./components/CategoryMenu', () => ({ CategoryMenu: () => null }));
vi.mock('../../components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('../../components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./components/LayoutElements', () => ({ LayoutElements: () => null }));
vi.mock('./components/NavigationElements', () => ({ NavigationElements: () => null }));
vi.mock('./components/FormElements', () => ({ FormElements: () => null }));
vi.mock('./components/ActionElements', () => ({ ActionElements: () => null }));
vi.mock('./components/FeedbackElements', () => ({ FeedbackElements: () => null }));
vi.mock('./components/DataDisplayElements', () => ({ DataDisplayElements: () => null }));
vi.mock('./components/OverlayElements', () => ({ OverlayElements: () => null }));
vi.mock('./components/MediaElements', () => ({ MediaElements: () => null }));
vi.mock('./components/DisclosureElements', () => ({ DisclosureElements: () => null }));

async function setupUIKitElementsScreen() {
  const { UIKitElementsScreen } = await import('./UIKitElementsScreen');
  const bridgeFixture = createMfeBridgeFixture({
    domainId: 'uikit-domain',
    instanceId: 'uikit-screen',
    initialProperties: {
      [HAI3_SHARED_PROPERTY_THEME]: 'ocean',
      [HAI3_SHARED_PROPERTY_LANGUAGE]: 'de',
    },
  });

  const { container, unmount } = render(<UIKitElementsScreen bridge={bridgeFixture.bridge} />);
  const rootElement = container.firstElementChild;
  if (!(rootElement instanceof HTMLElement)) {
    throw new TypeError('expected UIKitElementsScreen root element');
  }
  const { host } = mockShadowHost(rootElement);

  await screen.findByRole('heading', { level: 1 });

  return {
    bridgeFixture,
    host,
    unmount,
  };
}

describe('UIKitElementsScreen bridge wiring smoke', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders bridge values and initial shared properties', async () => {
    await setupUIKitElementsScreen();

    expect(screen.getByText('uikit-domain')).toBeTruthy();
    expect(screen.getByText('uikit-screen')).toBeTruthy();
    expect(screen.getByText('ocean')).toBeTruthy();
    expect(screen.getByText('de')).toBeTruthy();
  });

  it('subscribes to theme and language bridge properties', async () => {
    const { bridgeFixture } = await setupUIKitElementsScreen();

    await waitFor(() => {
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_THEME, expect.any(Function));
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_LANGUAGE, expect.any(Function));
    });
  });

  it('updates the language value and host direction', async () => {
    const { host, bridgeFixture } = await setupUIKitElementsScreen();

    await act(async () => {
      bridgeFixture.setProperty(HAI3_SHARED_PROPERTY_LANGUAGE, 'ar');
    });

    await waitFor(() => {
      expect(host.getAttribute('dir')).toBe('rtl');
      expect(screen.getByText('ar')).toBeTruthy();
    });
  });

  it('unsubscribes from bridge properties on unmount', async () => {
    const { unmount, bridgeFixture } = await setupUIKitElementsScreen();

    unmount();

    for (const { unsubscribe } of bridgeFixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });
});
