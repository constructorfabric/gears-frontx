/**
 * Domain Occupancy Coordinator
 *
 * The internal two-slot occupancy queue for an Optional or Exclusive
 * domain's own `mount_ext` and `unmount_ext` action implementations
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-occupancy-queue`). One instance per registered domain, shared by
 * the domain's `mount_ext` and `unmount_ext` handlers, so a request accepted
 * through one joins, replaces, or is ordered against a request accepted
 * through the other.
 *
 * The queue holds at most two entries: the running entry and one pending
 * entry. An entry is one operation (a mount, or an explicit unmount) on one
 * subject, together with every request that joined it. The queue exposes no
 * public surface — Concurrent domains keep no occupancy queue at all.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2

import { OccupancyCaller } from './OccupancyCaller';
import { OccupancyEntry, type OccupancyOperation } from './OccupancyEntry';

/**
 * @internal
 */
export class DomainOccupancyCoordinator {
  private running: OccupancyEntry | undefined;
  private pending: OccupancyEntry | undefined;
  /** Set by `close()`: the suffix every later request's failure message carries. */
  private closedReasonSuffix: string | undefined;

  /**
   * @param domainId - The domain this queue belongs to, named in every
   *   failure message this queue produces.
   */
  constructor(private readonly domainId: string) {}

  /** Whether the queue holds neither a running nor a pending entry. */
  isEmpty(): boolean {
    return !this.running && !this.pending;
  }

  /**
   * Whether `close()` has run: the domain is being unregistered, and every
   * request submitted from now on fails at once
   * (`inst-me-queue-domain-unregister`).
   */
  isClosed(): boolean {
    return this.closedReasonSuffix !== undefined;
  }

  /**
   * Submit a request for `operation` on `subject`. Returns THIS caller's own
   * settlement — resolved or rejected independently of every other caller
   * of the same entry.
   *
   * @param timeoutMs - This caller's own timer value, already resolved by
   *   the shared timeout rule (`ActionTimeoutResolver`).
   * @param task - This caller's own mutation. Every caller supplies its own
   *   task — one that creates its entry and one that joins an existing
   *   entry alike. When the entry starts, it runs the task of whichever of
   *   its callers is still live at that turn
   *   (`inst-me-queue-evaluate-at-turn`).
   */
  submit(
    operation: OccupancyOperation,
    subject: string,
    timeoutMs: number,
    task: () => Promise<void>
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister
    if (this.closedReasonSuffix !== undefined) {
      // A closed queue admits nothing: the request fails at once and never
      // enters a slot, so its caller takes its own `fallback`.
      return Promise.reject(
        new Error(
          `${operation}_ext: request for '${subject}' in domain '${this.domainId}' ${this.closedReasonSuffix}`
        )
      );
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-place
    const caller = new OccupancyCaller(task);

    if (!this.running) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-start-when-empty
      const entry = new OccupancyEntry(operation, subject);
      this.admit(entry, caller, timeoutMs);
      this.startRunning(entry);
      return caller.settlement;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-start-when-empty
    }

    if (this.pending && this.pending.matches(operation, subject)) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-join-pending
      this.admit(this.pending, caller, timeoutMs);
      return caller.settlement;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-join-pending
    }

    if (this.running.matches(operation, subject)) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-join-running
      if (this.pending) {
        this.settlePendingFailure('was replaced in the occupancy queue by a newer request.');
      }
      this.admit(this.running, caller, timeoutMs);
      return caller.settlement;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-join-running
    }

    if (!this.pending) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-enter-pending
      const entry = new OccupancyEntry(operation, subject);
      this.pending = entry;
      this.admit(entry, caller, timeoutMs);
      return caller.settlement;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-enter-pending
    }

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-replace-pending
    this.settlePendingFailure('was replaced in the occupancy queue by a newer request.');
    const entry = new OccupancyEntry(operation, subject);
    this.pending = entry;
    this.admit(entry, caller, timeoutMs);
    return caller.settlement;
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-replace-pending
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-place
  }

  /**
   * Closes the queue. The pending entry leaves the queue without starting;
   * each of its callers fails and takes its own `fallback` — the running
   * entry is not interrupted (`inst-me-queue-domain-unregister`). Every
   * request submitted after this call fails at once without entering a
   * slot, so when the running entry completes nothing is promoted.
   *
   * @param reasonSuffix - Appended to the failure message named after each
   *   failed request's own operation/subject/domain.
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister
  close(reasonSuffix: string): void {
    this.closedReasonSuffix = reasonSuffix;
    this.settlePendingFailure(reasonSuffix);
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister

  /** Reopens a closed queue, so requests submitted after this call are admitted again. */
  reopen(): void {
    this.closedReasonSuffix = undefined;
  }

  /** Adds `caller` to `entry` and arms its own timer. */
  private admit(entry: OccupancyEntry, caller: OccupancyCaller, timeoutMs: number): void {
    entry.addCaller(caller);
    caller.armTimer(timeoutMs, () => this.onCallerTimerFired(entry, caller, timeoutMs));
  }

  /**
   * A caller's own timer fired. The running entry is never replaced,
   * removed, or interrupted by a caller's timer — only a caller of the
   * PENDING entry that has not yet started is removed and failed alone; the
   * pending entry itself leaves the queue only once its last caller has
   * left, and never starts
   * (`inst-me-queue-pending-timeout`, `inst-me-queue-running-never-interrupted`).
   */
  private onCallerTimerFired(entry: OccupancyEntry, caller: OccupancyCaller, timeoutMs: number): void {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-running-never-interrupted
    if (entry.hasStarted()) {
      // The mediator's own per-action bound settles this caller's own
      // attempt elsewhere; this queue does nothing further for it.
      return;
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-running-never-interrupted

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-pending-timeout
    entry.removeCaller(caller);
    const message =
      `${entry.operation}_ext: request for '${entry.subject}' in domain '${this.domainId}' ` +
      `timed out after ${timeoutMs}ms while queued.`;
    caller.fail(new Error(message));
    if (entry.callers.length === 0 && this.pending === entry) {
      this.pending = undefined;
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-pending-timeout
  }

  /** Fails every caller of the pending entry, if any, and clears the slot. */
  private settlePendingFailure(reasonSuffix: string): void {
    const entry = this.pending;
    if (!entry) {
      return;
    }
    this.pending = undefined;
    const message = `${entry.operation}_ext: request for '${entry.subject}' in domain '${this.domainId}' ${reasonSuffix}`;
    entry.settleAll({ success: false, error: new Error(message) });
  }

  /**
   * Starts `entry` as the running entry, invoking the task of whichever of
   * its callers is still live at this turn
   * (`inst-me-queue-evaluate-at-turn`) synchronously — a synchronous throw
   * from that task counts as failure.
   */
  private startRunning(entry: OccupancyEntry): void {
    this.running = entry;
    let settlement: Promise<void>;
    try {
      settlement = entry.run();
    } catch (error) {
      this.finishRunning(entry, { success: false, error });
      return;
    }
    settlement.then(
      () => this.finishRunning(entry, { success: true }),
      (error) => this.finishRunning(entry, { success: false, error })
    );
  }

  /**
   * When the running entry finishes, each of its callers continues — on
   * success with its own `next`, on failure with its own `fallback`. The
   * entry leaves the queue, and the pending entry, if any, is promoted to
   * running and started (`inst-me-queue-complete-running`).
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-complete-running
  private finishRunning(
    entry: OccupancyEntry,
    outcome: { success: true } | { success: false; error: unknown }
  ): void {
    if (this.running === entry) {
      this.running = undefined;
    }
    entry.settleAll(outcome);

    if (!this.running && this.pending) {
      const promoted = this.pending;
      this.pending = undefined;
      this.startRunning(promoted);
    }
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-complete-running
}
