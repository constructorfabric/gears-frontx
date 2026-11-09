/**
 * A domain or an extension that declares lifecycle hooks registers on the
 * real store. Each hook's actions chain is checked against the base action
 * schema (`action.v1`), and the GTS library resolves a `/$id` operand to the
 * type of the instance being validated at any depth, so a `/$id` on the base
 * action's `type` named the domain or extension type and refused every action
 * type in a hook. Exercises the shipped schemas through `GtsPlugin`, since the
 * behavior under test is the library's reading of the reference keywords.
 *
 * `cpt-frontx-algo-gts-type-provider-infra-registration-v2` (inst-irv2-load).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Extension, ExtensionDomain, MfeEntry } from '@gears-frontx/mfes';
// @internal — colocated test, direct relative import is permitted.
import { GtsPlugin } from '../plugin';

const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.lifecyclehooks.fixture.domain.v1';
const HOOKED_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.lifecyclehooks.fixture.hooked.v1';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.lifecyclehooks.fixture.entry.v1';
const EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.lifecyclehooks.fixture.ext.v1';

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

  it('registers a domain whose hooks dispatch actions, a next step included', () => {
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

  it('registers an extension whose hook dispatches an action', () => {
    const extension: Extension = {
      id: EXT_ID,
      domain: DOMAIN_ID,
      entry: ENTRY_ID,
      lifecycle: [
        { stage: activated, actions_chain: { action: { type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } } } },
      ],
    };

    expect(() => plugin.register(extension)).not.toThrow();
    expect(plugin.validateInstance(EXT_ID).valid).toBe(true);
  });

  it('registers a domain whose hook dispatches an action type an application registered', () => {
    const pingType = 'gts.frontx.mfes.comm.action.v1~test.lifecyclehooks.fixture.ping.v1~';
    plugin.registerSchema({
      $id: `gts://${pingType}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { 'x-gts-type-ref': '/$id' },
        target: { 'x-gts-instance-ref': 'gts.frontx.mfes.ext.domain.v1~*' },
        payload: { type: 'object' },
      },
      required: ['type', 'target'],
    });
    const hooked = domain(HOOKED_DOMAIN_ID, [{ stage: init, actions_chain: { action: { type: pingType, target: DOMAIN_ID } } }]);

    expect(() => plugin.register(hooked)).not.toThrow();
    expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
  });

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
});
