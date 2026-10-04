/**
 * Concurrent Mount Joiner
 *
 * Joins concurrent fresh mounts of the SAME extension in a Concurrent domain
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-join-in-progress-mount`). A Concurrent domain never evicts a
 * sibling, so different extensions' fresh mounts there run independently —
 * this joiner applies no cross-extension ordering and keeps no occupancy
 * queue.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2

/**
 * @internal
 */
export class ConcurrentMountJoiner {
  private readonly inFlightByExtension = new Map<string, Promise<void>>();

  /**
   * The in-flight fresh-mount placeholder for `extensionId`, if this joiner
   * has one running, or `undefined`.
   */
  inFlight(extensionId: string): Promise<void> | undefined {
    return this.inFlightByExtension.get(extensionId);
  }

  /**
   * Run a fresh physical mount for `extensionId` by invoking `task` exactly
   * once. A second call for the SAME extension id while the first is still
   * running joins the first's placeholder instead of invoking `task` again.
   *
   * A placeholder settlement is published BEFORE `task` is invoked — not
   * after — so a call that re-enters this method for the SAME extension id
   * synchronously (from `task`'s own synchronous prefix) finds the entry
   * already in flight and joins it instead of starting a second physical
   * mount.
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-join-in-progress-mount
  run(extensionId: string, task: () => Promise<void>): Promise<void> {
    const existing = this.inFlightByExtension.get(extensionId);
    if (existing) {
      return existing;
    }

    let settle!: () => void;
    let reject!: (error: unknown) => void;
    const placeholder = new Promise<void>((resolve, rej) => {
      settle = resolve;
      reject = rej;
    });
    this.inFlightByExtension.set(extensionId, placeholder);

    // Identity-checked cleanup: only THIS call's own placeholder is ever
    // removed, so a caller retrying for the SAME extension id synchronously,
    // once this placeholder has already settled, finds the map cleared and
    // starts a fresh mount instead.
    const cleanup = (): void => {
      if (this.inFlightByExtension.get(extensionId) === placeholder) {
        this.inFlightByExtension.delete(extensionId);
      }
    };

    try {
      task().then(
        () => { cleanup(); settle(); },
        (error) => { cleanup(); reject(error); }
      );
    } catch (error) {
      cleanup();
      reject(error);
    }

    return placeholder;
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-join-in-progress-mount
}
