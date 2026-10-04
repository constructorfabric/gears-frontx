/**
 * Occupancy Entry
 *
 * One operation (a mount, or an explicit unmount) on one subject, together
 * with every request that joined it — the domain occupancy queue's own
 * running or pending slot
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-occupancy-queue`).
 *
 * @packageDocumentation
 * @internal
 */

import type { OccupancyCaller } from './OccupancyCaller';

/** @internal */
export type OccupancyOperation = 'mount' | 'unmount';

/**
 * @internal
 */
export class OccupancyEntry {
  private started = false;

  /** Every caller that joined this entry, in join order. */
  readonly callers: OccupancyCaller[] = [];

  constructor(
    readonly operation: OccupancyOperation,
    readonly subject: string
  ) {}

  addCaller(caller: OccupancyCaller): void {
    this.callers.push(caller);
  }

  removeCaller(caller: OccupancyCaller): void {
    const index = this.callers.indexOf(caller);
    if (index !== -1) {
      this.callers.splice(index, 1);
    }
  }

  /** Whether this entry has begun running its own task. */
  hasStarted(): boolean {
    return this.started;
  }

  /**
   * The first caller, in join order, still in this entry and not settled —
   * neither timed out nor otherwise failed. A caller that timed out of a
   * pending entry has already left `callers`
   * (`inst-me-queue-pending-timeout`); this method exists so a caller that
   * settled without leaving `callers` is never chosen either
   * (`inst-me-queue-evaluate-at-turn`).
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-evaluate-at-turn
  firstLiveCaller(): OccupancyCaller | undefined {
    return this.callers.find((caller) => !caller.isSettled());
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-evaluate-at-turn

  /**
   * Whether an entry for `operation`/`subject` would join this one —
   * requires the same operation AND the same subject: a mount of A never
   * joins an unmount of A, and an unmount of A never joins a mount of A
   * (`inst-me-queue-join-same-operation-subject`).
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-join-same-operation-subject
  matches(operation: OccupancyOperation, subject: string): boolean {
    return this.operation === operation && this.subject === subject;
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-join-same-operation-subject

  /**
   * Invoke the still-live caller's own task exactly once — the first caller
   * in join order that is still in this entry and not settled
   * (`inst-me-queue-evaluate-at-turn`). Marked started BEFORE the task
   * actually runs — a caller's timer that fires once this call has begun
   * always observes `hasStarted()` as true, even while the task's own
   * synchronous prefix is still running. A live caller always exists here:
   * an entry is started either on creation, holding the caller that created
   * it, or on promotion from the pending slot, which is cleared as soon as
   * its last caller times out (`inst-me-queue-pending-timeout`) and whose
   * remaining callers are all unsettled.
   */
  run(): Promise<void> {
    this.started = true;
    // Non-null by the invariant above.
    const caller = this.firstLiveCaller()!;
    return caller.getTask()();
  }

  /** Settles every caller of this entry with the same outcome. */
  settleAll(outcome: { success: true } | { success: false; error: unknown }): void {
    for (const caller of [...this.callers]) {
      if (outcome.success) {
        caller.succeed();
      } else {
        caller.fail(outcome.error);
      }
    }
  }
}
