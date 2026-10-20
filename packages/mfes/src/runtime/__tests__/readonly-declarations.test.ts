/**
 * Immutable declarations (#637): a domain and an entry whose id lists are
 * declared `as const` are accepted as they are, with no copy into mutable
 * arrays, and registering and mounting them never writes to those lists.
 */
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { ExtensionDomain, MfeEntry } from '../../types';
import {
  ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT, ENTRY_ID, ControlledHandler, createPlugin, dispatch,
  domainFactory, makeExtension,
} from './helpers/reflect-harness';

const DOMAIN_ID = 'acme.readonly.screens.v1';
const EXTENSION_ID = 'acme.readonly.home.v1';
const THEME_PROPERTY = 'acme.readonly.theme.v1';

/** Freezes the value and every object and array inside it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const declaredDomain = deepFreeze({
  id: DOMAIN_ID,
  sharedProperties: [THEME_PROPERTY],
  actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
} as const);

const declaredEntry = deepFreeze({
  $id: ENTRY_ID,
  id: ENTRY_ID,
  requiredProperties: [THEME_PROPERTY],
  optionalProperties: [],
  actions: [],
  domainActions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
} as const);

const built: DefaultMfeRegistry[] = [];

afterEach(async () => {
  for (const registry of built.splice(0)) await registry.dispose();
});

describe('id lists declared as const', () => {
  it('type-check as an ExtensionDomain and an MfeEntry', () => {
    expectTypeOf(declaredDomain).toExtend<ExtensionDomain>();
    expectTypeOf(declaredEntry).toExtend<MfeEntry>();
  });

  it('register, mount and unregister while frozen', async () => {
    const plugin = createPlugin();
    plugin.registerSchema(declaredEntry);
    const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [new ControlledHandler(ENTRY_ID)] });
    built.push(registry);

    registry.registerDomain(declaredDomain, domainFactory('concurrent'));
    await registry.registerExtension(makeExtension(EXTENSION_ID, DOMAIN_ID));
    registry.getMounter(DOMAIN_ID).attach(document.createElement('div'));

    await expect(dispatch(registry, DOMAIN_ID, ACTION_MOUNT_EXT, { subject: EXTENSION_ID })).resolves.toBe('next');
    await expect(dispatch(registry, DOMAIN_ID, ACTION_UNMOUNT_EXT, { subject: EXTENSION_ID })).resolves.toBe('next');
    await registry.unregisterDomain(DOMAIN_ID);
  });
});
