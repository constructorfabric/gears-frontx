/**
 * Occupancy Caller
 *
 * One caller's own admitted stake in an `OccupancyEntry` — its own
 * settlement and its own timer, independent of every other caller of the
 * same entry
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-queue-caller-timer`, `inst-me-queue-pending-timeout`,
 * `inst-me-queue-running-never-interrupted`).
 *
 * @packageDocumentation
 * @internal
 */

/**
 * @internal
 */
export class OccupancyCaller {
  private settled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly resolveCaller: () => void;
  private readonly rejectCaller: (error: unknown) => void;

  /** This caller's own settlement — resolved on success, rejected on failure. */
  readonly settlement: Promise<void>;

  /**
   * @param task - The mutation this caller contributes. Every caller
   *   supplies its own task, whether it creates its entry or joins one
   *   already in the queue — the entry runs the task of whichever caller
   *   is still live at its turn (`inst-me-queue-evaluate-at-turn`).
   */
  constructor(private readonly task: () => Promise<void>) {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    this.settlement = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.resolveCaller = resolve;
    this.rejectCaller = reject;
  }

  /** This caller's own contributed task. */
  getTask(): () => Promise<void> {
    return this.task;
  }

  /** Whether this caller has settled — by success, by failure, or by its own timed-out departure from a pending entry. */
  isSettled(): boolean {
    return this.settled;
  }

  /**
   * Arms this caller's own timer. `onFire` runs once, when the timer fires,
   * unless this caller has already settled by another route.
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-caller-timer
  armTimer(timeoutMs: number, onFire: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.settled) {
        onFire();
      }
    }, timeoutMs);
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-caller-timer

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Settles this caller successfully, clearing its own timer. A caller that has already settled is left unchanged. */
  succeed(): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.clearTimer();
    this.resolveCaller();
  }

  /** Settles this caller with a failure, clearing its own timer. A caller that has already settled is left unchanged. */
  fail(error: unknown): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.clearTimer();
    this.rejectCaller(error);
  }
}
