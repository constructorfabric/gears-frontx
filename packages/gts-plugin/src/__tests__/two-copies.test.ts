/**
 * Two independently evaluated copies of the package in one realm: the host and
 * a microfrontend each load their own module graph, with their own GTS library.
 */
import { GtsStore, type JsonEntity } from '@globaltypesystem/gts-ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, nodeSchema, publishedPair, resetRealm } from './realm-support';

const TYPE = 'gts.test.realm.core.node.v1~';
const inst = (name: string) => `${TYPE}test.realm.core.${name}.v1`;

type Copy = { plugin: typeof import('../plugin') };

/**
 * Re-evaluate this package. The GTS library is externalized by the test runner
 * and stays one module, so the copies cannot receive foreign store classes by
 * themselves; `foreignize` hands them such stores instead.
 */
async function evaluateCopy(): Promise<Copy> {
  vi.resetModules();
  return { plugin: await import('../plugin') };
}

/**
 * Replace the published pair's stores with plain objects that forward to the
 * library's stores. A copy that adopts the pair then holds stores that are an
 * instance of no class it knows, as with a pair created by another copy's own
 * evaluation of the library, and a class-identity check would reject them.
 */
function foreignize(pair: NonNullable<ReturnType<typeof publishedPair>>): void {
  const forward = (real: GtsStore) => ({
    register: (entity: JsonEntity) => real.register(entity),
    get: (id: string) => real.get(id),
    getAll: () => real.getAll(),
    validateInstance: (id: string) => real.validateInstance(id),
  });
  const factory = () => forward(new GtsStore());
  Reflect.set(pair, 'store', forward(pair.store as GtsStore));
  Reflect.set(pair, 'scratch', forward(pair.scratch as GtsStore));
  Reflect.set(pair, 'createStore', factory);
}

let warn: ReturnType<typeof vi.spyOn>;
let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetRealm();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  resetRealm();
});

describe('two copies', () => {
  it('adopt one store pair of a class foreign to the adopting copy; a schema from one validates an instance from the other', async () => {
    const host = await evaluateCopy();
    const hostPlugin = new host.plugin.GtsPlugin();
    const pair = publishedPair()!;
    foreignize(pair);
    expect(pair.store).not.toBeInstanceOf(GtsStore);
    hostPlugin.registerSchema(nodeSchema(TYPE));
    hostPlugin.register({ id: inst('a') });

    const mfe = await evaluateCopy();
    expect(mfe.plugin.GtsPlugin).not.toBe(host.plugin.GtsPlugin);
    const mfePlugin = new mfe.plugin.GtsPlugin();
    expect(publishedPair()).toBe(pair);
    expect(pair.copies).toBe(2);
    // Only the adopting copy announces itself, with its ordinal.
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0]![0])).toMatch(/Copy 2 joined type store/);

    expect(() => mfePlugin.register({ id: inst('b'), peer: inst('a') })).not.toThrow();
    expect(hostPlugin.validateInstance(inst('b')).valid).toBe(true);

    // A rebuild by the adopting copy still builds stores of the pair's own class.
    expect(() => mfePlugin.register({ id: inst('c'), peer: 'nonsense' })).toThrow();
    expect(pair.scratch).not.toBeInstanceOf(GtsStore);
    expect(ids(pair.scratch.getAll())).toEqual(ids(pair.store.getAll()));
  });

  it('name the kept and the refusing copy by ordinal when a type definition conflicts', async () => {
    const host = await evaluateCopy();
    const mfe = await evaluateCopy();
    new host.plugin.GtsPlugin().registerSchema(nodeSchema(TYPE));

    new mfe.plugin.GtsPlugin().registerSchema(nodeSchema(TYPE, { extra: { type: 'number' } }));

    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toMatch(/Kept: registered by copy 1/);
    expect(text).toMatch(/offered by copy 2/);
  });

  it('warn when one copy replaces different content another wrote, but not for the same content, a payload or a shared-property value', async () => {
    const host = await evaluateCopy();
    const mfe = await evaluateCopy();
    const hostPlugin = new host.plugin.GtsPlugin();
    const mfePlugin = new mfe.plugin.GtsPlugin();
    hostPlugin.registerSchema(nodeSchema(TYPE));
    hostPlugin.register({ id: inst('a') });
    hostPlugin.register({ id: inst('b') });

    mfePlugin.register({ id: inst('a') });
    expect(warn).not.toHaveBeenCalled();

    mfePlugin.register({ id: inst('b'), peer: inst('a') });
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain(inst('b'));
    expect(text).toMatch(/copy 1/);
    expect(text).toMatch(/copy 2/);
    // The later content stands.
    expect(hostPlugin.getSchema(inst('b'))).toEqual({ id: inst('b'), peer: inst('a') });

    // Offering it again is silent.
    mfePlugin.register({ id: inst('b'), peer: inst('a') });
    expect(warn).toHaveBeenCalledTimes(1);

    // Shared-property values and anonymous payloads: validated, never owned.
    const sharedType = 'gts.frontx.mfes.comm.shared_property.v1~';
    const shared = `${sharedType}test.realm.core.theme.v1`;
    expect(hostPlugin.getSchema(sharedType)).toBeDefined();
    hostPlugin.register({ id: shared, value: 'light' });
    mfePlugin.register({ id: shared, value: 'dark' });
    expect(warn).toHaveBeenCalledTimes(1);

    const payloadType = 'gts.test.realm.core.payload.v1~';
    hostPlugin.registerSchema({
      $id: `gts://${payloadType}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { n: { type: 'number' } },
    });
    hostPlugin.register({ type: payloadType, n: 1 });
    mfePlugin.register({ type: payloadType, n: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
