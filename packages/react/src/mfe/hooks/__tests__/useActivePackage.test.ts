/**
 * Unit tests for useActivePackage hook.
 *
 * Uses a minimal mock app to avoid the GTS singleton and real framework build.
 * The hook reads getMountedExtensions(HAI3_SCREEN_DOMAIN)[0] and extracts the
 * GTS package via extractGtsPackage(id), returning undefined when the domain
 * has no mounted extensions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useActivePackage } from '../useActivePackage';
import { HAI3Context } from '../../../HAI3Context';
import type { HAI3App } from '@cyberfabric/framework';

// HAI3_SCREEN_DOMAIN constant — must match the production constant value.
const HAI3_SCREEN_DOMAIN = 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.screen.v1';

// A well-formed extension ID whose package segment is 'hai3.demo'.
// Format: gts.<schema-id>~<body-instance> where body encodes the package.
const EXT_ID_DEMO_HOME =
  'gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~hai3.demo.screens.home.v1';

// ─── Mock app builder ─────────────────────────────────────────────────────────

class MockApp {
  private readonly unsubscribeSpy = vi.fn();
  private notifier: (() => void) | null = null;
  private mountedScreens: string[] = [];

  readonly store = {
    subscribe: vi.fn((cb: () => void) => {
      this.notifier = cb;
      return this.unsubscribeSpy;
    }),
    getState: vi.fn(() => ({})),
    dispatch: vi.fn(),
  };

  readonly screensetsRegistry = {
    getMountedExtensions: vi.fn((domainId: string): readonly string[] => {
      if (domainId === HAI3_SCREEN_DOMAIN) {
        return this.mountedScreens;
      }
      return [];
    }),
    getExtension: vi.fn(() => undefined),
  };

  setMountedScreens(ids: string[]): void {
    this.mountedScreens = ids;
  }

  notify(): void {
    this.notifier?.();
  }
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderWithApp(mockApp: MockApp) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(HAI3Context.Provider, { value: mockApp as unknown as HAI3App }, children);

  return renderHook(() => useActivePackage(), { wrapper });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useActivePackage', () => {
  let mockApp: MockApp;

  beforeEach(() => {
    mockApp = new MockApp();
  });

  it('returns the GTS package from the first mounted screen extension', () => {
    mockApp.setMountedScreens([EXT_ID_DEMO_HOME]);

    const { result } = renderWithApp(mockApp);

    expect(result.current).toBe('hai3.demo');
  });

  it('returns undefined when no screen extension is mounted', () => {
    mockApp.setMountedScreens([]);

    const { result } = renderWithApp(mockApp);

    expect(result.current).toBeUndefined();
  });

  it('throws when screensetsRegistry is absent', () => {
    const appWithoutRegistry = {
      store: mockApp.store,
      screensetsRegistry: undefined,
    } as unknown as HAI3App;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(HAI3Context.Provider, { value: appWithoutRegistry }, children);

    expect(() =>
      renderHook(() => useActivePackage(), { wrapper })
    ).toThrow(/microfrontends plugin/i);
  });

  it('re-renders when the active package changes after a store notification', () => {
    const EXT_OTHER =
      'gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~hai3.other.screens.main.v1';

    mockApp.setMountedScreens([EXT_ID_DEMO_HOME]);
    const { result } = renderWithApp(mockApp);
    expect(result.current).toBe('hai3.demo');

    act(() => {
      mockApp.setMountedScreens([EXT_OTHER]);
      mockApp.notify();
    });

    expect(result.current).toBe('hai3.other');
  });

  it('returns undefined after active extension is unmounted (store notification)', () => {
    mockApp.setMountedScreens([EXT_ID_DEMO_HOME]);
    const { result } = renderWithApp(mockApp);
    expect(result.current).toBe('hai3.demo');

    act(() => {
      mockApp.setMountedScreens([]);
      mockApp.notify();
    });

    expect(result.current).toBeUndefined();
  });
});
