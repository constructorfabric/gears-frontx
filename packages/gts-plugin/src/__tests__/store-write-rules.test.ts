/**
 * Write rules on the shared pair: first definition wins for types, last valid
 * write wins for instances, a rejected candidate leaves both stores in step
 * (`cpt-frontx-dod-gts-type-provider-realm-shared-store`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gts, GtsStore } from '@globaltypesystem/gts-ts';
import { GtsPlugin } from '../plugin';
import { createPair, keyName, slotKey } from '../store-pair';
import { META_SCHEMA, ids, nodeSchema, publishedPair, resetRealm, thisCopyInputs } from './realm-support';

const TYPE = 'gts.test.realm.core.node.v1~';
const inst = (name: string) => `${TYPE}test.realm.core.${name}.v1`;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetRealm();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  resetRealm();
});

describe('types: the first definition stands', () => {
  it('ignores identical content silently and changes nothing', () => {
    const plugin = new GtsPlugin();
    plugin.registerSchema(nodeSchema(TYPE));
    const before = publishedPair()!.store.get(TYPE);

    plugin.registerSchema(nodeSchema(TYPE));
    new GtsPlugin().registerSchema(nodeSchema(TYPE));
    plugin.register(nodeSchema(TYPE));

    expect(publishedPair()!.store.get(TYPE)).toBe(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('compares content structurally: a different spelling of an identifier is a conflict, and the first still stands', () => {
    const plugin = new GtsPlugin();
    plugin.registerSchema(nodeSchema(TYPE));
    const before = publishedPair()!.store.get(TYPE);

    // gts://X~ against X~, $$id against $id, and a gts:// x-gts-ref: the plugin does not
    // guess what the library treats alike, so each is reported as a different definition.
    const respelledId = nodeSchema(TYPE);
    respelledId.$id = TYPE;
    const doubleDollar: Record<string, unknown> = { ...nodeSchema(TYPE) };
    doubleDollar.$$id = doubleDollar.$id;
    delete doubleDollar.$id;
    const respelledRef = nodeSchema(TYPE, { other: { 'x-gts-ref': `gts://${TYPE}*` } });
    const plainRef = nodeSchema(TYPE, { other: { 'x-gts-ref': `${TYPE}*` } });

    for (const offered of [respelledId, doubleDollar, respelledRef, plainRef]) {
      expect(() => plugin.registerSchema(offered)).not.toThrow();
    }

    expect(publishedPair()!.store.get(TYPE)).toBe(before);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('keeps the first on a different definition, does not throw, and warns once per identifier and offered content', () => {
    const plugin = new GtsPlugin();
    plugin.registerSchema(nodeSchema(TYPE));
    const different = nodeSchema(TYPE, { extra: { type: 'number' } });

    expect(() => plugin.registerSchema(different)).not.toThrow();
    expect(() => plugin.registerSchema(different)).not.toThrow();
    expect(() => plugin.register(different)).not.toThrow();

    expect(plugin.getSchema(TYPE)).toEqual(nodeSchema(TYPE));
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain(TYPE);
    expect(text).toContain(keyName(thisCopyInputs()));
    expect(text).toContain('copy 1');
    expect(text).toContain('"extra"');
    expect(text).toContain('needs a new type identifier');

    // A second, different offer is a new warning.
    plugin.registerSchema(nodeSchema(TYPE, { extra: { type: 'string' } }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('gives register and registerSchema the same outcome, in an empty store and in a populated one', () => {
    for (const method of ['registerSchema', 'register'] as const) {
      // Empty: the schema is stored. Populated: the first stands.
      const empty = new GtsPlugin({ isolated: true });
      empty[method](nodeSchema(TYPE));
      expect(empty.getSchema(TYPE)).toEqual(nodeSchema(TYPE));

      const populated = new GtsPlugin({ isolated: true });
      populated.registerSchema(nodeSchema(TYPE));
      populated[method](nodeSchema(TYPE, { extra: { type: 'number' } }));
      expect(populated.getSchema(TYPE)).toEqual(nodeSchema(TYPE));
    }
  });

  it('refuses a definition with no $schema, with non-JSON content, or with an invalid type identifier, and writes nothing', () => {
    const plugin = new GtsPlugin();
    const noMeta = { ...nodeSchema(TYPE) } as Record<string, unknown>;
    delete noMeta.$schema;
    expect(() => plugin.registerSchema(noMeta)).toThrow(/reads it as an instance/);

    const cyclic: Record<string, unknown> = nodeSchema(TYPE);
    cyclic.self = cyclic;
    expect(() => plugin.registerSchema(cyclic)).toThrow(/not representable as JSON \(a cycle\)/);
    expect(() => plugin.registerSchema(nodeSchema(TYPE, { bad: () => 1 }))).toThrow(/not representable/);

    expect(() => plugin.registerSchema({ $id: 'gts://not-a-gts-id~', $schema: META_SCHEMA })).toThrow(
      /not a valid GTS identifier/
    );
    expect(() => plugin.register({ $schema: META_SCHEMA, type: 'object' })).toThrow();

    expect(publishedPair()!.store.get(TYPE)).toBeUndefined();
  });

  it('keeps its own copy, so changing the offered or the returned object never changes the definition', () => {
    const plugin = new GtsPlugin();
    const offered = nodeSchema(TYPE);
    plugin.registerSchema(offered);
    offered.properties.id = { type: 'number' } as never;
    const returned = plugin.getSchema(TYPE)!;
    (returned.properties as Record<string, unknown>).id = { type: 'boolean' };

    expect(plugin.getSchema(TYPE)).toEqual(nodeSchema(TYPE));
  });
});

describe('instances: the last valid write stands', () => {
  beforeEach(() => {
    new GtsPlugin().registerSchema(nodeSchema(TYPE));
  });

  it('replaces what the store held, and does not warn when the same copy rewrites it', () => {
    const plugin = new GtsPlugin();
    plugin.register({ id: inst('a') });
    plugin.register({ id: inst('b'), peer: inst('a') });
    plugin.register({ id: inst('b'), peer: inst('b') });

    expect(plugin.getSchema(inst('b'))).toEqual({ id: inst('b'), peer: inst('b') });
    expect(warn).not.toHaveBeenCalled();
  });

  it('never makes an invalid instance visible, under a held identifier or a new one', () => {
    const plugin = new GtsPlugin();
    const other = new GtsPlugin();
    plugin.register({ id: inst('a') });
    const pair = publishedPair()!;

    // Under a held identifier: the scratch entry is restored, not rebuilt.
    const held = { id: inst('a'), peer: 'gts.test.realm.core.node.v1~test.missing.core.nothing.v1' };
    expect(() => plugin.register(held)).toThrow(/GTS validation failed/);
    expect(plugin.getSchema(inst('a'))).toEqual({ id: inst('a') });
    expect(pair.scratch.get(inst('a'))).toBe(pair.store.get(inst('a')));

    // Under a new identifier: the scratch store is rebuilt by the pair's factory.
    const oldScratch = pair.scratch;
    expect(() => plugin.register({ id: inst('fresh'), peer: 'nonsense' })).toThrow();
    expect(other.getSchema(inst('fresh'))).toBeUndefined();
    expect(pair.scratch).not.toBe(oldScratch);
    expect(ids(pair.scratch.getAll())).toEqual(ids(pair.store.getAll()));
    // Seen from every instance on the pair: the next call validates against the rebuilt mirror.
    expect(() => other.register({ id: inst('after'), peer: inst('a') })).not.toThrow();
    expect(ids(pair.scratch.getAll())).toEqual(ids(pair.store.getAll()));
  });

  it('rebuilds with the pair\'s own factory, not the calling copy\'s library', () => {
    resetRealm();
    const factory = vi.fn(() => new GtsStore());
    Reflect.set(globalThis, slotKey(thisCopyInputs()), createPair(thisCopyInputs(), factory));
    const plugin = new GtsPlugin();
    plugin.registerSchema(nodeSchema(TYPE));
    factory.mockClear();

    expect(() => plugin.register({ id: inst('x'), peer: 'nonsense' })).toThrow();

    expect(factory).toHaveBeenCalledTimes(1);
  });

  const HINT = /may be registered later, or by a runtime on a different store/;

  it('names the store and gives the conditional hint when an extension refers to a domain nobody registered', () => {
    // The real case: `domain` is an x-gts-ref field of extension.v1. Only the library's validator
    // reads x-gts-ref values, so the package cannot tell what is missing; the hint must not depend on it.
    const plugin = new GtsPlugin({ isolated: true });
    const entryId = 'gts.frontx.mfes.mfe.entry.v1~test.realm.core.entry.v1';
    plugin.register({ id: entryId, requiredProperties: [], actions: [], domainActions: [] });
    let message = '';
    try {
      plugin.register({
        id: 'gts.frontx.mfes.ext.extension.v1~test.realm.core.ext.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.realm.core.nodomain.v1',
        entry: entryId,
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/GTS validation failed/);
    expect(message).toContain(`Store: ${keyName(thisCopyInputs())}`);
    expect(message).toMatch(HINT);
  });

  it('names the store and the hint on every failure, and names a missing schema when the store can show it', () => {
    const plugin = new GtsPlugin();
    let noSchema = '';
    try {
      plugin.register({ id: 'gts.test.realm.core.unknown.v1~test.realm.core.x.v1' });
    } catch (error) {
      noSchema = String(error);
    }
    expect(noSchema).toContain('gts.test.realm.core.unknown.v1~');
    expect(noSchema).toContain(`Not found on this store: gts.test.realm.core.unknown.v1~`);
    expect(noSchema).toContain(keyName(thisCopyInputs()));
    expect(noSchema).toMatch(HINT);

    // The library finds a $ref in the instance; the store does not hold it, so it is named too.
    const strict = 'gts.test.realm.core.strict.v1~';
    plugin.registerSchema({ ...nodeSchema(strict), required: ['id', 'must'] });
    const ghost = 'gts.test.realm.core.ghost.v1~';
    let withRef = '';
    try {
      plugin.register({ id: `${strict}test.realm.core.s.v1`, $ref: ghost });
    } catch (error) {
      withRef = String(error);
    }
    expect(withRef).toContain(`Not found on this store: ${ghost}`);

    // Through the port, the failure carries the same store and hint.
    const viaPort = plugin.validateInstance('gts.test.realm.core.unknown.v1~test.realm.core.x.v1');
    expect(viaPort.valid).toBe(false);
    expect(viaPort.errors[0]!.message).toContain(keyName(thisCopyInputs()));
    expect(viaPort.errors[0]!.message).toMatch(HINT);

    // A plain type error gets the store and the hint too, since the package cannot tell what it refers to.
    let plain = '';
    try {
      plugin.register({ id: inst('wrongtype'), peer: 5 });
    } catch (error) {
      plain = String(error);
    }
    expect(plain).toContain(`Store: ${keyName(thisCopyInputs())}`);
    expect(plain).toMatch(HINT);
    expect(plain).not.toContain('Not found on this store');

    // A schema's own id: its schemaId is a meta-schema URL, which is not listed as missing.
    const ownId = plugin.validateInstance(TYPE);
    expect(ownId.errors.map((e) => e.message).join('\n')).not.toContain('Not found on this store');

    plugin.register({ id: inst('ok') });
    expect(plugin.validateInstance(inst('ok'))).toEqual({ valid: true, errors: [] });
  });

  it('writes the built-in lifecycle stages through the same path: a second construction changes and logs nothing', () => {
    const pair = publishedPair()!;
    const before = pair.store.getAll();
    new GtsPlugin();
    const after = pair.store.getAll();
    expect(after.length).toBe(before.length);
    expect(after.every((entity, i) => entity === before[i])).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('built-in lifecycle stages', () => {
  it('are validated before they become visible: an invalid stage aborts construction and enters neither store', async () => {
    vi.resetModules();
    // The module's own default instance is built at import, so the stage only breaks once armed.
    let armed = false;
    const brokenId = 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.broken.v1';
    vi.doMock('../loader', async (importOriginal) => {
      const original = await importOriginal<typeof import('../loader')>();
      return {
        ...original,
        loadLifecycleStages: () => [
          ...original.loadLifecycleStages(),
          ...(armed ? [{ id: brokenId, description: 42 }] : []),
        ],
      };
    });
    try {
      const { GtsPlugin: BrokenPlugin } = await import('../plugin');
      const { copyKeyInputs } = await import('../copy-key');
      armed = true;
      expect(() => new BrokenPlugin({ isolated: true })).toThrow(/instance '.*broken.*'/);

      // Shared construction publishes the pair before it writes the stages.
      expect(() => new BrokenPlugin()).toThrow(/instance '.*broken.*'/);
      const entry: unknown = Reflect.get(globalThis, slotKey(copyKeyInputs()));
      const pair = entry as NonNullable<ReturnType<typeof publishedPair>>;
      expect(pair.store.get(brokenId)).toBeUndefined();
      expect(pair.scratch.get(brokenId)).toBeUndefined();
    } finally {
      vi.doUnmock('../loader');
    }
  });
});

describe('instances cannot overwrite a type', () => {
  it('refuses an instance under a registered type identifier and leaves the definition intact', () => {
    const plugin = new GtsPlugin({ isolated: true });
    plugin.registerSchema(nodeSchema(TYPE));

    expect(() => plugin.register({ id: TYPE, type: 'gts.test.realm.core.any.v1~' })).toThrow(/refused/);

    expect(plugin.getSchema(TYPE)).toEqual(nodeSchema(TYPE));
    // The first definition still stands against a later, different one.
    expect(() => plugin.registerSchema(nodeSchema(TYPE))).not.toThrow();
  });

  it('refuses a type identifier arriving through register into an empty store, in either spelling', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const bare = { id: 'gts.test.realm.core.fresh.v1~', type: 'gts.test.realm.core.any.v1~' };
    expect(() => plugin.register(bare)).toThrow(/refused/);
    expect(() => plugin.register({ ...bare, id: `gts://${bare.id}` })).toThrow(/refused/);
    expect(plugin.getSchema(bare.id)).toBeUndefined();
  });
});

describe('stored instances are copies', () => {
  it('validates again when the caller mutates a registered object and registers it a second time', () => {
    const plugin = new GtsPlugin({ isolated: true });
    plugin.registerSchema(nodeSchema(TYPE));
    const obj: Record<string, unknown> = { id: inst('a') };
    plugin.register(obj);

    obj.id = inst('a');
    obj.peer = 'nonsense';
    expect(() => plugin.register(obj)).toThrow(/GTS validation failed/);
    expect(plugin.getSchema(inst('a'))).toEqual({ id: inst('a') });
  });
});

describe('__proto__ keys', () => {
  it('are data: schemas that differ only under __proto__ conflict, and the deep copy keeps the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = new GtsPlugin({ isolated: true });
    const withProto = (v: number) =>
      JSON.parse(`{"$id":"gts://${TYPE}","$schema":"${META_SCHEMA}","type":"object","__proto__":{"x":${v}}}`);
    plugin.registerSchema(withProto(1));
    plugin.registerSchema(withProto(2));

    expect(warn).toHaveBeenCalledTimes(1);
    const stored = plugin.getSchema(TYPE)!;
    expect(Object.keys(stored)).toContain('__proto__');
    expect(JSON.stringify(stored)).toContain('"__proto__":{"x":1}');
  });
});

describe('identifier errors', () => {
  it('come from the library: which identifier is not a type, and why it is invalid', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const schema = (id: string) => ({ $id: `gts://${id}`, $schema: META_SCHEMA, type: 'object' });
    expect(() => plugin.registerSchema(schema('gts.test.realm.core.node.v1'))).toThrow(
      /does not read .* as a type identifier/
    );
    const message = (() => {
      try {
        plugin.registerSchema(schema('gts.test.realm.node.v1~'));
      } catch (error) {
        return String(error);
      }
      return '';
    })();
    expect(message).toContain('is not a valid GTS identifier');
    expect(message).toContain(Gts.validateGtsID('gts.test.realm.node.v1~').error);
  });
});

describe('shared-property values', () => {
  it('are recognized by the library\'s pattern match, not by string prefix, so replacing one never warns', async () => {
    const host = new GtsPlugin();
    const sharedType = 'gts.frontx.mfes.comm.shared_property.v1~';
    const id = `${sharedType}test.realm.core.theme.v1`;
    host.register({ id, value: 'light' });
    // A different copy writing the same id with other content is the case that would warn for any other instance.
    const { GtsPlugin: Other } = await (async () => {
      vi.resetModules();
      return import('../plugin');
    })();
    new Other().register({ id, value: 'dark' });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('return a copy of a stored instance too, so a realm-shared instance cannot be changed through a read', () => {
    const plugin = new GtsPlugin({ isolated: true });
    plugin.registerSchema(nodeSchema(TYPE));
    plugin.register({ id: inst('a') });

    const read = plugin.getSchema(inst('a')) as Record<string, unknown>;
    read.peer = 'tampered';

    expect(plugin.getSchema(inst('a'))).toEqual({ id: inst('a') });
  });

  it('return non-JSON instance content as given', () => {
    const plugin = new GtsPlugin({ isolated: true });
    plugin.registerSchema(nodeSchema(TYPE, { cb: {} }));
    const content = { id: inst('fn'), cb: () => 1 };
    plugin.register(content);
    expect(plugin.getSchema(inst('fn'))).toBe(content);
  });
});

describe('instance write order', () => {
  const CLOSED = 'gts.test.realm.core.closed.v1~';
  const closedSchema = {
    $id: `gts://${CLOSED}`,
    $schema: META_SCHEMA,
    type: 'object',
    additionalProperties: false,
    properties: { id: { 'x-gts-ref': '/$id' } },
    required: ['id'],
  };

  it('validates a re-registration whose content equals the stored one but for an undefined field', () => {
    const plugin = new GtsPlugin({ isolated: true });
    plugin.registerSchema(closedSchema);
    const id = `${CLOSED}test.realm.core.c1.v1`;
    plugin.register({ id });

    expect(() => plugin.register({ id, extra: undefined })).toThrow(/GTS validation failed/);
    expect(plugin.getSchema(id)).toEqual({ id });
    expect(() => plugin.register({ id })).not.toThrow();
  });

  it('leaves both stores holding the same stored copy, never the caller\'s object, after a write and after a no-op', () => {
    const plugin = new GtsPlugin();
    plugin.registerSchema(closedSchema);
    const id = `${CLOSED}test.realm.core.c2.v1`;
    const obj = { id };
    const pair = publishedPair()!;

    plugin.register(obj);
    expect(pair.store.get(id)!.content).not.toBe(obj);
    expect(pair.scratch.get(id)).toBe(pair.store.get(id));

    plugin.register({ id });
    expect(pair.scratch.get(id)).toBe(pair.store.get(id));
    expect(pair.scratch.get(id)!.content).not.toBe(obj);
  });
});
