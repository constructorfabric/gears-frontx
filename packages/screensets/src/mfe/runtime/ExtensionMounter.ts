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
// @cpt-dod:cpt-frontx-dod-mfe-registry-mount-contracts:p1

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
// @cpt-begin:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-extension-mounter
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
   * For each extension in the registry's mount-set this calls
   * `mounter.unmount(extId)` and `hooks.destroy(extId)` so that the registry
   * mount-set stays consistent. After detach, the mounter has no root; subsequent
   * `mount` calls will throw until `attach` is called again.
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
// @cpt-end:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-extension-mounter
