/**
 * Tests for theme and language propagation - decouple-domain-contracts
 *
 * Verifies that theme/changed and i18n/language/changed events propagate
 * shared properties via themes() and i18n() plugins calling updateSharedProperty
 * on the mfeRegistry. Propagation is no longer owned by microfrontends().
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createHAI3 } from '../../../src/createHAI3';
import { effects } from '../../../src/plugins/effects';
import { themes } from '../../../src/plugins/themes';
import { i18n } from '../../../src/plugins/i18n';
import { microfrontends } from '../../../src/plugins/microfrontends';
import { eventBus, resetStore } from '@gears-frontx/state';
import { HAI3_SHARED_PROPERTY_THEME, HAI3_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/screensets';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import type { HAI3App } from '../../../src/types';

describe('Theme and Language Propagation - decouple-domain-contracts', () => {
  let apps: HAI3App[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    apps.forEach((app) => {
      app.destroy();
    });
    apps = [];
    // Clear test-local listeners registered inside assertions.
    eventBus.clearAll();
    resetStore();
  });

  describe('theme propagation via themes() plugin', () => {
    it('should call setTheme and updateSharedProperty when theme/changed event fires', () => {
      const app = createHAI3()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      app.themeRegistry.register({
        id: 'dark',
        name: 'Dark',
        variables: { '--color-bg': 'hsl(var(--primary))' },
      });

      const setThemeSpy = vi.spyOn(app.mfeRegistry!, 'setTheme');
      const updateSpy = vi.spyOn(app.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(setThemeSpy).toHaveBeenCalledWith({ '--color-bg': 'hsl(var(--primary))' });
      expect(updateSpy).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_THEME, 'dark');
    });

    it('should not throw when theme/changed fires even if updateSharedProperty throws', () => {
      const app = createHAI3()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      vi.spyOn(app.mfeRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw new Error('GTS validation failed');
      });

      expect(() => {
        eventBus.emit('theme/changed', { themeId: 'bad-theme' });
      }).not.toThrow();
    });

    it('should emit theme/propagation/failed when updateSharedProperty throws', () => {
      const app = createHAI3()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const propagationError = new Error('GTS validation failed');
      vi.spyOn(app.mfeRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw propagationError;
      });

      const failHandler = vi.fn();
      eventBus.on('theme/propagation/failed', failHandler);

      eventBus.emit('theme/changed', { themeId: 'bad-theme' });

      expect(failHandler).toHaveBeenCalledWith({
        themeId: 'bad-theme',
        error: propagationError,
      });
    });

    it('should still apply the theme even if updateSharedProperty throws', () => {
      const app = createHAI3()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      // Register a theme so apply() has something to work with
      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });

      vi.spyOn(app.mfeRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw new Error('GTS validation failed');
      });

      // Theme registry apply should still be called — propagation failure must not prevent it
      const applySpy = vi.spyOn(app.themeRegistry, 'apply');

      expect(() => {
        eventBus.emit('theme/changed', { themeId: 'dark' });
      }).not.toThrow();

      expect(applySpy).toHaveBeenCalledWith('dark');
    });

    it('should unsubscribe theme propagation when the plugin app is destroyed', () => {
      const firstApp = createHAI3()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(firstApp);

      firstApp.destroy();
      apps = apps.filter((app) => app !== firstApp);

      const secondApp = createHAI3()
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(secondApp);

      const updateSpy = vi.spyOn(secondApp.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(updateSpy).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_THEME, 'dark');
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('language propagation via i18n() plugin', () => {
    it('should call updateSharedProperty with language when i18n/language/changed event fires', async () => {
      const app = createHAI3()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('i18n/language/changed', { language: 'de' });

      // The i18n event handler is async and internally awaits several promises.
      // Use vi.waitFor so the assertion is driven by observable state rather
      // than by a fixed microtask count that would break if the handler's
      // async chain grows or shrinks.
      await vi.waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_LANGUAGE, 'de');
      });
    });

    it('should not throw when i18n/language/changed fires even if updateSharedProperty throws', async () => {
      const app = createHAI3()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      vi.spyOn(app.mfeRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw new Error('GTS validation failed');
      });

      // Track unhandled rejections to surface async failures that a simple
      // not.toThrow assertion would silently miss.
      const unhandled: unknown[] = [];
      function onUnhandled(reason: unknown): void {
        unhandled.push(reason);
      }
      process.on('unhandledRejection', onUnhandled);

      try {
        const failHandler = vi.fn();
        eventBus.on('i18n/propagation/failed', failHandler);

        await expect(
          (async () => {
            eventBus.emit('i18n/language/changed', { language: 'xx' });
            // Wait for the propagation-failed event as a proxy for the async
            // chain settling; ensures no rejection escapes the handler.
            await vi.waitFor(() => {
              expect(failHandler).toHaveBeenCalled();
            });
          })()
        ).resolves.not.toThrow();

        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });

    it('should emit i18n/propagation/failed when updateSharedProperty throws', async () => {
      const app = createHAI3()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const propagationError = new Error('GTS validation failed');
      vi.spyOn(app.mfeRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw propagationError;
      });

      const failHandler = vi.fn();
      eventBus.on('i18n/propagation/failed', failHandler);

      eventBus.emit('i18n/language/changed', { language: 'xx' });

      await vi.waitFor(() => {
        expect(failHandler).toHaveBeenCalledWith({
          language: 'xx',
          error: propagationError,
        });
      });
    });

    it('should unsubscribe language propagation when the plugin app is destroyed', async () => {
      const firstApp = createHAI3()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(firstApp);

      firstApp.destroy();
      apps = apps.filter((app) => app !== firstApp);

      const secondApp = createHAI3()
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(secondApp);

      const updateSpy = vi.spyOn(secondApp.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('i18n/language/changed', { language: 'de' });

      await vi.waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(HAI3_SHARED_PROPERTY_LANGUAGE, 'de');
      });
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('soft dependency: mfeRegistry undefined (no microfrontends plugin)', () => {
    it('themes() plugin works correctly and applies theme when mfeRegistry is absent', () => {
      // Build without microfrontends plugin — mfeRegistry will be undefined
      const app = createHAI3()
        .use(effects())
        .use(themes())
        .build();
      apps.push(app);

      expect(app.mfeRegistry).toBeUndefined();

      // Register a theme so apply() has something to work with
      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });
      const applySpy = vi.spyOn(app.themeRegistry, 'apply');

      // Must not throw — optional chaining skips updateSharedProperty silently
      expect(() => {
        eventBus.emit('theme/changed', { themeId: 'dark' });
      }).not.toThrow();

      // Theme registry must still apply the theme
      expect(applySpy).toHaveBeenCalledWith('dark');
    });

    it('i18n() plugin works correctly and sets language when mfeRegistry is absent', async () => {
      // Build without microfrontends plugin — mfeRegistry will be undefined
      const app = createHAI3()
        .use(effects())
        .use(i18n())
        .build();
      apps.push(app);

      expect(app.mfeRegistry).toBeUndefined();

      const setLanguageSpy = vi.spyOn(app.i18nRegistry, 'setLanguage');

      const unhandled: unknown[] = [];
      function onUnhandled(reason: unknown): void {
        unhandled.push(reason);
      }
      process.on('unhandledRejection', onUnhandled);

      try {
        await expect(
          (async () => {
            eventBus.emit('i18n/language/changed', { language: 'es' });
            await vi.waitFor(() => {
              expect(setLanguageSpy).toHaveBeenCalledWith('es');
            });
          })()
        ).resolves.not.toThrow();

        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });

  describe('microfrontends() plugin no longer owns propagation', () => {
    it('should not call updateSharedProperty from microfrontends onInit for theme events', () => {
      // Build with only microfrontends (no themes plugin) — propagation must not occur
      const app = createHAI3()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      // microfrontends no longer subscribes to theme/changed
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should not call updateSharedProperty from microfrontends onInit for language events', async () => {
      // Build with only microfrontends (no i18n plugin) — propagation must not occur
      const app = createHAI3()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.mfeRegistry!, 'updateSharedProperty');

      eventBus.emit('i18n/language/changed', { language: 'de' });
      await Promise.resolve();

      // microfrontends no longer subscribes to i18n/language/changed
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
