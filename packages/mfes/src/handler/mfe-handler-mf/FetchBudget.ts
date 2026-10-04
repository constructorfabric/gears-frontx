/**
 * Single concurrency budget shared by every fetch of one chain build.
 *
 * A per-batch limit is not enough for the recursive chunk graph: a batch
 * opened at each recursion level and for each sibling group multiplies the
 * width by the graph's bushiness, so a deep, wide graph can put an
 * arbitrary number of fetches in flight even though every individual batch
 * is "bounded". One budget instance lives on the {@link ChainBuildState} of
 * a build and is acquired around the chunk-source fetch itself, so the
 * bound holds for the whole build regardless of depth or sibling-group
 * count.
 *
 * A slot is held ONLY across the source fetch, never across a recursion
 * into a dependency: a parent holding a slot while waiting for its
 * children's fetches would deadlock as soon as the graph is deeper than
 * the width. Waiters are released strictly first-in-first-out, so siblings
 * admitted from one fan-out enter in declaration order.
 */
export class FetchBudget {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(width: number) {
    this.available = width;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Hand the slot directly to the longest-waiting acquirer when there is
   * one (rather than incrementing and letting an arbitrary waiter win the
   * next turn of the event loop), which is what keeps the in-flight count
   * exactly at the width under saturation.
   */
  release(): void {
    const next = this.waiters.shift();
    if (next !== undefined) {
      next();
      return;
    }
    this.available += 1;
  }
}
