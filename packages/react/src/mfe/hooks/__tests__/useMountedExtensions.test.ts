/**
 * Unit tests for useMountedExtensions hook.
 *
 * Uses a minimal mock app — no real framework build — so tests run fast and
 * don't depend on the GTS singleton state. The hook only accesses:
 *   - app.store.subscribe (to detect mount-set changes)
 *   - app.screensetsRegistry.getMountedExtensions(domainId)
 *   - app.screensetsRegistry.getExtension(id)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useMountedExtensions } from '../useMountedExtensions';
import { HAI3Context } from '../../../HAI3Context';
import type { HAI3App } from '@cyberfabric/framework';
import type { Extension } from '@cyberfabric/framework';

// ─── Mock extension factory ───────────────────────────────────────────────────

function makeExtension(id: string): Extension {
  return {
    id,
    domain: 'test-domain',
    entry: 'gts.test~',
  } as unknown as Extension;
}

// ─── Mock app builder ─────────────────────────────────────────────────────────

class MockApp {
  private readonly unsubscribeSpy: ReturnType<typeof vi.fn>;
  private notifier: (() => void) | null = null;
  private mountedByDomain: Map<string, string[]> = new Map();
  private extensionById: Map<string, Extension> = new Map();

  constructor() {
    this.unsubscribeSpy = vi.fn();
  }

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
      return this.mountedByDomain.get(domainId) ?? [];
    }),
    getExtension: vi.fn((id: string): Extension | undefined => {
      return this.extensionById.get(id);
    }),
  };

  // Test helpers
  setMounted(domainId: string, ids: string[]): void {
    this.mountedByDomain.set(domainId, ids);
  }
  setExtension(ext: Extension): void {
    this.extensionById.set(ext.id, ext);
  }
  notify(): void {
    this.notifier?.();
  }
  getUnsubscribeSpy(): ReturnType<typeof vi.fn> {
    return this.unsubscribeSpy;
  }
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderWithApp(mockApp: MockApp, domainId: string) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(HAI3Context.Provider, { value: mockApp as unknown as HAI3App }, children);

  return renderHook(() => useMountedExtensions(domainId), { wrapper });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useMountedExtensions', () => {
  const DOMAIN = 'test.domain.a';
  let mockApp: MockApp;

  beforeEach(() => {
    mockApp = new MockApp();
  });

  it('returns the mounted Extension instances for a domain with two mounted ids', () => {
    const extA = makeExtension('ext-a');
    const extB = makeExtension('ext-b');
    mockApp.setExtension(extA);
    mockApp.setExtension(extB);
    mockApp.setMounted(DOMAIN, ['ext-a', 'ext-b']);

    const { result } = renderWithApp(mockApp, DOMAIN);

    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).toBe('ext-a');
    expect(result.current[1].id).toBe('ext-b');
  });

  it('throws when screensetsRegistry is absent', () => {
    // Build an app without screensetsRegistry property set.
    const appWithoutRegistry = {
      store: mockApp.store,
      screensetsRegistry: undefined,
    } as unknown as HAI3App;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(HAI3Context.Provider, { value: appWithoutRegistry }, children);

    expect(() =>
      renderHook(() => useMountedExtensions(DOMAIN), { wrapper })
    ).toThrow(/microfrontends plugin/i);
  });

  it('subscribes on render and unsubscribes on unmount', () => {
    const { unmount } = renderWithApp(mockApp, DOMAIN);

    expect(mockApp.store.subscribe).toHaveBeenCalledTimes(1);
    const unsubscribeSpy = mockApp.getUnsubscribeSpy();
    expect(unsubscribeSpy).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('returns a ref-stable array when getMountedExtensions returns a new array with the same ids', () => {
    const extA = makeExtension('ext-a');
    mockApp.setExtension(extA);
    mockApp.setMounted(DOMAIN, ['ext-a']);

    const { result } = renderWithApp(mockApp, DOMAIN);
    const firstRef = result.current;

    // Trigger a store notification — getMountedExtensions returns a new array
    // instance but with the same id, so the hook should reuse the cached snapshot.
    act(() => {
      // Swap the underlying data to a new array instance with the same content.
      mockApp.setMounted(DOMAIN, ['ext-a']);
      mockApp.notify();
    });

    expect(result.current).toBe(firstRef);
  });

  it('filters out undefined extensions when getExtension returns undefined for an id', () => {
    // 'ext-missing' is in the mount-set but has no registered extension.
    mockApp.setMounted(DOMAIN, ['ext-missing']);
    // getExtension('ext-missing') returns undefined (nothing set in map)

    const { result } = renderWithApp(mockApp, DOMAIN);

    expect(result.current).toHaveLength(0);
  });

  it('re-renders when the mount-set changes after a store notification', () => {
    const extA = makeExtension('ext-a');
    mockApp.setExtension(extA);
    mockApp.setMounted(DOMAIN, []);

    const { result } = renderWithApp(mockApp, DOMAIN);
    expect(result.current).toHaveLength(0);

    act(() => {
      mockApp.setMounted(DOMAIN, ['ext-a']);
      mockApp.notify();
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('ext-a');
  });
});
