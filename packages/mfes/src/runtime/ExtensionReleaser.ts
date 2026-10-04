import type { ExtensionMounter } from './ExtensionMounter';

/**
 * Owns the "unmount, then run the registered destroy" coalescing for ONE
 * `ExtensionMounter` instance. Constructed and looked up exclusively through
 * `ExtensionReleaserProvider.for(mounter)`, which guarantees a mounter is
 * ever given at most one releaser.
 *
 * A mount strategy registers, at mount time, the container-release callback
 * that owns an extension's container via `registerDestroy(extensionId,
 * destroy)`. Every subsequent `release(extensionId)` call — whether it is
 * the strategy's own explicit unmount, an eviction by a sibling mount, or
 * `DefaultExtensionMounter.detach()`'s mass-release — runs THAT registered
 * destroy, taken from the registration exactly once, alongside the shared
 * physical `unmount()`.
 *
 * Reached only through `ExtensionReleaserProvider.for(...)`: strategies and
 * `DefaultExtensionMounter` never construct an instance directly.
 */
export class ExtensionReleaser {
  /**
   * The container-release callback registered for an extension id, set by
   * the mount strategy that mounted it (`registerDestroy`) and consumed —
   * read and removed in the same step — by the `release()` call that
   * settles it, so it runs exactly once even when several callers overlap
   * on the SAME extension id.
   */
  private readonly destroysByExtension = new Map<string, () => void>();

  /**
   * The settlement promise of a release currently running for a given
   * extension id on this releaser's mounter. Read by the mount-ext prologue
   * (`MountExtActionHandler`) together with `ExtensionMounter.getUnmountInFlight`
   * so a waiting mount settles only once BOTH the physical unmount and its
   * registered destroy have run.
   */
  private readonly releasesInFlight = new Map<string, Promise<void>>();

  constructor(private readonly mounter: ExtensionMounter) {}

  /**
   * The in-flight release settlement for `extensionId` on this releaser's
   * mounter, if `release` is currently running one, or `undefined`.
   */
  inFlight(extensionId: string): Promise<void> | undefined {
    return this.releasesInFlight.get(extensionId);
  }

  /**
   * Register the container-release callback for `extensionId` that the
   * NEXT `release(extensionId)` call must run alongside its physical
   * unmount. Called once, by the mount strategy, right after a SUCCESSFUL
   * `mounter.mount(extensionId, container)` — a fresh registration
   * overwrites whatever was registered before it, since a re-mounted
   * extension gets a fresh container and therefore a fresh destroy.
   *
   * @param extensionId - ID of the extension whose destroy is registered.
   * @param destroy - The container-release callback for `extensionId`.
   */
  registerDestroy(extensionId: string, destroy: () => void): void {
    this.destroysByExtension.set(extensionId, destroy);
  }

  /**
   * Unmount `extensionId` on this releaser's mounter via `mounter.unmount()`
   * and then run the destroy registered for it — coalescing every
   * concurrent `release` call for the SAME extension id onto ONE shared
   * "unmount then destroy" operation.
   *
   * A call joining an already-in-flight release simply awaits the same
   * settlement; only the call that starts the release reads and removes
   * the registered destroy, so it runs exactly once regardless of how many
   * callers overlap on the same extension id.
   *
   * Whether `mounter.unmount()` fulfills or rejects, the registered destroy
   * still runs: on fulfillment its own failure is what the caller sees; on
   * rejection it runs for its side effect only and the unmount error stays
   * the one the caller sees.
   *
   * @param extensionId - ID of the extension being released.
   */
  release(extensionId: string): Promise<void> {
    const existing = this.releasesInFlight.get(extensionId);
    if (existing) {
      return existing;
    }

    const takeDestroy = (): (() => void) | undefined => {
      const destroy = this.destroysByExtension.get(extensionId);
      this.destroysByExtension.delete(extensionId);
      return destroy;
    };

    let settleWork!: () => void;
    let rejectWork!: (error: unknown) => void;
    const work = new Promise<void>((resolve, reject) => {
      settleWork = resolve;
      rejectWork = reject;
    });

    this.releasesInFlight.set(extensionId, work);
    // Identity-checked cleanup: remove only THIS call's own entry — and,
    // critically, do so BEFORE `work` settles for its callers below, so a
    // caller's own rejection (or fulfillment) handler that immediately
    // retries `release` for the SAME extension id synchronously never joins
    // this now-settled entry; it finds the map already cleared and starts
    // fresh instead.
    const cleanup = (): void => {
      if (this.releasesInFlight.get(extensionId) === work) {
        this.releasesInFlight.delete(extensionId);
      }
    };

    // The entry above is published BEFORE `unmount` is invoked, so a call
    // that re-enters `release` for the SAME extension id synchronously
    // (from `unmount`'s own synchronous prefix, e.g. a lifecycle callback
    // that calls back into this mounter before `unmount` itself resolves)
    // finds the entry already in flight and joins it instead of starting a
    // second physical unmount. A synchronous throw from `unmount` is caught
    // here and turned into a rejection of the published entry, instead of
    // throwing out of this call and leaving a joiner waiting forever.
    //
    // `cleanup` and settlement run in the SAME fulfillment/rejection
    // reaction to `unmount`'s promise — not split across two chained
    // `.then()` calls — so there is no microtask gap in which a joiner
    // could observe an entry that has already resolved which destroy will
    // run but has not yet settled.
    try {
      this.mounter.unmount(extensionId).then(
        () => {
          try {
            takeDestroy()?.();
            cleanup();
            settleWork();
          } catch (error) {
            cleanup();
            rejectWork(error);
          }
        },
        (error) => {
          // The unmount failed, but the container this extension owns must
          // still be released — the registered destroy still runs here, for
          // its side effect only. A throw from the destroy itself is
          // swallowed: the unmount error is what the caller must see, since
          // it is the primary failure.
          // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-container-destroyed
          try {
            takeDestroy()?.();
          } catch {
            // Intentionally ignored — the unmount error stays primary.
          }
          // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-container-destroyed
          cleanup();
          rejectWork(error);
        }
      );
    } catch (error) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-container-destroyed
      try {
        takeDestroy()?.();
      } catch {
        // Intentionally ignored — the unmount error stays primary.
      }
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-container-destroyed
      cleanup();
      rejectWork(error);
    }

    return work;
  }
}
