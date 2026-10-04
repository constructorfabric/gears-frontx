/**
 * Extension Releaser
 *
 * Internal exactly-once "unmount then destroy" coalescing for a single
 * `ExtensionMounter`. Not part of the public API: not re-exported from
 * `src/index.ts`. Every shipped mount strategy (`ConcurrentMountStrategy.ts`, `OptionalMountStrategy.ts`, `ExclusiveMountStrategy.ts`) and
 * `DefaultExtensionMounter.detach()`'s own mass-release resolve the releaser
 * for their mounter through `ExtensionReleaserProvider.for(mounter)` and call
 * `release(...)` on it instead of `mounter.unmount()` directly, so an
 * explicit unmount and a strategy's own eviction or displacement of the same
 * extension that overlap release its container exactly once between them,
 * whichever caller supplies a `destroy`. The guarantee is provided by the
 * releaser resolved for the `ExtensionMounter` instance a call targets,
 * independent of which concrete `unmount()` implementation is plugged in —
 * including a third-party one that does no coalescing of its own.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2

import type { ExtensionMounter } from './ExtensionMounter';
import { ExtensionReleaser } from './ExtensionReleaser';

/**
 * Owns the one-`ExtensionReleaser`-per-`ExtensionMounter` mapping. A
 * static-method class rather than a singleton instance: neither strategies
 * nor `DefaultExtensionMounter` ever need to hold or inject a provider
 * instance of their own — they only ever need "the releaser for THIS
 * mounter" at the call site, which `ExtensionReleaserProvider.for(mounter)`
 * gives directly, with no instance to plumb through constructors first.
 * Keyed by `WeakMap<ExtensionMounter, ExtensionReleaser>` so an entry for a
 * mounter no longer referenced elsewhere does not pin memory. Resolving the
 * same mounter twice returns the identical `ExtensionReleaser`, so
 * overlapping `release` calls for that mounter coalesce, and a mounter with
 * no releaser resolved yet starts clean.
 */
export class ExtensionReleaserProvider {
  private static readonly releasersByMounter = new WeakMap<ExtensionMounter, ExtensionReleaser>();

  private constructor() {}

  /**
   * @param mounter - The mounter to resolve the releaser for.
   * @returns The SAME `ExtensionReleaser` for every call given the same
   *   `mounter`.
   */
  static for(mounter: ExtensionMounter): ExtensionReleaser {
    let releaser = ExtensionReleaserProvider.releasersByMounter.get(mounter);
    if (!releaser) {
      releaser = new ExtensionReleaser(mounter);
      ExtensionReleaserProvider.releasersByMounter.set(mounter, releaser);
    }
    return releaser;
  }
}
