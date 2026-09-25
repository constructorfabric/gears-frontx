import { describe, it, expect, vi } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import { DefaultExtensionManager } from '../default-extension-manager';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { ExtensionDomain, Extension, MfeEntry } from '../../types';
import {
  DomainRouteValidationError,
  ExtensionRouteConflictError,
  DuplicateRouteTokenError,
} from '../../errors';

// ─── Minimal TypeSystemPlugin mock (route-registration tests only need
// schema `register` to accept everything and `getSchema` to resolve a
// pre-declared entry by id) ────────────────────────────────────────────────

function createMockPlugin(): { plugin: TypeSystemPlugin; entries: Map<string, MfeEntry> } {
  const entries = new Map<string, MfeEntry>();
  const plugin: TypeSystemPlugin = {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(typeId: string): MfeEntry | undefined {
      return entries.get(typeId);
    },
    register(): void {
      // Accept everything — mock does no real GTS validation.
    },
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId;
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId: () => 'mock.load_ext.v1',
    resolveMountExtActionId: () => 'mock.mount_ext.v1',
    resolveUnmountExtActionId: () => 'mock.unmount_ext.v1',
    resolveLifecycleStageInitId: () => 'mock.stage.init.v1',
    resolveLifecycleStageActivatedId: () => 'mock.stage.activated.v1',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage.deactivated.v1',
    resolveLifecycleStageDestroyedId: () => 'mock.stage.destroyed.v1',
  };
  return { plugin, entries };
}

function createManager(plugin: TypeSystemPlugin): DefaultExtensionManager {
  return new DefaultExtensionManager({
    typeSystem: plugin,
    triggerLifecycle: async () => {},
    triggerDomainOwnLifecycle: async () => {},
    unmountExtension: async () => {},
    releaseExtension: () => {},
    validateEntryType: () => {},
  });
}

const ENTRY_ID = 'entry.v1';

function makeEntry(id: string = ENTRY_ID): MfeEntry {
  return { id, requiredProperties: [], actions: [], domainActions: [] };
}

function makeDomain(id: string, route?: string): ExtensionDomain {
  return {
    id,
    sharedProperties: [],
    actions: [],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    ...(route !== undefined ? { route } : {}),
  };
}

function makeExtension(
  id: string,
  domain: string,
  overrides: Partial<Extension> & { presentation?: { label: string; route: string } } = {}
): Extension {
  return { id, domain, entry: ENTRY_ID, ...overrides } as Extension;
}

function registeredManager(domainId: string): { manager: DefaultExtensionManager; entries: Map<string, MfeEntry> } {
  const { plugin, entries } = createMockPlugin();
  entries.set(ENTRY_ID, makeEntry());
  const manager = createManager(plugin);
  manager.registerDomain(makeDomain(domainId));
  return { manager, entries };
}

/** A `register` spy wrapping the mock plugin, for F2's "no type-system side effect on rejection" tests. */
function createSpyPlugin(): {
  plugin: TypeSystemPlugin;
  entries: Map<string, MfeEntry>;
  registerSpy: ReturnType<typeof vi.fn>;
} {
  const { plugin: basePlugin, entries } = createMockPlugin();
  const registerSpy = vi.fn((entity: unknown) => basePlugin.register(entity));
  const plugin: TypeSystemPlugin = { ...basePlugin, register: registerSpy };
  return { plugin, entries, registerSpy };
}

describe('DefaultExtensionManager — domain route registration', () => {
  it('accepts a domain with a valid route', () => {
    const { plugin } = createMockPlugin();
    const manager = createManager(plugin);
    expect(() => manager.registerDomain(makeDomain('d-valid', 'settings'))).not.toThrow();
  });

  it('accepts a domain with no route at all', () => {
    const { plugin } = createMockPlugin();
    const manager = createManager(plugin);
    expect(() => manager.registerDomain(makeDomain('d-absent'))).not.toThrow();
  });

  it('rejects a domain with an invalid route (upper case)', () => {
    const { plugin } = createMockPlugin();
    const manager = createManager(plugin);
    expect(() => manager.registerDomain(makeDomain('d-invalid', 'Settings'))).toThrow(
      DomainRouteValidationError
    );
  });

  it('rejects a domain route carrying a leading slash — unlike an extension route, no leading slash is tolerated', () => {
    const { plugin } = createMockPlugin();
    const manager = createManager(plugin);
    expect(() => manager.registerDomain(makeDomain('d-slash', '/settings'))).toThrow(
      DomainRouteValidationError
    );
  });

  it('a rejected domain registration leaves no state behind', () => {
    const { plugin } = createMockPlugin();
    const manager = createManager(plugin);
    expect(() => manager.registerDomain(makeDomain('d-rollback', 'Invalid'))).toThrow();
    expect(manager.getDomainState('d-rollback')).toBeUndefined();
    expect(() => manager.registerDomain(makeDomain('d-rollback', 'valid'))).not.toThrow();
  });
});

describe('DefaultExtensionManager — extension route registration', () => {
  it('an extension without presentation, declaring only a base route, is routable and admitted', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(makeExtension('ext-1', 'd1', { route: 'profile' }))
    ).resolves.not.toThrow();
    expect(manager.getExtensionState('ext-1')).toBeDefined();
  });

  it('base route and presentation.route, exactly equal, are accepted', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(
        makeExtension('ext-1', 'd1', {
          route: 'settings',
          presentation: { label: 'Settings', route: 'settings' },
        })
      )
    ).resolves.not.toThrow();
  });

  it('base route and presentation.route, equal modulo one leading slash, are accepted', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(
        makeExtension('ext-1', 'd1', {
          route: 'settings',
          presentation: { label: 'Settings', route: '/settings' },
        })
      )
    ).resolves.not.toThrow();
  });

  it('base route and presentation.route that disagree are rejected', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(
        makeExtension('ext-1', 'd1', {
          route: 'settings',
          presentation: { label: 'Billing', route: 'billing' },
        })
      )
    ).rejects.toThrow(ExtensionRouteConflictError);
  });

  it('an invalid route makes an extension not routable but does not reject the registration', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(makeExtension('ext-1', 'd1', { route: 'Not Valid!' }))
    ).resolves.not.toThrow();
    expect(manager.getExtensionState('ext-1')).toBeDefined();
  });

  it('an extension declaring no route at all is admitted without a route token', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(makeExtension('ext-1', 'd1'))
    ).resolves.not.toThrow();
  });

  it('two extensions declaring the same route token in the same domain: the second is rejected', async () => {
    const { manager } = registeredManager('d1');
    await manager.registerExtension(makeExtension('ext-1', 'd1', { route: 'profile' }));
    await expect(
      manager.registerExtension(makeExtension('ext-2', 'd1', { route: 'profile' }))
    ).rejects.toThrow(DuplicateRouteTokenError);
    expect(manager.getExtensionState('ext-2')).toBeUndefined();
  });

  it('the same route token is allowed across two different domains', async () => {
    const { plugin, entries } = createMockPlugin();
    entries.set(ENTRY_ID, makeEntry());
    const manager = createManager(plugin);
    manager.registerDomain(makeDomain('d1'));
    manager.registerDomain(makeDomain('d2'));

    await manager.registerExtension(makeExtension('ext-1', 'd1', { route: 'profile' }));
    await expect(
      manager.registerExtension(makeExtension('ext-2', 'd2', { route: 'profile' }))
    ).resolves.not.toThrow();
  });

  it('unregistering an extension frees its route token for reuse in the same domain', async () => {
    const { manager } = registeredManager('d1');
    await manager.registerExtension(makeExtension('ext-1', 'd1', { route: 'profile' }));
    await manager.unregisterExtension('ext-1');
    await expect(
      manager.registerExtension(makeExtension('ext-2', 'd1', { route: 'profile' }))
    ).resolves.not.toThrow();
  });

  it('a rejected extension registration leaves no state behind', async () => {
    const { manager } = registeredManager('d1');
    await expect(
      manager.registerExtension(
        makeExtension('ext-conflict', 'd1', {
          route: 'settings',
          presentation: { label: 'Billing', route: 'billing' },
        })
      )
    ).rejects.toThrow(ExtensionRouteConflictError);

    expect(manager.getExtensionState('ext-conflict')).toBeUndefined();
    expect(manager.getExtensionStatesForDomain('d1')).toHaveLength(0);

    // A subsequent, valid registration under the same route is unaffected.
    await expect(
      manager.registerExtension(makeExtension('ext-ok', 'd1', { route: 'settings' }))
    ).resolves.not.toThrow();
  });
});

describe('DefaultExtensionManager — route rejection precedes typeSystem.register (no type-system side effect)', () => {
  it('registerDomain: an invalid route is rejected without ever calling typeSystem.register', () => {
    const { plugin, registerSpy } = createSpyPlugin();
    const manager = createManager(plugin);
    expect(() => manager.registerDomain(makeDomain('d-bad', 'Invalid'))).toThrow(
      DomainRouteValidationError
    );
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('registerExtension: a base-vs-presentation conflict is rejected without ever calling typeSystem.register for the extension', async () => {
    const { plugin, entries, registerSpy } = createSpyPlugin();
    entries.set(ENTRY_ID, makeEntry());
    const manager = createManager(plugin);
    manager.registerDomain(makeDomain('d1'));
    registerSpy.mockClear(); // domain registration itself calls register once — reset before the assertion under test.

    await expect(
      manager.registerExtension(
        makeExtension('ext-1', 'd1', {
          route: 'settings',
          presentation: { label: 'Billing', route: 'billing' },
        })
      )
    ).rejects.toThrow(ExtensionRouteConflictError);
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('registerExtension: a duplicate route token is rejected without ever calling typeSystem.register for the second extension', async () => {
    const { plugin, entries, registerSpy } = createSpyPlugin();
    entries.set(ENTRY_ID, makeEntry());
    const manager = createManager(plugin);
    manager.registerDomain(makeDomain('d1'));
    await manager.registerExtension(makeExtension('ext-1', 'd1', { route: 'profile' }));
    registerSpy.mockClear(); // domain + first extension registration already called register — reset before the assertion under test.

    await expect(
      manager.registerExtension(makeExtension('ext-2', 'd1', { route: 'profile' }))
    ).rejects.toThrow(DuplicateRouteTokenError);
    expect(registerSpy).not.toHaveBeenCalled();
  });
});

describe('DefaultExtensionManager — non-string route runtime guards', () => {
  it.each([null, 123, {}, false])(
    'rejects a domain whose route is present but non-string (%j) with the typed invalid-route error, not a raw TypeError',
    (badRoute) => {
      const { plugin } = createMockPlugin();
      const manager = createManager(plugin);
      const domain = { ...makeDomain('d-bad-type'), route: badRoute } as unknown as ExtensionDomain;
      expect(() => manager.registerDomain(domain)).toThrow(DomainRouteValidationError);
    }
  );

  it.each([null, 123, {}, false])(
    'admits an extension whose base route is non-string (%j) and has no presentation, without a route token and without throwing',
    async (badRoute) => {
      const { manager } = registeredManager('d1');
      const extension = { ...makeExtension('ext-1', 'd1'), route: badRoute } as unknown as Extension;
      await expect(manager.registerExtension(extension)).resolves.not.toThrow();
    }
  );

  it('admits an extension whose presentation is null, without throwing', async () => {
    const { manager } = registeredManager('d1');
    const extension = { ...makeExtension('ext-1', 'd1'), presentation: null } as unknown as Extension;
    await expect(manager.registerExtension(extension)).resolves.not.toThrow();
  });

  it('admits an extension whose presentation is not an object, without throwing', async () => {
    const { manager } = registeredManager('d1');
    const extension = { ...makeExtension('ext-1', 'd1'), presentation: 'oops' } as unknown as Extension;
    await expect(manager.registerExtension(extension)).resolves.not.toThrow();
  });

  it('admits an extension whose presentation.route is non-string, without throwing', async () => {
    const { manager } = registeredManager('d1');
    const extension = {
      ...makeExtension('ext-1', 'd1'),
      presentation: { label: 'x', route: 42 },
    } as unknown as Extension;
    await expect(manager.registerExtension(extension)).resolves.not.toThrow();
  });

  it('a non-string base route with a valid string presentation.route falls through to the presentation route (no false conflict)', async () => {
    const { manager } = registeredManager('d1');
    const extension = {
      ...makeExtension('ext-1', 'd1'),
      route: 123,
      presentation: { label: 'x', route: 'settings' },
    } as unknown as Extension;
    await expect(manager.registerExtension(extension)).resolves.not.toThrow();
  });
});
