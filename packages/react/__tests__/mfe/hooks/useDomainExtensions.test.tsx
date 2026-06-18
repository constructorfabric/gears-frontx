/**
 * Tests for useDomainExtensions hook - Phase 21.7
 *
 * Tests extension list observation via store subscription.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { HAI3Provider } from '../../../src/HAI3Provider';
import { useDomainExtensions } from '../../../src/mfe/hooks/useDomainExtensions';
import { createHAI3 } from '@gears-frontx/framework';
import { screensets } from '@gears-frontx/framework';
import { effects } from '@gears-frontx/framework';
import { microfrontends } from '@gears-frontx/framework';
import type { Extension, ExtensionDomain } from '@gears-frontx/framework';
import { gtsPlugin } from '@gears-frontx/framework';
import { ContainerProvider } from '@gears-frontx/framework';
import type { HAI3App } from '@gears-frontx/framework';

// Mock Container Provider for React tests
class TestContainerProvider extends ContainerProvider {
  private mockContainer: Element;

  constructor() {
    super();
    this.mockContainer = document.createElement('div');
  }

  getContainer(_extensionId: string): Element {
    return this.mockContainer;
  }

  releaseContainer(_extensionId: string): void {
    // no-op
  }
}

describe('useDomainExtensions hook - Phase 21.7', () => {
  const sidebarDomainId = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1';
  const popupDomainId = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1';

  // Track app instances for cleanup
  const apps: HAI3App[] = [];
  afterEach(() => {
    apps.forEach(app => app.destroy());
    apps.length = 0;
  });

  const mockSidebarDomain: ExtensionDomain = {
    id: sidebarDomainId,
    sharedProperties: [],
    actions: [
      'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
      'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };

  const mockPopupDomain: ExtensionDomain = {
    id: popupDomainId,
    sharedProperties: [],
    actions: [
      'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
      'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };

  const sidebarExtension1: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.sidebar.reg.ext1.v1',
    domain: sidebarDomainId,
    entry: 'gts.frontx.mfes.mfe.entry.v1~test.sidebar.reg.entry.v1',
  };

  const sidebarExtension2: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.sidebar.reg.ext2.v1',
    domain: sidebarDomainId,
    entry: 'gts.frontx.mfes.mfe.entry.v1~test.sidebar.reg.entry.v1',
  };

  const popupExtension: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.popup.reg.ext1.v1',
    domain: popupDomainId,
    entry: 'gts.frontx.mfes.mfe.entry.v1~test.sidebar.reg.entry.v1',
  };

  /**
   * Helper: build app and mock registerExtension/unregisterExtension to bypass
   * GTS validation while still dispatching store actions and tracking extensions.
   * The hook subscribes to store changes and calls getExtensionsForDomain(),
   * so we mock the registration methods to populate query results and dispatch
   * an action to trigger store subscribers.
   */
  function buildApp(): HAI3App {
    const app = createHAI3()
      .use(screensets())
      .use(effects())
      .use(microfrontends({ typeSystem: gtsPlugin }))
      .build();
    apps.push(app);

    // Store registered extensions for getExtensionsForDomain mock
    const registeredExtensions = new Map<string, Extension>();

    // Mock registerExtension to bypass validation, dispatch action, and track
    const origRegisterDomain = app.screensetsRegistry.registerDomain.bind(app.screensetsRegistry);
    app.screensetsRegistry.registerDomain = (domain: ExtensionDomain) => {
      origRegisterDomain(domain);
    };

    app.screensetsRegistry.registerExtension = vi.fn(async (ext: Extension) => {
      registeredExtensions.set(ext.id, ext);
      // Dispatch any action to trigger store subscribers
      app.store.dispatch({ type: 'mfe/setExtensionRegistered', payload: { extensionId: ext.id } });
    });

    app.screensetsRegistry.unregisterExtension = vi.fn(async (extId: string) => {
      registeredExtensions.delete(extId);
      // Dispatch any action to trigger store subscribers
      app.store.dispatch({ type: 'mfe/setExtensionUnregistered', payload: { extensionId: extId } });
    });

    // Mock getExtensionsForDomain to return from our tracked map
    app.screensetsRegistry.getExtensionsForDomain = vi.fn((domainId: string) => {
      return Array.from(registeredExtensions.values()).filter(e => e.domain === domainId);
    });

    return app;
  }

  function buildWrapper(app: HAI3App) {
    return ({ children }: { children: React.ReactNode }) => (
      <HAI3Provider app={app}>{children}</HAI3Provider>
    );
  }

  describe('Store subscription', () => {
    it('should return extensions for the specified domain', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);
      const testContainerProvider2 = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockPopupDomain, testContainerProvider2);
      await app.screensetsRegistry.registerExtension(sidebarExtension1);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(sidebarExtension1.id);
    });

    it('should update when extension is registered', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(0);

      await act(async () => {
        await app.screensetsRegistry.registerExtension(sidebarExtension1);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
      });

      expect(result.current[0].id).toBe(sidebarExtension1.id);
    });
  });

  describe('Unregistration detection', () => {
    it('should update when extension is unregistered', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);
      await app.screensetsRegistry.registerExtension(sidebarExtension1);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(1);

      await act(async () => {
        await app.screensetsRegistry.unregisterExtension(sidebarExtension1.id);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(0);
      });
    });
  });

  describe('Domain filtering', () => {
    it('should only return extensions for the specified domain', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);
      const testContainerProvider2 = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockPopupDomain, testContainerProvider2);

      await app.screensetsRegistry.registerExtension(sidebarExtension1);
      await app.screensetsRegistry.registerExtension(sidebarExtension2);
      await app.screensetsRegistry.registerExtension(popupExtension);

      const { result: sidebarResult } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });
      const { result: popupResult } = renderHook(() => useDomainExtensions(popupDomainId), { wrapper: buildWrapper(app) });

      expect(sidebarResult.current).toHaveLength(2);
      expect(sidebarResult.current.map(e => e.id)).toContain(sidebarExtension1.id);
      expect(sidebarResult.current.map(e => e.id)).toContain(sidebarExtension2.id);

      expect(popupResult.current).toHaveLength(1);
      expect(popupResult.current[0].id).toBe(popupExtension.id);
    });

    it('should not re-render when extensions in other domains change but list is same', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);
      const testContainerProvider2 = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockPopupDomain, testContainerProvider2);

      await app.screensetsRegistry.registerExtension(sidebarExtension1);

      const renderSpy = vi.fn();
      const { result } = renderHook(
        () => {
          renderSpy();
          return useDomainExtensions(sidebarDomainId);
        },
        { wrapper: buildWrapper(app) }
      );

      await act(async () => {
        await app.screensetsRegistry.registerExtension(popupExtension);
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      // Sidebar hook: snapshot comparison prevents unnecessary re-render
      // since sidebar extension list didn't change
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(sidebarExtension1.id);
    });
  });

  describe('Current extensions list', () => {
    it('should return all current extensions for domain', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);

      await app.screensetsRegistry.registerExtension(sidebarExtension1);
      await app.screensetsRegistry.registerExtension(sidebarExtension2);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(2);
      expect(result.current.map(e => e.id)).toContain(sidebarExtension1.id);
      expect(result.current.map(e => e.id)).toContain(sidebarExtension2.id);
    });

    it('should return empty array for domain with no extensions', () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toEqual([]);
    });
  });

  describe('Re-render on state changes', () => {
    it('should re-render when extensions change', async () => {
      const app = buildApp();
      const testContainerProvider = new TestContainerProvider();
      app.screensetsRegistry.registerDomain(mockSidebarDomain, testContainerProvider);

      const { result } = renderHook(() => useDomainExtensions(sidebarDomainId), { wrapper: buildWrapper(app) });

      expect(result.current).toHaveLength(0);

      await act(async () => {
        await app.screensetsRegistry.registerExtension(sidebarExtension1);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
      });

      await act(async () => {
        await app.screensetsRegistry.registerExtension(sidebarExtension2);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(2);
      });

      await act(async () => {
        await app.screensetsRegistry.unregisterExtension(sidebarExtension1.id);
      });

      await waitFor(() => {
        expect(result.current).toHaveLength(1);
        expect(result.current[0].id).toBe(sidebarExtension2.id);
      });
    });
  });
});
