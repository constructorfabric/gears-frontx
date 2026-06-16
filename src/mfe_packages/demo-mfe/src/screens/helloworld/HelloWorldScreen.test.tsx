import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HAI3_ACTION_MOUNT_EXT,
  HAI3_SCREEN_DOMAIN,
  HAI3_SHARED_PROPERTY_LANGUAGE,
  HAI3_SHARED_PROPERTY_THEME,
  TextDirection,
} from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_ACTION_REFRESH_PROFILE,
  PROFILE_EXTENSION_ID,
  THEME_EXTENSION_ID,
} from '../../shared/extension-ids';

const { useScreenTranslationsMock } = vi.hoisted(() => ({
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

async function setupHelloWorldScreen() {
  const { HelloWorldScreen } = await import('./HelloWorldScreen');
  const executeActionsChain = vi.fn().mockResolvedValue(undefined);
  const expectedTheme = 'custom-theme';
  const expectedLanguage = 'pl';
  const bridgeFixture = createMfeBridgeFixture({
    domainId: 'demo-domain',
    instanceId: 'hello-world',
    executeActionsChain,
    initialProperties: {
      [HAI3_SHARED_PROPERTY_THEME]: expectedTheme,
      [HAI3_SHARED_PROPERTY_LANGUAGE]: expectedLanguage,
    },
  });

  const { container, unmount } = render(<HelloWorldScreen bridge={bridgeFixture.bridge} />);
  const rootElement = container.firstChild as HTMLElement | null;
  const host = rootElement ? mockShadowHost(rootElement).host : document.createElement('div');

  await screen.findByRole('heading', { level: 1 });

  return {
    bridgeFixture,
    executeActionsChain,
    expectedLanguage,
    expectedTheme,
    host,
    rootElement,
    unmount,
  };
}

describe('HelloWorldScreen', () => {
  beforeEach(() => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders bridge data and initial shared properties', async () => {
    const { expectedLanguage, expectedTheme, rootElement } = await setupHelloWorldScreen();

    expect(rootElement?.getAttribute('dir')).toBeNull();
    expect(screen.getByText('demo-domain')).toBeTruthy();
    expect(screen.getByText('hello-world')).toBeTruthy();
    expect(screen.getByText(expectedTheme)).toBeTruthy();
    expect(screen.getByText(expectedLanguage)).toBeTruthy();
  });

  it('subscribes to theme and language bridge properties', async () => {
    const { bridgeFixture } = await setupHelloWorldScreen();

    await waitFor(() => {
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_THEME, expect.any(Function));
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_LANGUAGE, expect.any(Function));
    });
  });

  it('updates the language value and host direction', async () => {
    const { host, bridgeFixture } = await setupHelloWorldScreen();

    await act(async () => {
      bridgeFixture.setProperty(HAI3_SHARED_PROPERTY_LANGUAGE, 'ar');
    });

    await waitFor(() => {
      expect(host.getAttribute('dir')).toBe(TextDirection.RightToLeft);
      expect(screen.getByText('ar')).toBeTruthy();
    });
  });

  it('dispatches the theme navigation action', async () => {
    const { executeActionsChain } = await setupHelloWorldScreen();
    const user = userEvent.setup();
    const goToThemeButton = screen.getByRole('button', { name: 'go_to_theme' });

    await user.click(goToThemeButton);

    await waitFor(() => {
      expect(executeActionsChain).toHaveBeenCalledTimes(1);
      expect(executeActionsChain).toHaveBeenCalledWith({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: HAI3_SCREEN_DOMAIN,
          payload: { subject: THEME_EXTENSION_ID },
        },
      });
    });
  });

  it('dispatches the profile mount and refresh action chain', async () => {
    const { executeActionsChain } = await setupHelloWorldScreen();
    const user = userEvent.setup();
    const openProfileButton = screen.getByRole('button', { name: 'open_profile_refresh' });

    await user.click(openProfileButton);

    await waitFor(() => {
      expect(executeActionsChain).toHaveBeenCalledTimes(1);
      expect(executeActionsChain).toHaveBeenCalledWith({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: HAI3_SCREEN_DOMAIN,
          payload: { subject: PROFILE_EXTENSION_ID },
        },
        next: {
          action: {
            type: DEMO_ACTION_REFRESH_PROFILE,
            target: PROFILE_EXTENSION_ID,
          },
        },
      });
    });
  });

  it('unsubscribes from bridge properties on unmount', async () => {
    const { unmount, bridgeFixture } = await setupHelloWorldScreen();

    unmount();

    for (const { unsubscribe } of bridgeFixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });
});
