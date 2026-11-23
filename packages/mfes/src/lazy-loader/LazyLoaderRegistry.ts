/**
 * Host-side registry for per-load lazy-import ABI resolvers (ADR-0022).
 *
 * Each MFE load mints a distinct per-load `__frontx_lazy` resolver and
 * registers it here under a load ID. Loader-stub blob modules call the
 * `resolve(loaderId, path)` this copy of the package publishes under a
 * global key of its own, to route lazy-chunk resolution back to the parent
 * load's blob URL chain — keeping sibling loads isolated from each other.
 *
 * The key is unique per runtime copy: a random id generated once when the
 * copy is evaluated, so two copies never share a table and never route one
 * another's calls. The stubs a copy mints embed its key. An older copy's
 * `globalThis.__FRONTX_LAZY__` is neither read nor written.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1

/**
 * Resolver function for a single per-load lazy chunk.
 * Returns a promise that resolves to the blob URL for the requested chunk.
 */
export type LazyResolver = (path: string) => Promise<string>;

/**
 * The `Symbol.for` name this copy publishes its `resolve` under, and that
 * the stubs it mints read: unique per copy.
 */
export const LAZY_LOADER_KEY_NAME = `@gears-frontx/mfes:lazy-loader:${Math.random()
  .toString(36)
  .slice(2)}${Date.now().toString(36)}`;

/**
 * Singleton host-side registry that publishes this copy's `resolve` and
 * routes per-load lazy-chunk resolution calls to the correct resolver.
 *
 * IDs are minted by {@link LazyLoaderRegistry.register}. Lifetimes follow the
 * parent load (page lifetime per ADR-0004's never-revoke invariant).
 */
export class LazyLoaderRegistry {
  private static instance: LazyLoaderRegistry | undefined;
  private readonly resolvers = new Map<string, LazyResolver>();
  private nextId = 0;

  // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-register-resolver
  /**
   * Ensure the singleton is created and this copy's `resolve` is published
   * under its key exactly once. Subsequent calls return the cached singleton.
   *
   * The published surface is deliberately minimal — a single
   * `resolve(id, path)` method — so blob-realm loader stubs can reach the
   * host-side resolver without leaking handler internals.
   */
  static ensureExposed(): LazyLoaderRegistry {
    if (this.instance) return this.instance;
    const inst = new LazyLoaderRegistry();
    this.instance = inst;
    Reflect.set(globalThis, Symbol.for(LAZY_LOADER_KEY_NAME), {
      resolve: (id: string, path: string) => inst.resolve(id, path),
    });
    return inst;
  }

  /**
   * Register a per-load resolver and return its load ID, unique within this
   * copy.
   *
   * The ID is injected into the per-load loader stub blob so that
   * `__frontx_lazy(path)` calls from compiled chunks route back to the
   * resolver that owns the correct blob URL chain.
   */
  register(resolver: LazyResolver): string {
    const id = `lz-${++this.nextId}`;
    this.resolvers.set(id, resolver);
    return id;
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-register-resolver

  private resolve(id: string, path: string): Promise<string> {
    const resolver = this.resolvers.get(id);
    if (!resolver) {
      // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-unknown
      // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-unknown-fail
      return Promise.reject(
        new Error(`__frontx_lazy: no resolver registered for loader id '${id}'`)
      );
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-unknown-fail
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-unknown
    }
    // First exercise of __frontx_lazy(path): route to this load's resolver so
    // the lazy chunk joins the parent load's isolated blob URL chain.
    return resolver(path);
  }
}
