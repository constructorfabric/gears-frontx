/**
 * A domain or an extension that declares lifecycle hooks registers on the
 * real store. Each hook's actions chain is checked against the base action
 * schema (`action.v1`), and the GTS library resolves a `/$id` operand to the
 * type of the instance being validated at any depth, so a `/$id` on the base
 * action's `type` named the domain or extension type and refused every action
 * type in a hook. Exercises the shipped schemas through `GtsPlugin`, since the
 * behavior under test is the library's reading of the reference keywords.
 *
 * The base action schema accepts a domain or an extension as a target, so
 * each hook action is also checked against its own type, at every step of its
 * chain: a `mount_ext` action that targets an extension is refused at
 * registration, not only at dispatch. That check covers what kind of entity
 * each reference names, not whether it is registered yet, so a hook may name
 * an entity that registers later; the mediator checks that at dispatch.
 *
 * `cpt-frontx-algo-gts-type-provider-infra-registration-v2` (inst-irv2-load),
 * `cpt-frontx-algo-gts-type-provider-instance-write` (inst-iw-hook-actions).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Extension, ExtensionDomain, MfeEntry } from '@gears-frontx/mfes';
// @internal — colocated test, direct relative import is permitted.
import { GtsPlugin } from '../plugin';

const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.lifecyclehooks.fixture.domain.v1';
const HOOKED_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.lifecyclehooks.fixture.hooked.v1';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.lifecyclehooks.fixture.entry.v1';
const EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.lifecyclehooks.fixture.ext.v1';
const HOOKED_EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.lifecyclehooks.fixture.hooked.v1';
const PING_TYPE = 'gts.frontx.mfes.comm.action.v1~test.lifecyclehooks.fixture.ping.v1~';
const OPEN_TYPE = 'gts.frontx.mfes.comm.action.v1~test.lifecyclehooks.fixture.open.v1~';

type Chain = NonNullable<ExtensionDomain['lifecycle']>[number]['actions_chain'];

describe('lifecycle hooks on the real store', () => {
  let plugin: GtsPlugin;
  let init: string;
  let activated: string;
  let destroyed: string;
  let mountExt: string;
  let unmountExt: string;

  beforeEach(() => {
    plugin = new GtsPlugin({ isolated: true });
    init = plugin.resolveLifecycleStageInitId();
    activated = plugin.resolveLifecycleStageActivatedId();
    destroyed = plugin.resolveLifecycleStageDestroyedId();
    mountExt = plugin.resolveMountExtActionId();
    unmountExt = plugin.resolveUnmountExtActionId();

    const entry: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
    plugin.register(entry);
    plugin.register(domain(DOMAIN_ID));
  });

  function domain(id: string, lifecycle?: ExtensionDomain['lifecycle']): ExtensionDomain {
    return {
      id,
      sharedProperties: [],
      actions: [mountExt, unmountExt],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [init, destroyed],
      extensionsLifecycleStages: [activated],
      ...(lifecycle ? { lifecycle } : {}),
    };
  }

  function extension(id: string, lifecycle?: Extension['lifecycle']): Extension {
    return { id, domain: DOMAIN_ID, entry: ENTRY_ID, ...(lifecycle ? { lifecycle } : {}) };
  }

  /**
   * An application action type, closed like the built-in ones: it re-declares
   * every property the base action declares, `timeout` included, because the
   * GTS library refuses a closed derived type that drops a base property, and
   * with it every action of that type.
   */
  function registerActionType(typeId: string, target: Record<string, unknown>): void {
    plugin.registerSchema({
      $id: `gts://${typeId}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { 'x-gts-type-ref': '/$id' },
        target,
        payload: { type: 'object' },
        timeout: { type: 'number', minimum: 1 },
      },
      required: ['type', 'target'],
    });
  }

  /** The store holds nothing under `id`. */
  function expectNotStored(id: string): void {
    expect(plugin.getSchema(id)).toBeUndefined();
    expect(plugin.validateInstance(id).valid).toBe(false);
  }

  describe('registers hooks whose actions satisfy their own types', () => {
    it('registers a domain whose hooks dispatch actions, a next step included', () => {
      plugin.register(extension(EXT_ID));
      const hooked = domain(HOOKED_DOMAIN_ID, [
        {
          stage: init,
          actions_chain: {
            action: { type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } },
            next: { action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } } },
          },
        },
        { stage: destroyed, actions_chain: { action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } } } },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
    });

    it('registers a domain whose hook mounts into the domain itself', () => {
      plugin.register(extension(EXT_ID));
      const hooked = domain(HOOKED_DOMAIN_ID, [
        {
          stage: destroyed,
          actions_chain: {
            action: { type: unmountExt, target: HOOKED_DOMAIN_ID, payload: { subject: EXT_ID } },
            next: { action: { type: mountExt, target: HOOKED_DOMAIN_ID, payload: { subject: EXT_ID } } },
          },
        },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
    });

    it('registers an extension whose hook dispatches an action', () => {
      const hooked = extension(EXT_ID, [
        { stage: activated, actions_chain: { action: { type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } } } },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(EXT_ID).valid).toBe(true);
    });

    it('registers an extension whose chain names the extension itself at every step', () => {
      // The extension is not on the store before this call, and the check does not ask that it be.
      const hooked = extension(HOOKED_EXT_ID, [
        {
          stage: activated,
          actions_chain: {
            action: { type: mountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } },
            next: { action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID, history: 'none' } } },
            fallback: { action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } } },
          },
        },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_EXT_ID).valid).toBe(true);
    });

    it('registers a domain whose hook dispatches an action type an application registered', () => {
      registerActionType(PING_TYPE, { 'x-gts-instance-ref': 'gts.frontx.mfes.ext.domain.v1~*' });
      const hooked = domain(HOOKED_DOMAIN_ID, [{ stage: init, actions_chain: { action: { type: PING_TYPE, target: DOMAIN_ID } } }]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
    });

    it('keeps the targets an application action type accepts, an extension included', () => {
      registerActionType(OPEN_TYPE, {
        anyOf: [
          { 'x-gts-instance-ref': 'gts.frontx.mfes.ext.domain.v1~*' },
          { 'x-gts-instance-ref': 'gts.frontx.mfes.ext.extension.v1~*' },
        ],
      });
      plugin.register(extension(EXT_ID));
      const hooked = domain(HOOKED_DOMAIN_ID, [
        {
          stage: init,
          actions_chain: {
            action: { type: OPEN_TYPE, target: DOMAIN_ID },
            next: { action: { type: OPEN_TYPE, target: EXT_ID, timeout: 100 } },
          },
        },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
    });

    it('registers a domain whose hook names its own extensions, which register after it', () => {
      // The domain's own stage swaps one of its extensions for another. Neither
      // is on the store yet: an extension registers only after its domain.
      const hooked = domain(HOOKED_DOMAIN_ID, [
        {
          stage: init,
          actions_chain: {
            action: { type: unmountExt, target: HOOKED_DOMAIN_ID, payload: { subject: EXT_ID } },
            next: { action: { type: mountExt, target: HOOKED_DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } } },
          },
        },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
      expect(() => plugin.register({ id: EXT_ID, domain: HOOKED_DOMAIN_ID, entry: ENTRY_ID })).not.toThrow();
      expect(() => plugin.register({ id: HOOKED_EXT_ID, domain: HOOKED_DOMAIN_ID, entry: ENTRY_ID })).not.toThrow();
    });

    it('registers an extension whose hook names a sibling that registers after it', () => {
      const hooked = extension(HOOKED_EXT_ID, [
        { stage: activated, actions_chain: { action: { type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } } } },
      ]);

      expect(() => plugin.register(hooked)).not.toThrow();
      expect(plugin.validateInstance(HOOKED_EXT_ID).valid).toBe(true);
      expect(() => plugin.register(extension(EXT_ID))).not.toThrow();
    });
  });

  describe('refuses hooks whose actions fail their own types', () => {
    it('refuses a hook whose action type is a registered type that is not an action', () => {
      // The stage type is on the store, so only the action-family check can refuse it.
      const hooked = domain(HOOKED_DOMAIN_ID, [
        { stage: init, actions_chain: { action: { type: 'gts.frontx.mfes.lifecycle.stage.v1~', target: DOMAIN_ID } } },
      ]);

      expect(() => plugin.register(hooked)).toThrow(/actions_chain\/action\/type/);
      expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(false);
      // The refused domain never reached the store.
      expect(plugin.getSchema(HOOKED_DOMAIN_ID)).toBeUndefined();
    });

    it('refuses a domain whose hook mounts into an extension', () => {
      // The base action schema accepts an extension as a target; `mount_ext` does not.
      plugin.register(extension(EXT_ID));
      const hooked = domain(HOOKED_DOMAIN_ID, [
        { stage: init, actions_chain: { action: { type: mountExt, target: EXT_ID, payload: { subject: EXT_ID } } } },
      ]);

      expect(() => plugin.register(hooked)).toThrow(
        /lifecycle hook action at lifecycle\[0\]\.actions_chain\.action fails: its type 'gts\.frontx\.mfes\.comm\.action\.v1~frontx\.mfes\.ext\.mount_ext\.v1~' refuses it/
      );
      expectNotStored(HOOKED_DOMAIN_ID);
    });

    it('refuses an extension whose hook fails past the first step of its chain', () => {
      const hooked = extension(HOOKED_EXT_ID, [
        { stage: activated, actions_chain: { action: { type: mountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } } } },
        {
          stage: activated,
          actions_chain: {
            action: { type: mountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } },
            next: { action: { type: mountExt, target: HOOKED_EXT_ID, payload: { subject: HOOKED_EXT_ID } } },
          },
        },
      ]);

      expect(() => plugin.register(hooked)).toThrow(/lifecycle hook action at lifecycle\[1\]\.actions_chain\.next\.action fails/);
      expectNotStored(HOOKED_EXT_ID);
    });

    it('refuses a domain whose hook fails in a fallback reached through next', () => {
      plugin.register(extension(EXT_ID));
      const chain: Chain = {
        action: { type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } },
        next: {
          action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } },
          // `unmount_ext` closes its payload: `extra` is not one of its fields.
          fallback: { action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: EXT_ID, extra: true } } },
        },
      };
      const hooked = domain(HOOKED_DOMAIN_ID, [{ stage: init, actions_chain: chain }]);

      expect(() => plugin.register(hooked)).toThrow(
        /lifecycle hook action at lifecycle\[0\]\.actions_chain\.next\.fallback\.action fails/
      );
      expectNotStored(HOOKED_DOMAIN_ID);
    });

    it('refuses an action whose subject names a domain, not an extension', () => {
      // The subject need not be on the store yet, but it must be an extension.
      const hooked = domain(HOOKED_DOMAIN_ID, [
        { stage: init, actions_chain: { action: { type: mountExt, target: DOMAIN_ID, payload: { subject: DOMAIN_ID } } } },
      ]);

      expect(() => plugin.register(hooked)).toThrow(/lifecycle\[0\]\.actions_chain\.action fails/);
      expectNotStored(HOOKED_DOMAIN_ID);
    });

    it('keeps the held domain when a re-registration fails a hook action', () => {
      plugin.register(extension(EXT_ID));
      const held = plugin.getSchema(DOMAIN_ID);
      const changed = domain(DOMAIN_ID, [
        { stage: init, actions_chain: { action: { type: mountExt, target: EXT_ID, payload: { subject: EXT_ID } } } },
      ]);

      expect(() => plugin.register(changed)).toThrow(/lifecycle hook action/);
      expect(plugin.getSchema(DOMAIN_ID)).toEqual(held);
      expect(plugin.validateInstance(DOMAIN_ID).valid).toBe(true);
    });
  });

  it('still checks an action on its own against its type, as the mediator does at dispatch', () => {
    plugin.register(extension(EXT_ID));

    expect(() => plugin.register({ type: mountExt, target: EXT_ID, payload: { subject: EXT_ID } })).toThrow(
      /GTS validation failed for instance '\(anonymous\)'/
    );
    expect(() => plugin.register({ type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } })).not.toThrow();
    // At dispatch the subject must also be on the store.
    expect(() => plugin.register({ type: mountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } })).toThrow(
      /GTS validation failed for instance '\(anonymous\)'/
    );
  });
});
