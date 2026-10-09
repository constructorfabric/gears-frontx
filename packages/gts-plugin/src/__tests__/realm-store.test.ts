/**
 * Realm store rendezvous: key, entry contract, adoption, warnings, fallback,
 * and the isolation option (`cpt-frontx-dod-gts-type-provider-realm-shared-store`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import gtsTsManifest from '@globaltypesystem/gts-ts/package.json';
import { GtsPlugin } from '../plugin';
import { loadLifecycleStages, loadSchemas } from '../loader';
import { STORE_FORMAT, computeBuiltinHash, keyName, slotKey } from '../store-pair';
import { nodeSchema, publishedPair, resetRealm, thisCopyInputs } from './realm-support';

const KEY_INDEX = Symbol.for('@gears-frontx/gts-plugin:gts-store-keys');
const TYPE = 'gts.test.realm.core.node.v1~';

beforeEach(resetRealm);
afterEach(() => {
  vi.restoreAllMocks();
  resetRealm();
});

describe('key', () => {
  const builtins = [{ id: 'gts.a.b.c.d.v1~', content: { $id: 'gts://gts.a.b.c.d.v1~', type: 'object' } }];
  const base = { format: 1, libraryVersion: '0.3.0', builtinHash: computeBuiltinHash(builtins) };

  it('differs for two library versions and for two built-in sets that differ in one schema', () => {
    const otherLibrary = { ...base, libraryVersion: '0.4.0' };
    const changedBuiltin = {
      ...base,
      builtinHash: computeBuiltinHash([{ ...builtins[0]!, content: { ...builtins[0]!.content, type: 'array' } }]),
    };
    const keys = new Set([base, otherLibrary, changedBuiltin].map(keyName));
    expect(keys.size).toBe(3);
  });

  it('is a function of the three inputs alone, so an extra input such as a package version cannot change it, and it spells identifiers alike with or without gts://', () => {
    const respelled = computeBuiltinHash([
      { id: 'gts.a.b.c.d.v1~', content: { $id: 'gts.a.b.c.d.v1~', type: 'object' } },
    ]);
    expect(respelled).toBe(base.builtinHash);
    const v1 = { ...base, packageVersion: '0.3.1' };
    const v2 = { ...base, packageVersion: '0.4.0' };
    expect(keyName(v1)).toBe(keyName(v2));
    expect(keyName(v1)).toBe(keyName(base));
  });

  it('is what the package derives from its own library manifest and built-in sets', () => {
    expect(thisCopyInputs()).toEqual({
      format: STORE_FORMAT,
      libraryVersion: gtsTsManifest.version,
      builtinHash: computeBuiltinHash(
        [...loadSchemas(), ...loadLifecycleStages()].map((content) => ({
          id: String((content as { $id?: string; id?: string }).$id ?? (content as { id?: string }).id).replace(/^gts:\/\//, ''),
          content,
        }))
      ),
    });
    new GtsPlugin();
    expect(publishedPair()).toBeDefined();
  });
});

describe('entry contract', () => {
  it('pins the entry shape; changing a field name or kind requires a store format bump', () => {
    new GtsPlugin();
    const entry = publishedPair();
    expect(entry).toBeDefined();
    expect(Object.keys(entry!).sort()).toEqual(
      ['builtinHash', 'copies', 'createStore', 'format', 'libraryVersion', 'reported', 'scratch', 'store', 'writers'].sort()
    );
    expect(STORE_FORMAT).toBe(1);
    expect(typeof entry!.format).toBe('number');
    expect(typeof entry!.libraryVersion).toBe('string');
    expect(typeof entry!.builtinHash).toBe('string');
    expect(typeof entry!.createStore).toBe('function');
    expect(entry!.writers).toBeInstanceOf(Map);
    expect(entry!.reported).toBeInstanceOf(Set);
    expect(typeof entry!.copies).toBe('number');
    for (const op of ['register', 'get', 'getAll', 'validateInstance'] as const) {
      expect(typeof entry!.store[op]).toBe('function');
      expect(typeof entry!.scratch[op]).toBe('function');
    }
  });
});

describe('sharing', () => {
  it('lets one instance rely on a type and an instance another registered', () => {
    const a = new GtsPlugin();
    const b = new GtsPlugin();
    a.registerSchema(nodeSchema(TYPE));
    a.register({ id: `${TYPE}test.realm.core.a.v1` });

    expect(b.getSchema(TYPE)).toBeDefined();
    expect(() => b.register({ id: `${TYPE}test.realm.core.b.v1`, peer: `${TYPE}test.realm.core.a.v1` })).not.toThrow();
    expect(a.validateInstance(`${TYPE}test.realm.core.b.v1`).valid).toBe(true);
  });

  it('counts one join per evaluated copy and stays silent for the copy that publishes', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    new GtsPlugin();
    new GtsPlugin();
    expect(debug).not.toHaveBeenCalled();
    expect(publishedPair()!.copies).toBe(1);
  });

  it('warns, naming both keys and the part that differs, when a second key opens', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const other = keyName({ ...thisCopyInputs(), libraryVersion: '9.9.9' });
    Reflect.set(globalThis, KEY_INDEX, [other]);

    new GtsPlugin();

    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain(keyName(thisCopyInputs()));
    expect(text).toContain('9.9.9');
    expect(text).toContain('the GTS library version');
    expect(text).not.toContain('the built-in hash');
  });

  it('does not warn when the index holds only its own key, and leaves a non-array index alone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new GtsPlugin();
    new GtsPlugin();
    expect(warn).not.toHaveBeenCalled();

    resetRealm();
    Reflect.set(globalThis, KEY_INDEX, 'not an array');
    new GtsPlugin();
    expect(Reflect.get(globalThis, KEY_INDEX)).toBe('not an array');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('unrecognized entry', () => {
  it('is left untouched while the copy works from a local pair', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const foreign = { store: 'nope', copies: 'many' };
    const key = slotKey(thisCopyInputs());
    Reflect.set(globalThis, key, foreign);

    const a = new GtsPlugin();
    const b = new GtsPlugin();

    expect(Reflect.get(globalThis, key)).toBe(foreign);
    expect(foreign).toEqual({ store: 'nope', copies: 'many' });
    expect(Reflect.get(globalThis, KEY_INDEX)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(keyName(thisCopyInputs()));
    // Instances of the copy still share the one local pair.
    a.registerSchema(nodeSchema(TYPE));
    expect(b.getSchema(TYPE)).toBeDefined();
  });

  it('is not adopted when a part of the entry fails the recognition check', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    new GtsPlugin();
    const entry = publishedPair()!;
    Reflect.set(entry, 'writers', {});
    new GtsPlugin().registerSchema(nodeSchema(TYPE));
    expect(entry.store.get(TYPE)).toBeUndefined();
  });
});

describe('isolated instance', () => {
  it('starts from the built-in set, sees no realm registration, and leaves the slot and index untouched', () => {
    new GtsPlugin().registerSchema(nodeSchema(TYPE));
    resetRealm();
    new GtsPlugin().registerSchema(nodeSchema(TYPE));
    const shared = publishedPair()!;
    const indexBefore = [...(Reflect.get(globalThis, KEY_INDEX) as unknown[])];
    const copiesBefore = shared.copies;

    const isolated = new GtsPlugin({ isolated: true });

    expect(isolated.getSchema(TYPE)).toBeUndefined();
    expect(isolated.getSchema('gts.frontx.mfes.ext.domain.v1~')).toBeDefined();
    isolated.registerSchema(nodeSchema('gts.test.realm.core.private.v1~'));
    expect(shared.store.get('gts.test.realm.core.private.v1~')).toBeUndefined();
    expect(Reflect.get(globalThis, KEY_INDEX)).toEqual(indexBefore);
    expect(shared.copies).toBe(copiesBefore);
  });

  it('touches no realm slot at all when constructed first', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    new GtsPlugin({ isolated: true });
    expect(publishedPair()).toBeUndefined();
    expect(Reflect.get(globalThis, KEY_INDEX)).toBeUndefined();
    expect(debug).not.toHaveBeenCalled();
  });
});
