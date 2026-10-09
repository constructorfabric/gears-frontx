/**
 * Closed concrete action schemas (`mount_ext`, `unmount_ext`, `load_ext`) and
 * the strictly typed `history` intent `mount_ext`/`unmount_ext` declare on
 * their payload. Exercises the real, shipped schemas through `GtsPlugin` —
 * not a mock typeSystem, since the behavior under test is ajv's
 * `additionalProperties`/`enum` handling on a self-contained leaf, which a
 * mock would not reproduce.
 *
 * `cpt-frontx-dod-gts-type-provider-infra-schema-ownership`,
 * `cpt-frontx-algo-gts-type-provider-infra-registration-v2` (inst-irv2-load),
 * `cpt-frontx-adr-extension-routing-port` (closed action schemas, history
 * intent).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Action, Extension, ExtensionDomain, MfeEntry } from '@gears-frontx/mfes';
// @internal — colocated test, direct relative import is permitted.
import { GtsPlugin } from '../plugin';
import type { JSONSchema } from '../types';

const MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
const UNMOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';
const LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~';

const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.schemaclosure.fixture.domain.v1';
const EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.schemaclosure.fixture.ext.v1';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.schemaclosure.fixture.entry.v1';

describe('closed concrete action schemas (mount_ext, unmount_ext, load_ext)', () => {
  let plugin: GtsPlugin;

  beforeEach(() => {
    // Fresh plugin per test: each constructs its own GtsStore, so registering
    // the same fixture ids across tests never collides.
    plugin = new GtsPlugin({ isolated: true });

    const entry: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
    plugin.register(entry);

    const domain: ExtensionDomain = {
      id: DOMAIN_ID,
      sharedProperties: [],
      actions: [MOUNT_EXT, UNMOUNT_EXT, LOAD_EXT],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
    };
    plugin.register(domain);

    const extension: Extension = { id: EXT_ID, domain: DOMAIN_ID, entry: ENTRY_ID };
    plugin.register(extension);
  });

  function mount(payload: Record<string, unknown>): Action {
    return { type: MOUNT_EXT, target: DOMAIN_ID, payload };
  }

  function unmount(payload: Record<string, unknown>): Action {
    return { type: UNMOUNT_EXT, target: DOMAIN_ID, payload };
  }

  it('accepts a well-formed mount_ext with no history at all', () => {
    expect(() => plugin.register(mount({ subject: EXT_ID }))).not.toThrow();
  });

  it.each(['none', 'replace', 'push'])('accepts mount_ext with history %s', (history) => {
    expect(() => plugin.register(mount({ subject: EXT_ID, history }))).not.toThrow();
  });

  it.each(['none', 'replace', 'push'])('accepts unmount_ext with history %s', (history) => {
    expect(() => plugin.register(unmount({ subject: EXT_ID, history }))).not.toThrow();
  });

  it('rejects a mount_ext whose history is outside none/replace/push', () => {
    expect(() => plugin.register(mount({ subject: EXT_ID, history: 'back' }))).toThrow();
  });

  it('rejects an unmount_ext whose history is outside none/replace/push', () => {
    expect(() => plugin.register(unmount({ subject: EXT_ID, history: 'back' }))).toThrow();
  });

  it('rejects a mount_ext payload carrying a field the schema does not declare', () => {
    // routingOrigin is exactly the field the open schema used to admit
    // (AC2.4 of the change-impact report); closure must now reject it.
    expect(() =>
      plugin.register(mount({ subject: EXT_ID, routingOrigin: { domainKey: DOMAIN_ID, kind: 'opening' } }))
    ).toThrow();
  });

  it('rejects an unmount_ext payload carrying a field the schema does not declare', () => {
    expect(() => plugin.register(unmount({ subject: EXT_ID, extra: true }))).toThrow();
  });

  it('rejects a mount_ext carrying a field its own top level does not declare', () => {
    const malformed = { type: MOUNT_EXT, target: DOMAIN_ID, payload: { subject: EXT_ID }, route: '/x' };
    expect(() => plugin.register(malformed)).toThrow();
  });

  it('rejects a load_ext payload carrying an undeclared field', () => {
    const action: Action = { type: LOAD_EXT, target: DOMAIN_ID, payload: { subject: EXT_ID, history: 'push' } };
    // load_ext carries no history intent — only mount_ext/unmount_ext do.
    expect(() => plugin.register(action)).toThrow();
  });

  describe('an undeclared field set to undefined', () => {
    // A copy of the payload would drop the key, so validation must see the object as offered.
    it.each([
      ['mount_ext payload', () => mount({ subject: EXT_ID, extra: undefined })],
      ['unmount_ext payload', () => unmount({ subject: EXT_ID, extra: undefined })],
      ['load_ext payload', () => ({ type: LOAD_EXT, target: DOMAIN_ID, payload: { subject: EXT_ID, extra: undefined } })],
      ['mount_ext top level', () => ({ ...mount({ subject: EXT_ID }), extra: undefined })],
    ])('is rejected on a %s', (_name, build) => {
      expect(() => plugin.register(build())).toThrow(/GTS validation failed/);
    });

    it('is rejected on a re-dispatch of a payload equal to one already accepted', () => {
      expect(() => plugin.register(mount({ subject: EXT_ID }))).not.toThrow();
      expect(() => plugin.register(mount({ subject: EXT_ID, extra: undefined }))).toThrow();
    });
  });

  it('accepts a well-formed load_ext', () => {
    const action: Action = { type: LOAD_EXT, target: DOMAIN_ID, payload: { subject: EXT_ID } };
    expect(() => plugin.register(action)).not.toThrow();
  });

  it('a concrete action schema derived from the open base action.v1 still validates against its own self-contained closed leaf', () => {
    const DERIVED = 'gts.frontx.mfes.comm.action.v1~test.schemaclosure.fixture.custom_action.v1~';
    const derivedSchema: JSONSchema = {
      $id: `gts://${DERIVED}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { 'x-gts-ref': '/$id' },
        target: { 'x-gts-ref': 'gts.frontx.mfes.ext.domain.v1~*' },
        payload: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subject: { 'x-gts-ref': 'gts.frontx.mfes.ext.extension.v1~*' },
            history: { type: 'string', enum: ['none', 'replace', 'push'] },
            widgetId: { type: 'string' },
          },
          required: ['subject', 'widgetId'],
        },
        timeout: { type: 'number', minimum: 1 },
      },
      required: ['type', 'target', 'payload'],
    };
    plugin.registerSchema(derivedSchema);

    const valid: Action = { type: DERIVED, target: DOMAIN_ID, payload: { subject: EXT_ID, widgetId: 'w1' } };
    expect(() => plugin.register(valid)).not.toThrow();

    // The derived leaf is itself closed: an undeclared field on it is rejected too.
    const withExtra: Action = {
      type: DERIVED,
      target: DOMAIN_ID,
      payload: { subject: EXT_ID, widgetId: 'w1', extra: true },
    };
    expect(() => plugin.register(withExtra)).toThrow();
  });
});
