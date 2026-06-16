import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  HAI3_SHARED_PROPERTY_LANGUAGE,
  HAI3_SHARED_PROPERTY_THEME,
} from '@gears-frontx/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMfeBridgeFixture } from '../../../__test-utils__/createMfeBridgeFixture';

type BridgeFixture = ReturnType<typeof createMfeBridgeFixture>;
type TestBridge = BridgeFixture['bridge'];
type TestApp = { id: string };

const superMountSpy = vi.fn();
const {
  getServiceMock,
  useApiQueryMock,
  useScreenTranslationsMock,
} = vi.hoisted(() => ({
  getServiceMock: vi.fn(),
  useApiQueryMock: vi.fn(),
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    ThemeAwareReactLifecycle: class ThemeAwareReactLifecycle {
      constructor(public readonly app: TestApp) {}

      mount(container: Element | ShadowRoot, bridge: TestBridge): void {
        superMountSpy(container, bridge);
      }
    },
    apiRegistry: {
      getService: getServiceMock,
    },
    useApiQuery: useApiQueryMock,
  };
});

vi.mock('./init', () => ({
  mfeApp: { id: 'blank-mfe-app' },
}));

vi.mock('./api/_BlankApiService', () => ({
  _BlankApiService: class MockBlankApiService {
    static {
      void 0;
    }
  },
}));

vi.mock('./shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

describe('blank-mfe lifecycle', () => {
  beforeEach(() => {
    getServiceMock.mockReturnValue({ getStatus: { type: 'status' } });
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
    useApiQueryMock.mockReturnValue({
      data: {
        message: 'Blank MFE query example is active.',
        generatedAt: '2026-03-23T12:00:00.000Z',
        capabilities: ['query-key-factory'],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('binds the shared MFE app to the lifecycle instance', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default;

    expect(Reflect.get(lifecycle, 'app')).toEqual({ id: 'blank-mfe-app' } satisfies TestApp);
  });

  it('renders the real home screen with the provided bridge', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default;
    const renderContent = Reflect.get(lifecycle, 'renderContent');
    const { bridge } = createMfeBridgeFixture({
      domainId: 'blank-domain',
      instanceId: 'blank-instance',
      initialProperties: {
        [HAI3_SHARED_PROPERTY_THEME]: 'blank-theme',
        [HAI3_SHARED_PROPERTY_LANGUAGE]: 'en',
      },
    });

    expect(typeof renderContent).toBe('function');
    render(<>{renderContent(bridge) as React.ReactNode}</>);

    expect(await screen.findByText('blank-domain')).toBeTruthy();
    expect(screen.getByText('blank-instance')).toBeTruthy();
    expect(screen.getByText('blank-theme')).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes('Blank MFE query example is active.'))
    ).toBeTruthy();
  });

  it('inherits base mount behavior from ThemeAwareReactLifecycle', async () => {
    const module = await import('./lifecycle');
    const lifecycle = module.default as {
      mount: (container: Element, bridge: TestBridge) => void;
    };
    const container = document.createElement('div');
    const { bridge } = createMfeBridgeFixture({
      domainId: 'blank-domain',
      instanceId: 'blank-instance',
    });

    lifecycle.mount(container, bridge);

    expect(superMountSpy).toHaveBeenCalledWith(container, bridge);
  });
});
