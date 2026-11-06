/**
 * Immutable declarations (#637, #697): a domain, an entry and an extension
 * whose lists are declared `as const` are accepted as they are, with no copy
 * into mutable arrays, and registering, mounting and unregistering them never
 * writes to those lists — the id lists or the lifecycle hooks.
 */
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { ActionHandler } from '../../mediator/ActionHandler';
import type { DefaultActionsChainsMediator } from '../../mediator/DefaultActionsChainsMediator';
import type { Extension, ExtensionDomain, LifecycleHook, MfeEntry } from '../../types';
import {
  ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT, ENTRY_ID, ControlledHandler, STAGE_ACTIVATED,
  STAGE_DEACTIVATED, STAGE_DESTROYED, STAGE_INIT, createPlugin, dispatch, domainFactory,
} from './helpers/reflect-harness';

const DOMAIN_ID = 'acme.readonly.screens.v1';
const EXTENSION_ID = 'acme.readonly.home.v1';
const THEME_PROPERTY = 'acme.readonly.theme.v1';
// Dispatched by every lifecycle hook below, with a label naming the hook.
const ACTION_STAGE_PROBE = 'acme.readonly.stage_probe.v1~';

/** Freezes the value and every object and array inside it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** A hook declared `as const` whose chain dispatches the stage probe with `label`. */
function probeHook<const Label extends string>(stage: string, label: Label) {
  return {
    stage,
    actions_chain: { action: { type: ACTION_STAGE_PROBE, target: DOMAIN_ID, payload: { label } } },
  } as const;
}

const declaredDomain = deepFreeze({
  id: DOMAIN_ID,
  sharedProperties: [THEME_PROPERTY],
  actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [STAGE_INIT, STAGE_DESTROYED],
  extensionsLifecycleStages: [STAGE_INIT, STAGE_ACTIVATED, STAGE_DEACTIVATED, STAGE_DESTROYED],
  lifecycle: [probeHook(STAGE_INIT, 'domain init'), probeHook(STAGE_DESTROYED, 'domain destroyed')],
} as const);

const declaredEntry = deepFreeze({
  $id: ENTRY_ID,
  id: ENTRY_ID,
  requiredProperties: [THEME_PROPERTY],
  optionalProperties: [],
  actions: [],
  domainActions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
} as const);

const declaredExtension = deepFreeze({
  id: EXTENSION_ID,
  domain: DOMAIN_ID,
  entry: ENTRY_ID,
  route: EXTENSION_ID,
  lifecycle: [
    probeHook(STAGE_INIT, 'extension init'),
    probeHook(STAGE_ACTIVATED, 'extension activated'),
    probeHook(STAGE_DEACTIVATED, 'extension deactivated'),
    probeHook(STAGE_DESTROYED, 'extension destroyed'),
  ],
} as const);

const built: DefaultMfeRegistry[] = [];

afterEach(async () => {
  for (const registry of built.splice(0)) await registry.dispose();
});

describe('declarations made as const', () => {
  it('type-check as an ExtensionDomain, an MfeEntry and an Extension', () => {
    expectTypeOf(declaredDomain).toExtend<ExtensionDomain>();
    expectTypeOf(declaredEntry).toExtend<MfeEntry>();
    expectTypeOf(declaredExtension).toExtend<Extension>();
  });

  it('meet readonly properties holding readonly arrays', () => {
    expectTypeOf<
      Pick<
        ExtensionDomain,
        'sharedProperties' | 'actions' | 'extensionsActions' | 'lifecycleStages' | 'extensionsLifecycleStages' | 'lifecycle'
      >
    >().toEqualTypeOf<{
      readonly sharedProperties: readonly string[];
      readonly actions: readonly string[];
      readonly extensionsActions: readonly string[];
      readonly lifecycleStages: readonly string[];
      readonly extensionsLifecycleStages: readonly string[];
      readonly lifecycle?: readonly LifecycleHook[];
    }>();
    expectTypeOf<Pick<MfeEntry, 'requiredProperties' | 'optionalProperties' | 'actions' | 'domainActions'>>().toEqualTypeOf<{
      readonly requiredProperties: readonly string[];
      readonly optionalProperties?: readonly string[];
      readonly actions: readonly string[];
      readonly domainActions: readonly string[];
    }>();
    expectTypeOf<Pick<Extension, 'lifecycle'>>().toEqualTypeOf<{
      readonly lifecycle?: readonly LifecycleHook[];
    }>();
  });

  it('register, mount and unregister while frozen, running every lifecycle hook at its stage', async () => {
    const plugin = createPlugin();
    plugin.registerSchema(declaredEntry);
    const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [new ControlledHandler(ENTRY_ID)] });
    built.push(registry);

    // The probe records each hook as it is dispatched, without awaiting, so the
    // log reads in dispatch order.
    const ran: string[] = [];
    const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
    mediator.registerHandler(
      DOMAIN_ID,
      ACTION_STAGE_PROBE,
      ActionHandler.fromFunction(async (_type, payload) => {
        ran.push((payload as { label: string }).label);
      })
    );

    registry.registerDomain(declaredDomain, domainFactory('concurrent'));
    await registry.registerExtension(declaredExtension);
    registry.getMounter(DOMAIN_ID).attach(document.createElement('div'));

    await expect(dispatch(registry, DOMAIN_ID, ACTION_MOUNT_EXT, { subject: EXTENSION_ID })).resolves.toBe('next');
    await expect(dispatch(registry, DOMAIN_ID, ACTION_UNMOUNT_EXT, { subject: EXTENSION_ID })).resolves.toBe('next');
    await registry.unregisterExtension(EXTENSION_ID);
    await registry.unregisterDomain(DOMAIN_ID);

    expect(ran).toEqual([
      'domain init',
      'extension init',
      'extension activated',
      'extension deactivated',
      'extension destroyed',
      'domain destroyed',
    ]);
  });
});
