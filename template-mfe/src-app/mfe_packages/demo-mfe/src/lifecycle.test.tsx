import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMfeBridgeFixture } from '../../../__test-utils__/createMfeBridgeFixture';

type BridgeFixture = ReturnType<typeof createMfeBridgeFixture>;
type TestBridge = BridgeFixture['bridge'];
type TestApp = { id: string };
type ActionPayload = Record<string, string | number | boolean | null>;

const superMountSpy = vi.fn();
const fetchUserSpy = vi.fn();

vi.mock('@gears-frontx/react', () => ({
  ActionHandler: class ActionHandler {
    static {
      void 0;
    }
  },
  ThemeAwareReactLifecycle: class ThemeAwareReactLifecycle {
    constructor(public readonly app: TestApp) {}

    mount(container: Element | ShadowRoot, bridge: TestBridge): void {
      superMountSpy(container, bridge);
    }
  },
}));

vi.mock('./init', () => ({
  mfeApp: { id: 'demo-mfe-app' },
}));

vi.mock('./actions/profileActions', () => ({
  fetchUser: fetchUserSpy,
}));

vi.mock('./screens/helloworld/HelloWorldScreen', () => ({
  HelloWorldScreen: ({ bridge }: { bridge: { instanceId: string } }) => (
    <div data-testid="hello-screen">{bridge.instanceId}</div>
  ),
}));

vi.mock('./screens/profile/ProfileScreen', () => ({
  ProfileScreen: ({ bridge }: { bridge: { domainId: string } }) => (
    <div data-testid="profile-screen">{bridge.domainId}</div>
  ),
}));

vi.mock('./screens/theme/CurrentThemeScreen', () => ({
  CurrentThemeScreen: ({ bridge }: { bridge: { instanceId: string } }) => (
    <div data-testid="theme-screen">{bridge.instanceId}</div>
  ),
}));

describe('demo-mfe lifecycles', () => {
  it('renders the hello world lifecycle content', async () => {
    const module = await import('./lifecycle-helloworld');
    const lifecycle = module.default;
    const renderContent = Reflect.get(lifecycle, 'renderContent') as (
      bridge: TestBridge,
    ) => React.ReactNode;
    const { bridge } = createMfeBridgeFixture({
      domainId: 'demo-domain',
      instanceId: 'hello-instance',
    });

    expect(Reflect.get(lifecycle, 'app')).toEqual({ id: 'demo-mfe-app' } satisfies TestApp);
    render(<>{renderContent(bridge)}</>);

    expect(screen.getByTestId('hello-screen').textContent).toContain('hello-instance');
  });

  it('renders the theme lifecycle content', async () => {
    const module = await import('./lifecycle-theme');
    const lifecycle = module.default;
    const renderContent = Reflect.get(lifecycle, 'renderContent') as (
      bridge: TestBridge,
    ) => React.ReactNode;
    const { bridge } = createMfeBridgeFixture({
      domainId: 'demo-domain',
      instanceId: 'theme-instance',
    });

    expect(Reflect.get(lifecycle, 'app')).toEqual({ id: 'demo-mfe-app' } satisfies TestApp);
    render(<>{renderContent(bridge)}</>);

    expect(screen.getByTestId('theme-screen').textContent).toContain('theme-instance');
  });

  it('registers the refresh handler after profile mount and delegates to fetchUser', async () => {
    const module = await import('./lifecycle-profile');
    const lifecycle = module.default as {
      mount: (container: Element, bridge: TestBridge) => void;
    };
    const renderContent = Reflect.get(lifecycle, 'renderContent') as (
      bridge: TestBridge,
    ) => React.ReactNode;
    const fixture = createMfeBridgeFixture({
      domainId: 'profile-domain',
      instanceId: 'profile-instance',
    });
    const container = document.createElement('div');

    expect(Reflect.get(lifecycle, 'app')).toEqual({ id: 'demo-mfe-app' } satisfies TestApp);
    render(<>{renderContent(fixture.bridge)}</>);

    expect(screen.getByTestId('profile-screen').textContent).toContain('profile-domain');

    lifecycle.mount(container, fixture.bridge);

    expect(superMountSpy).toHaveBeenCalledWith(container, fixture.bridge);
    expect(fixture.registerActionHandler).toHaveBeenCalledTimes(1);

    const [actionId, handler] = fixture.registerActionHandler.mock.calls[0] as [
      string,
      { handleAction: (actionTypeId: string, payload: ActionPayload | undefined) => Promise<void> },
    ];

    expect(actionId).toBe(
      'gts.frontx.mfes.comm.action.v1~frontx.demo.action.refresh_profile.v1~'
    );

    await expect(handler.handleAction(actionId, undefined)).resolves.toBeUndefined();
    expect(fetchUserSpy).toHaveBeenCalledTimes(1);
  });
});
