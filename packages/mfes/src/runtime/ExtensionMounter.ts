/**
 * ExtensionMounter - Abstract per-domain mount facade
 *
 * The per-domain mount facade. One instance is constructed by the registry for
 * each registered domain and exposed to the domain implementation through
 * `DomainContext.mounter`. The React slot accesses the mounter via
 * `registry.getMounter(domainId)` to call `attach`/`detach`.
 *
 * The mounter does NOT own mount-set state — the registry does. The mounter
 * does NOT expose `getMounted()`; strategies and consumers read mount-set
 * state via `registry.getMountedExtensions(domainId)`.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2

/**
 * Abstract per-domain mount facade.
 *
 * Encapsulates root attachment, per-extension mount/unmount, and mass-unmount
 * on detach. Strategies capture this instance privately at construction time;
 * the captured reference survives `DomainContext` invalidation because it is
 * stored directly on the strategy's class field, not accessed through `ctx`.
 *
 * The React `ExtensionDomainSlot` component calls:
 * - `attach(element)` from its ref-attach callback
 * - `detach()` from its ref-detach / cleanup callback
 */
export abstract class ExtensionMounter {
  /**
   * Register `root` as the DOM root under which the mounter places per-extension
   * containers. Called by `ExtensionDomainSlot` from its ref-attach callback.
   *
   * Idempotent when called with the same root. Replaces the prior root when
   * called with a different element — subsequent `mount` calls target the new root.
   *
   * @param root - The host DOM element that serves as the mount root for this domain.
   */
  abstract attach(root: Element): void;

  /**
   * Release the attached root and mass-unmount every currently-mounted extension
   * in the domain.
   *
   * The root is cleared first, before the mount set is even read, so a mount
   * whose own lifecycle mount settles while this call is still unmounting an
   * earlier occupant never places its container under the departing root.
   * For each extension in the registry's mount-set, in mount-set order, this
   * unmounts it and runs the destroy that extension's mount registered, so
   * that the registry mount-set stays consistent. An unmount failure for one
   * extension does not stop the rest: every extension is still attempted,
   * and the failures collected this way are thrown together — the single
   * failure unchanged if only one occurred, or one aggregate error carrying
   * all of them, in mount-set order, if more than one did. After detach, the
   * mounter has no root; subsequent `mount` calls will throw until `attach`
   * is called again.
   *
   * Called by `ExtensionDomainSlot` from its cleanup callback.
   */
  abstract detach(): Promise<void>;

  /**
   * Append `container` under the attached root and update the registry's
   * mount-set to include `extensionId`.
   *
   * @param extensionId - ID of the extension being mounted.
   * @param container - Unattached host element provided by `ContainerHooks.create`.
   * @throws Error if no root has been attached via `attach()`.
   */
  abstract mount(extensionId: string, container: Element): Promise<void>;

  /**
   * Detach the per-extension container from the attached root and update
   * the registry's mount-set to remove `extensionId`.
   *
   * @param extensionId - ID of the extension being unmounted.
   */
  abstract unmount(extensionId: string): Promise<void>;
}
