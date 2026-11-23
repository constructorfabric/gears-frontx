/**
 * Each runtime copy publishes its lazy-import `resolve` under a global key of
 * its own, so copies never route one another's calls, and a copy neither
 * reads nor writes an older copy's `globalThis.__FRONTX_LAZY__`
 * (`cpt-frontx-algo-mfe-loading-lazy-import-abi`, `inst-lai-register-resolver`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type LazyModule = typeof import('../LazyLoaderRegistry');

interface LazyEntryPoint {
  resolve(id: string, path: string): Promise<string>;
}

const LEGACY_GLOBAL = '__FRONTX_LAZY__';

/** An independently evaluated copy of the package's registry module. */
async function evaluateCopy(): Promise<LazyModule> {
  vi.resetModules();
  return vi.importActual<LazyModule>('../LazyLoaderRegistry');
}

const entryOf = (copy: LazyModule): LazyEntryPoint =>
  Reflect.get(globalThis, Symbol.for(copy.LAZY_LOADER_KEY_NAME));

afterEach(() => {
  Reflect.deleteProperty(globalThis, LEGACY_GLOBAL);
});

describe('LazyLoaderRegistry per-copy key', () => {
  it('gives each copy its own key, so two copies never misroute', async () => {
    const copyA = await evaluateCopy();
    const copyB = await evaluateCopy();
    expect(copyA.LAZY_LOADER_KEY_NAME).not.toBe(copyB.LAZY_LOADER_KEY_NAME);

    // Both copies mint the same id spelling; each resolves only its own.
    const idA = copyA.LazyLoaderRegistry.ensureExposed().register((path) =>
      Promise.resolve(`A:${path}`),
    );
    const idB = copyB.LazyLoaderRegistry.ensureExposed().register((path) =>
      Promise.resolve(`B:${path}`),
    );
    expect(idA).toBe(idB);
    await expect(entryOf(copyA).resolve(idA, './x.js')).resolves.toBe('A:./x.js');
    await expect(entryOf(copyB).resolve(idB, './x.js')).resolves.toBe('B:./x.js');
  });

  it('rejects an id this copy did not register', async () => {
    const copy = await evaluateCopy();
    copy.LazyLoaderRegistry.ensureExposed();
    await expect(entryOf(copy).resolve('lz-999', './x.js')).rejects.toThrow(
      "no resolver registered for loader id 'lz-999'",
    );
  });

  it('leaves an older copy\'s __FRONTX_LAZY__ untouched', async () => {
    const legacy = { resolve: (): Promise<string> => Promise.resolve('OLD') };
    Reflect.set(globalThis, LEGACY_GLOBAL, legacy);
    const copy = await evaluateCopy();
    const id = copy.LazyLoaderRegistry.ensureExposed().register((path) =>
      Promise.resolve(`NEW:${path}`),
    );
    expect(Reflect.get(globalThis, LEGACY_GLOBAL)).toBe(legacy);
    await expect(entryOf(copy).resolve(id, './x.js')).resolves.toBe('NEW:./x.js');
    await expect(legacy.resolve()).resolves.toBe('OLD');
  });

  it('does not create the legacy global when none exists', async () => {
    const copy = await evaluateCopy();
    copy.LazyLoaderRegistry.ensureExposed();
    expect(Reflect.get(globalThis, LEGACY_GLOBAL)).toBeUndefined();
  });
});
