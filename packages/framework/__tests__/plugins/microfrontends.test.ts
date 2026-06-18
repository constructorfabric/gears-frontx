/**
 * Tests for microfrontends plugin - Phase 7.9
 *
 * Tests plugin propagation and JSON loading ONLY.
 * Flux integration tests (actions, effects, slice) are in Phase 13.8.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createHAI3 } from '../../src/createHAI3';
import { screensets } from '../../src/plugins/screensets';
import {
  microfrontends,
} from '../../src/plugins/microfrontends';
import { loadLayoutDomains } from '../../src/plugins/microfrontends/gts/loader';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import { themeSchema, languageSchema, extensionScreenSchema } from '../../src/gts';
import type { ScreensetsRegistry } from '@gears-frontx/framework';
import { ContainerProvider } from '@gears-frontx/framework';
import type { HAI3App } from '../../src/types';

// Mock Container Provider for framework tests
class TestContainerProvider extends ContainerProvider {
  private mockContainer: Element;

  constructor() {
    super();
    // Create a mock DOM element for testing
    if (typeof document !== 'undefined') {
      this.mockContainer = document.createElement('div');
    } else {
      // Fallback for non-DOM environments
      this.mockContainer = { tagName: 'DIV' } as Element;
    }
  }

  getContainer(_extensionId: string): Element {
    return this.mockContainer;
  }

  releaseContainer(_extensionId: string): void {
    // no-op
  }
}

describe('microfrontends plugin - Phase 7.9', () => {
  // Load layout domains once for all tests
  const [sidebarDomain, popupDomain, screenDomain, overlayDomain] = loadLayoutDomains();
  let apps: HAI3App[] = [];

  beforeEach(() => {
    // The layout domains reference application-layer property schemas (theme, language).
    // Register them on the gtsPlugin singleton so GTS can validate domain sharedProperties.
    gtsPlugin.registerSchema(themeSchema);
    gtsPlugin.registerSchema(languageSchema);
    gtsPlugin.registerSchema(extensionScreenSchema);
  });

  afterEach(() => {
    apps.forEach(app => app.destroy());
    apps = [];
  });

  describe('plugin factory', () => {
    it('should accept required typeSystem parameter', () => {
      expect(() => {
        microfrontends({ typeSystem: gtsPlugin });
      }).not.toThrow();
    });

    it('should accept optional MicrofrontendsConfig with mfeHandlers', () => {
      expect(() => {
        microfrontends({ typeSystem: gtsPlugin, mfeHandlers: [] });
      }).not.toThrow();
    });

    it('should return a valid plugin object', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin).toHaveProperty('name', 'microfrontends');
      expect(plugin).toHaveProperty('dependencies');
      expect(plugin.dependencies).toContain('screensets');
      expect(plugin).toHaveProperty('onInit');
      expect(plugin).toHaveProperty('provides');
      expect(plugin.provides).toHaveProperty('registries');
    });
  });

  describe('7.9.1 - plugin obtains screensetsRegistry from framework', () => {
    it('should provide screensetsRegistry via provides.registries', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.provides).toBeDefined();
      expect(plugin.provides?.registries).toBeDefined();
      expect(plugin.provides?.registries?.screensetsRegistry).toBeDefined();
    });

    it('should make screensetsRegistry available on app object', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      expect(app.screensetsRegistry).toBeDefined();
      expect(typeof app.screensetsRegistry).toBe('object');
    });

    it('should expose screensetsRegistry with MFE methods', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      // Verify MFE methods are present
      expect(typeof registry.registerDomain).toBe('function');
      expect(typeof registry.typeSystem).toBe('object');
      expect(registry.typeSystem.name).toBe('gts');
    });
  });

  describe('7.9.2 - same TypeSystemPlugin instance is propagated through layers', () => {
    it('should use same TypeSystemPlugin instance throughout', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      // Verify the plugin is the GTS plugin
      expect(registry.typeSystem).toBeDefined();
      expect(registry.typeSystem.name).toBe('gts');
      expect(registry.typeSystem.version).toBe('1.0.0');

      // Verify plugin has required methods
      expect(typeof registry.typeSystem.registerSchema).toBe('function');
      expect(typeof registry.typeSystem.getSchema).toBe('function');
      expect(typeof registry.typeSystem.register).toBe('function');
      expect(typeof registry.typeSystem.validateInstance).toBe('function');
      expect(typeof registry.typeSystem.isTypeOf).toBe('function');
    });

    it('should have consistent plugin reference across multiple calls', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      // Get reference to plugin
      const plugin1 = registry.typeSystem;
      const plugin2 = registry.typeSystem;

      // Should be the same instance
      expect(plugin1).toBe(plugin2);
    });
  });

  describe('7.9.3 - runtime.registerDomain() works for base domains at runtime', () => {
    it('should register sidebar domain successfully', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      expect(() => {
        const testContainerProvider = new TestContainerProvider();
        registry.registerDomain(sidebarDomain, testContainerProvider);
      }).not.toThrow();
    });

    it('should register popup domain successfully', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      expect(() => {
        const testContainerProvider = new TestContainerProvider();
        registry.registerDomain(popupDomain, testContainerProvider);
      }).not.toThrow();
    });

    it('should register screen domain successfully', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      expect(() => {
        const testContainerProvider = new TestContainerProvider();
        registry.registerDomain(screenDomain, testContainerProvider);
      }).not.toThrow();
    });

    it('should register overlay domain successfully', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      expect(() => {
        const testContainerProvider = new TestContainerProvider();
        registry.registerDomain(overlayDomain, testContainerProvider);
      }).not.toThrow();
    });

    it('should register all base domains without conflicts', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;
      const testProvider = new TestContainerProvider();

      expect(() => {
        registry.registerDomain(sidebarDomain, testProvider);
        registry.registerDomain(popupDomain, testProvider);
        registry.registerDomain(screenDomain, testProvider);
        registry.registerDomain(overlayDomain, testProvider);
      }).not.toThrow();
    });
  });

  describe('7.9.4 - JSON schema loading works correctly', () => {
    it('should load first-class citizen schemas during plugin construction', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      // First-class citizen schemas should be available
      const coreSchemas = [
        'gts.frontx.mfes.mfe.entry.v1~',
        'gts.frontx.mfes.ext.domain.v1~',
        'gts.frontx.mfes.ext.extension.v1~',
        'gts.frontx.mfes.comm.shared_property.v1~',
        'gts.frontx.mfes.comm.action.v1~',
        'gts.frontx.mfes.comm.actions_chain.v1~',
        'gts.frontx.mfes.lifecycle.stage.v1~',
        'gts.frontx.mfes.lifecycle.hook.v1~',
      ];

      for (const schemaId of coreSchemas) {
        const schema = registry.typeSystem.getSchema(schemaId);
        expect(schema).toBeDefined();
        expect(schema).toHaveProperty('$id');
      }
    });

    it('should validate schema availability via getSchema', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      // Test a few specific schemas
      const entrySchema = registry.typeSystem.getSchema('gts.frontx.mfes.mfe.entry.v1~');
      expect(entrySchema).toBeDefined();
      expect(entrySchema?.$id).toContain('gts.frontx.mfes.mfe.entry.v1~');

      const domainSchema = registry.typeSystem.getSchema('gts.frontx.mfes.ext.domain.v1~');
      expect(domainSchema).toBeDefined();
      expect(domainSchema?.$id).toContain('gts.frontx.mfes.ext.domain.v1~');
    });

    it('should return undefined for non-existent schemas', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      const nonExistentSchema = registry.typeSystem.getSchema('gts.nonexistent.schema.v1~');
      expect(nonExistentSchema).toBeUndefined();
    });
  });

  describe('7.9.5 - JSON instance loading works correctly', () => {
    it('should load base domain instances from JSON', () => {
      // Verify instances have correct structure
      expect(sidebarDomain.id).toContain('frontx.screensets.layout.sidebar');
      expect(popupDomain.id).toContain('frontx.screensets.layout.popup');
      expect(screenDomain.id).toContain('frontx.screensets.layout.screen');
      expect(overlayDomain.id).toContain('frontx.screensets.layout.overlay');
    });

    it('should validate loaded domain instances', () => {
      const app = createHAI3()
        .use(screensets())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.screensetsRegistry as ScreensetsRegistry;

      // Register the domain (this triggers validation internally)
      expect(() => {
        const testContainerProvider = new TestContainerProvider();
        registry.registerDomain(sidebarDomain, testContainerProvider);
      }).not.toThrow();
    });

    it('should load lifecycle stages from JSON', () => {
      // Verify lifecycle stages are loaded
      expect(sidebarDomain.lifecycleStages).toBeDefined();
      expect(Array.isArray(sidebarDomain.lifecycleStages)).toBe(true);
      expect(sidebarDomain.lifecycleStages.length).toBe(4);

      // Verify stage IDs
      const stageIds = sidebarDomain.lifecycleStages;
      expect(stageIds).toContain('gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1');
      expect(stageIds).toContain('gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1');
      expect(stageIds).toContain('gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1');
      expect(stageIds).toContain('gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1');
    });

    it('should load base actions from JSON', () => {
      // Verify actions are loaded
      expect(sidebarDomain.actions).toBeDefined();
      expect(Array.isArray(sidebarDomain.actions)).toBe(true);
      expect(sidebarDomain.actions.length).toBe(3);

      // Verify action IDs
      expect(sidebarDomain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1');
      expect(sidebarDomain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1');
      expect(sidebarDomain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1');
    });

    it('should handle screen domain with swap semantics (load_ext + mount_ext, no unmount_ext)', () => {
      // Screen domain should have load_ext and mount_ext, but not unmount_ext (swap semantics)
      expect(screenDomain.actions.length).toBe(2);
      expect(screenDomain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1');
      expect(screenDomain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1');
      expect(screenDomain.actions).not.toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1');
    });
  });

  describe('base domain factories', () => {
    it('should create sidebar domain with correct structure', () => {
      const domain = sidebarDomain;

      expect(domain).toMatchObject({
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',
        sharedProperties: [
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~',
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~',
        ],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 30000,
      });
      expect(domain.lifecycleStages).toHaveLength(4);
      expect(domain.extensionsLifecycleStages).toHaveLength(4);
    });

    it('should create popup domain with correct structure', () => {
      const domain = popupDomain;

      expect(domain).toMatchObject({
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1',
        sharedProperties: [
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~',
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~',
        ],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 30000,
      });
      expect(domain.lifecycleStages).toHaveLength(4);
      expect(domain.extensionsLifecycleStages).toHaveLength(4);
    });

    it('should create screen domain with only load_ext action', () => {
      const domain = screenDomain;

      expect(domain).toMatchObject({
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
        sharedProperties: [
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~',
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~',
        ],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 30000,
      });
      expect(domain.actions).toHaveLength(2);
      // Screen domain is permanent (init-only): 1 lifecycle stage
      expect(domain.lifecycleStages).toHaveLength(1);
      // Screen extensions still go through full lifecycle: 4 stages
      expect(domain.extensionsLifecycleStages).toHaveLength(4);
    });

    it('should create overlay domain with correct structure', () => {
      const domain = overlayDomain;

      expect(domain).toMatchObject({
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1',
        sharedProperties: [
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~',
          'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~',
        ],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 30000,
      });
      expect(domain.lifecycleStages).toHaveLength(4);
      expect(domain.extensionsLifecycleStages).toHaveLength(4);
    });
  });
});
