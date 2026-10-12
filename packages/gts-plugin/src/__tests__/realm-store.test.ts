/**
 * Realm store rendezvous: key, entry contract, adoption, warnings, fallback,
 * and the isolation option (`cpt-frontx-dod-gts-type-provider-realm-shared-store`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import gtsTsManifest from '@globaltypesystem/gts-ts/package.json';
import { createJsonEntity } from '@globaltypesystem/gts-ts';
import { GtsPlugin } from '../plugin';
import { compatibleLine } from '../library-version';
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
  const base = { format: 1, libraryLine: '0.3', builtinHash: computeBuiltinHash(builtins) };

  it('differs for two library lines and for two built-in sets that differ in one schema', () => {
    const otherLibrary = { ...base, libraryLine: '0.4' };
    const changedBuiltin = {
      ...base,
      builtinHash: computeBuiltinHash([{ ...builtins[0]!, content: { ...builtins[0]!.content, type: 'array' } }]),
    };
    const keys = new Set([base, otherLibrary, changedBuiltin].map(keyName));
    expect(keys.size).toBe(3);
  });

  it('is a function of the three inputs alone, so an extra input such as a package version cannot change it', () => {
    const v1 = { ...base, packageVersion: '0.3.2' };
    const v2 = { ...base, packageVersion: '0.4.0' };
    expect(keyName(v1)).toBe(keyName(v2));
    expect(keyName(v1)).toBe(keyName(base));
  });

  it('puts gts-ts versions of one compatible line on one key: 0.<minor> while 0.x, the major from 1.0', () => {
    expect(compatibleLine('0.3.0')).toBe('0.3');
    expect(compatibleLine('0.3.9')).toBe('0.3');
    expect(compatibleLine('0.4.0')).toBe('0.4');
    expect(compatibleLine('0.30.1')).toBe('0.30');
    expect(compatibleLine('1.0.0')).toBe('1');
    expect(compatibleLine('1.9.4')).toBe('1');
    expect(compatibleLine('2.0.0')).toBe('2');
    const keyOf = (v: string) => keyName({ ...base, libraryLine: compatibleLine(v) });
    expect(keyOf('0.3.0')).toBe(keyOf('0.3.7'));
    expect(keyOf('0.3.0')).not.toBe(keyOf('0.4.0'));
    expect(keyOf('1.2.0')).toBe(keyOf('1.8.0'));
    expect(keyOf('1.2.0')).not.toBe(keyOf('2.0.0'));
  });

  it('compares identifier spellings as plain content: no GTS-aware normalization', () => {
    const hashOf = (content: object) => computeBuiltinHash([{ id: 'gts.a.b.c.d.v1~', content }]);
    expect(hashOf({ $id: 'gts.a.b.c.d.v1~' })).not.toBe(hashOf({ $id: 'gts://gts.a.b.c.d.v1~' }));
    expect(hashOf({ $id: 'gts.a.b.c.d.v1~' })).not.toBe(hashOf({ $$id: 'gts.a.b.c.d.v1~' }));
  });

  it('is what the package derives from its own library manifest and built-in sets', () => {
    expect(thisCopyInputs()).toEqual({
      format: STORE_FORMAT,
      libraryLine: compatibleLine(gtsTsManifest.version),
      builtinHash: computeBuiltinHash(
        [...loadSchemas(), ...loadLifecycleStages()].map((content) => ({
          id: createJsonEntity(content).id,
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
      ['builtinHash', 'copies', 'createStore', 'format', 'libraryLine', 'reported', 'scratch', 'store', 'writers'].sort()
    );
    expect(STORE_FORMAT).toBe(1);
    expect(typeof entry!.format).toBe('number');
    expect(typeof entry!.libraryLine).toBe('string');
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
    const other = keyName({ ...thisCopyInputs(), libraryLine: '9.9' });
    Reflect.set(globalThis, KEY_INDEX, [other]);

    new GtsPlugin();

    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain(keyName(thisCopyInputs()));
    expect(text).toContain(':9.9:');
    expect(text).toContain('the GTS library line');
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
