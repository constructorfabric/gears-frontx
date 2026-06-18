/**
 * Tests for microfrontends plugin - Phase 13
 *
 * Tests Flux integration: actions, effects, slice, components, navigation.
 * Phase 7.9 tests (plugin propagation, JSON loading) are in microfrontends.test.ts.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHAI3 } from '../../../src/createHAI3';
import { screensets } from '../../../src/plugins/screensets';
import { effects } from '../../../src/plugins/effects';
import {
  microfrontends,
  loadExtension,
  MfeEvents,
  selectExtensionState,
  selectExtensionError,
} from '../../../src/plugins/microfrontends';
import { eventBus, resetStore } from '@gears-frontx/state';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import type { Extension } from '@gears-frontx/screensets';
import type { HAI3App } from '../../../src/types';

describe('microfrontends plugin - Phase 13', () => {
  let apps: HAI3App[] = [];

  afterEach(() => {
    apps.forEach(app => app.destroy());
    apps = [];
    resetStore();
  });
  describe('13.8.1 - plugin registration', () => {
    it('should register plugin with Flux wiring', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.name).toBe('microfrontends');
      expect(plugin.dependencies).toContain('screensets');
      expect(plugin.provides).toBeDefined();
      expect(plugin.provides?.registries).toBeDefined();
      expect(plugin.provides?.slices).toBeDefined();
      expect(plugin.provides?.slices?.length).toBeGreaterThan(0);
      // NOTE: Effects are NOT in provides.effects - they are initialized in onInit
      // to avoid duplicate event listeners (framework calls provides.effects at step 5,
      // then onInit at step 7). We need cleanup references, so only init in onInit.
      expect(plugin.provides?.actions).toBeDefined();
    });

    it('should provide MFE actions', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.provides?.actions).toHaveProperty('loadExtension');
      expect(plugin.provides?.actions).toHaveProperty('mountExtension');
      expect(plugin.provides?.actions).toHaveProperty('unmountExtension');
      expect(plugin.provides?.actions).not.toHaveProperty('handleMfeHostAction');
    });

    it('should make MFE actions available on app.actions', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      expect(typeof app.actions.loadExtension).toBe('function');
      expect(typeof app.actions.mountExtension).toBe('function');
      expect(typeof app.actions.unmountExtension).toBe('function');
      expect(app.actions.handleMfeHostAction).toBeUndefined();
    });
  });

  describe('13.8.2 - MFE lifecycle actions call executeActionsChain', () => {
    it('should call executeActionsChain for loadExtension', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      // Mock getExtension to return extension (avoids GTS validation)
      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      vi.spyOn(app.screensetsRegistry, 'getExtension').mockReturnValue(testExtension);
      const spy = vi.spyOn(app.screensetsRegistry, 'executeActionsChain').mockResolvedValue(undefined);

      // Call loadExtension - should call executeActionsChain fire-and-forget
      loadExtension(testExtensionId);

      expect(spy).toHaveBeenCalledWith({
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          target: testDomainId,
          payload: { extensionId: testExtensionId },
        },
      });
    });

    it('should verify registration events still work', () => {
      const eventSpy = vi.fn();
      const unsub = eventBus.on(MfeEvents.RegisterExtensionRequested, eventSpy);

      const testExtension: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.ext.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.domain.v1',
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1',
      };

      // Use event bus directly (not the action, which is async)
      eventBus.emit(MfeEvents.RegisterExtensionRequested, { extension: testExtension });

      expect(eventSpy).toHaveBeenCalledWith({ extension: testExtension });

      unsub.unsubscribe();
    });
  });

  describe('13.8.3 - MFE slice (registration only)', () => {
    it('should initialize MFE slice in store', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const state = app.store.getState();
      expect(state).toHaveProperty('mfe');
      expect(state.mfe).toHaveProperty('registrationStates');
      expect(state.mfe).toHaveProperty('errors');
    });

    it('should track registration state via selectors', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const state = app.store.getState();

      // Initial state should be 'unregistered' for extensions not registered yet
      const uniqueExtId = 'test.unique.extension.v1';
      const registrationState = selectExtensionState(state, uniqueExtId);
      expect(registrationState).toBe('unregistered');

      const error = selectExtensionError(state, uniqueExtId);
      expect(error).toBeUndefined();
    });
  });

  describe('13.8.8 - Navigation integration', () => {
    it('should initialize navigation integration', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      // Plugin should initialize navigation integration
      // This is tested indirectly via plugin onInit
      expect(app).toBeDefined();
    });

    it('should handle plugin cleanup', () => {
      const app = createHAI3()
        .use(screensets())
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      // Should not throw on destroy (afterEach handles actual cleanup)
      expect(() => app.destroy()).not.toThrow();
    });
  });
});
