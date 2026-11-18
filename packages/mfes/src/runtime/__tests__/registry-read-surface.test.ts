/**
 * The registry's developer-facing read surface
 * (`cpt-frontx-dod-mfe-registry-registry-contract`): it reveals no mounted
 * state, no route, and no other domain's occupancy. The declared `route` of a
 * domain and of an extension reaches the injected router only.
 */
import { afterEach, describe, it, expect, expectTypeOf, vi } from 'vitest';
import { createMfeRegistryFactory } from '../DefaultMfeRegistryFactory';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { MfeRegistry } from '../../registry/MfeRegistry';
import {
  ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT, ENTRY_ID, ControlledHandler, createPlugin, domainFactory,
  registerEntrySchema,
} from './helpers/reflect-harness';
import type { RouterPort } from '../../router/RouterPort';
import type { Extension, ExtensionDomain } from '../../types';

const DOMAIN_ID = 'acme.demo.screens.v1';
const EXTENSION_ID = 'gts.acme.ext.extension.v1~acme.demo.home.v1';
const DOMAIN_ROUTE = 'screens';
const EXTENSION_ROUTE = 'home';

const domain = {
  id: DOMAIN_ID,
  actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  sharedProperties: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
  extensionsTypeId: '',
  route: DOMAIN_ROUTE,
} as unknown as ExtensionDomain;

const extension = { id: EXTENSION_ID, domain: DOMAIN_ID, entry: ENTRY_ID, route: EXTENSION_ROUTE } as Extension;

const built: MfeRegistry[] = [];

async function buildRegistry(router?: RouterPort): Promise<DefaultMfeRegistry> {
  const plugin = createPlugin();
  registerEntrySchema(plugin);
  const registry = new DefaultMfeRegistry({
    typeSystem: plugin,
    mfeHandlers: [new ControlledHandler(ENTRY_ID)],
    router,
  });
  built.push(registry);
  registry.registerDomain(domain, domainFactory('concurrent'));
  await registry.registerExtension(extension);
  return registry;
}

afterEach(async () => {
  for (const registry of built.splice(0)) await registry.dispose();
});

describe('developer-facing MfeRegistry type', () => {
  it('declares no getMountedExtensions and no getParentBridge member', () => {
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getMountedExtensions');
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getParentBridge');
  });

  it('a registry built by the factory has no callable getMountedExtensions or getParentBridge', () => {
    const registry = createMfeRegistryFactory().build({ typeSystem: createPlugin() });
    built.push(registry);
    const members = registry as unknown as Record<string, unknown>;

    expect(typeof members.getMountedExtensions).toBe('undefined');
    expect(typeof members.getParentBridge).toBe('undefined');
    expect(typeof members.getDomainState).toBe('undefined');
  });
});

describe('registry reads return registrations without route', () => {
  it('getExtension', async () => {
    const registry = await buildRegistry();

    const read = registry.getExtension(EXTENSION_ID);

    expect(read).toMatchObject({ id: EXTENSION_ID, domain: DOMAIN_ID });
    expect(read).not.toHaveProperty('route');
  });

  it('getDomain', async () => {
    const registry = await buildRegistry();

    const read = registry.getDomain(DOMAIN_ID);

    expect(read).toMatchObject({ id: DOMAIN_ID });
    expect(read).not.toHaveProperty('route');
  });

  it('getExtensionsForDomain', async () => {
    const registry = await buildRegistry();

    const read = registry.getExtensionsForDomain(DOMAIN_ID);

    expect(read.map((e) => e.id)).toEqual([EXTENSION_ID]);
    for (const e of read) expect(e).not.toHaveProperty('route');
  });
});

describe('the declared route reaches the injected router', () => {
  it('registerDomain and registerExtension hand the router the declared route', async () => {
    const registerDomain = vi.fn();
    const registerExtension = vi.fn();
    const router = {
      connect: () => {},
      startDomain: () => {},
      stopDomain: () => {},
      registerDomain,
      registerExtension,
      releaseDomain: () => {},
      releaseExtension: () => {},
      assignOccupantValue: () => undefined,
      supplyNavigation: () => {},
      reflect: () => {},
    } as unknown as RouterPort;

    await buildRegistry(router);

    expect(registerDomain).toHaveBeenCalledWith(DOMAIN_ID, DOMAIN_ROUTE, true);
    expect(registerExtension).toHaveBeenCalledWith(EXTENSION_ID, DOMAIN_ID, EXTENSION_ROUTE);
  });
});
