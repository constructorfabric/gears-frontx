/**
 * Tests for theme and language propagation - decouple-domain-contracts
 *
 * Verifies that theme/changed and i18n/language/changed events propagate
 * shared properties via themes() and i18n() plugins calling updateSharedProperty
 * on the screensetsRegistry. Propagation is no longer owned by microfrontends().
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createHAI3 } from '../../../src/createHAI3';
import { screensets } from '../../../src/plugins/screensets';
import { effects } from '../../../src/plugins/effects';
import { themes } from '../../../src/plugins/themes';
import { i18n } from '../../../src/plugins/i18n';
import { microfrontends } from '../../../src/plugins/microfrontends';
import { eventBus, resetStore } from '@gears-frontx/state';
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/screensets';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import type { HAI3App } from '../../../src/types';

describe('Theme and Language Propagation - decouple-domain-contracts', () => {
  let apps: HAI3App[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    apps.forEach(app => app.destroy());
    apps = [];
    // Clear all event bus listeners to prevent handler accumulation across tests.
    // The themes() and i18n() plugins subscribe in onInit but have no onDestroy cleanup,
    // so without this, handlers from previous test apps bleed into subsequent tests.
    eventBus.clearAll();
    resetStore();
  });

  describe('theme propagation via themes() plugin', () => {
    it('should call setTheme and updateSharedProperty when theme/changed event fires', () => {
      const app = createHAI3()
        .use(screensets())
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

      const setThemeSpy = vi.spyOn(app.screensetsRegistry!, 'setTheme');
      const updateSpy = vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      expect(setThemeSpy).toHaveBeenCalledWith({ '--color-bg': 'hsl(var(--primary))' });
      expect(updateSpy).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_THEME, 'dark');
    });

    it('should not throw when theme/changed fires even if updateSharedProperty throws', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw new Error('GTS validation failed');
      });

      expect(() => {
        eventBus.emit('theme/changed', { themeId: 'bad-theme' });
      }).not.toThrow();
    });

    it('should emit theme/propagation/failed when updateSharedProperty throws', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const propagationError = new Error('GTS validation failed');
      vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty').mockImplementation(() => {
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
        .use(screensets())
        .use(effects())
        .use(themes())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      // Register a theme so apply() has something to work with
      app.themeRegistry.register({ id: 'dark', name: 'Dark', variables: {} });

      vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw new Error('GTS validation failed');
      });

      // Theme registry apply should still be called — propagation failure must not prevent it
      const applySpy = vi.spyOn(app.themeRegistry, 'apply');

      expect(() => {
        eventBus.emit('theme/changed', { themeId: 'dark' });
      }).not.toThrow();

      expect(applySpy).toHaveBeenCalledWith('dark');
    });
  });

  describe('language propagation via i18n() plugin', () => {
    it('should call updateSharedProperty with language when i18n/language/changed event fires', async () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty');

      eventBus.emit('i18n/language/changed', { language: 'de' });

      // The i18n event handler is async and internally awaits i18nRegistry.setLanguage()
      // which itself awaits loadLanguage() and Promise.all(). We need multiple microtask
      // flushes to let the entire async chain complete before asserting.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(updateSpy).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_LANGUAGE, 'de');
    });

    it('should not throw when i18n/language/changed fires even if updateSharedProperty throws', async () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw new Error('GTS validation failed');
      });

      await expect(async () => {
        eventBus.emit('i18n/language/changed', { language: 'xx' });
        await Promise.resolve();
      }).not.toThrow();
    });

    it('should emit i18n/propagation/failed when updateSharedProperty throws', async () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(i18n())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const propagationError = new Error('GTS validation failed');
      vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty').mockImplementation(() => {
        throw propagationError;
      });

      const failHandler = vi.fn();
      eventBus.on('i18n/propagation/failed', failHandler);

      eventBus.emit('i18n/language/changed', { language: 'xx' });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(failHandler).toHaveBeenCalledWith({
        language: 'xx',
        error: propagationError,
      });
    });
  });

  describe('soft dependency: screensetsRegistry undefined (no microfrontends plugin)', () => {
    it('themes() plugin works correctly and applies theme when screensetsRegistry is absent', () => {
      // Build without microfrontends plugin — screensetsRegistry will be undefined
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(themes())
        .build();
      apps.push(app);

      expect(app.screensetsRegistry).toBeUndefined();

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

    it('i18n() plugin works correctly and sets language when screensetsRegistry is absent', async () => {
      // Build without microfrontends plugin — screensetsRegistry will be undefined
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(i18n())
        .build();
      apps.push(app);

      expect(app.screensetsRegistry).toBeUndefined();

      const setLanguageSpy = vi.spyOn(app.i18nRegistry, 'setLanguage');

      // Must not throw — optional chaining skips updateSharedProperty silently
      await expect(async () => {
        eventBus.emit('i18n/language/changed', { language: 'es' });
        await Promise.resolve();
      }).not.toThrow();

      // i18n registry must still set the language
      expect(setLanguageSpy).toHaveBeenCalledWith('es');
    });
  });

  describe('microfrontends() plugin no longer owns propagation', () => {
    it('should not call updateSharedProperty from microfrontends onInit for theme events', () => {
      // Build with only microfrontends (no themes plugin) — propagation must not occur
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty');

      eventBus.emit('theme/changed', { themeId: 'dark' });

      // microfrontends no longer subscribes to theme/changed
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should not call updateSharedProperty from microfrontends onInit for language events', async () => {
      // Build with only microfrontends (no i18n plugin) — propagation must not occur
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const updateSpy = vi.spyOn(app.screensetsRegistry!, 'updateSharedProperty');

      eventBus.emit('i18n/language/changed', { language: 'de' });
      await Promise.resolve();

      // microfrontends no longer subscribes to i18n/language/changed
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
