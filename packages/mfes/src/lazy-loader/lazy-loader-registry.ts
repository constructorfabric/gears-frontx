/**
 * Host-side registry for per-load lazy-import ABI resolvers (ADR-0022).
 *
 * Each MFE load mints a distinct per-load `__frontx_lazy` resolver and
 * registers it here under a unique load ID. Loader-stub blob modules call
 * `globalThis.__FRONTX_LAZY__.resolve(loaderId, path)` to route lazy-chunk
 * resolution back to the parent load's blob URL chain — keeping sibling loads
 * isolated from each other.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1
// @cpt-dod:cpt-frontx-dod-mfe-loading-lazy-abi-isolation:p1

/**
 * Resolver function for a single per-load lazy chunk.
 * Returns a promise that resolves to the blob URL for the requested chunk.
 */
export type LazyResolver = (path: string) => Promise<string>;

/**
 * Singleton host-side registry that exposes `globalThis.__FRONTX_LAZY__` and
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
   * Ensure the singleton is created and the narrow `__FRONTX_LAZY__` global is
   * exposed exactly once. Subsequent calls return the cached singleton.
   *
   * The global surface is deliberately minimal — a single `resolve(id, path)`
   * method — so blob-realm loader stubs can reach the host-side resolver
   * without leaking handler internals.
   */
  static ensureExposed(): LazyLoaderRegistry {
    if (this.instance) return this.instance;
    const inst = new LazyLoaderRegistry();
    this.instance = inst;
    const host = globalThis as unknown as {
      __FRONTX_LAZY__?: { resolve(id: string, path: string): Promise<string> };
    };
    host.__FRONTX_LAZY__ = {
      resolve: (id, path) => inst.resolve(id, path),
    };
    return inst;
  }

  /**
   * Register a per-load resolver and return its unique load ID.
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
      return Promise.reject(
        new Error(`__frontx_lazy: no resolver registered for loader id '${id}'`)
      );
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-unknown
    }
    return resolver(path);
  }
}
