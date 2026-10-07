/**
 * Unmount-Ext Prologue
 *
 * The strategy-agnostic guard that runs before every `unmount_ext` action
 * handler a domain registers. In a Concurrent domain this waits for an
 * in-progress mount of the same extension to settle before proceeding
 * (`inst-um-await-mount-settle`); in an Optional domain an explicit unmount
 * takes part in the SAME two-slot occupancy queue a fresh mount does
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-occupancy-queue`). An Exclusive domain's `unmount_ext` is not
 * decorated with this class: the registry registers the domain's own handler
 * as is, so the request reaches the Exclusive strategy's `unmount` — which
 * changes nothing and fails — outside the occupancy queue and the report
 * (`inst-me-exclusive-unmount-fails`).
 *
 * This class does NOT implement any of the `MountExtActionHandler`
 * prologue's own instructions (`inst-me-eligibility-check`,
 * `inst-me-already-mounted-complete`, `inst-me-join-in-progress-mount`,
 * `inst-me-await-unmount-settle`, `inst-me-fresh-mount-after-unmount`,
 * `inst-me-fail-after-unmount-failure`) — those are realized there, on the
 * `mount_ext` side, not here.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2

import { ActionHandler } from '../mediator/ActionHandler';
import { DeclaredTimeoutActionHandler } from '../mediator/DeclaredTimeoutActionHandler';
import { ActionTimeoutResolver } from '../mediator/ActionTimeoutResolver';
import { DomainOccupancyCoordinator } from './DomainOccupancyCoordinator';
import { ConcurrentMountJoiner } from './ConcurrentMountJoiner';
import type { ExtensionAdmissionReader, MountedExtensionReader } from './MountExtActionHandler';
import type { RouterPort } from '../router/RouterPort';
import type { HistoryIntent } from '../types';
import { executionChange } from './ExecutionChange';

/**
 * Decorates a domain's collected `unmount_ext` handler.
 *
 * A Concurrent domain is given `concurrentJoiner` (and no `queue`); an
 * Optional domain is given `queue` (and no `concurrentJoiner`) — the SAME
 * instance `MountExtActionHandler` was given for this domain's
 * `mount_ext` handler.
 */
export class UnmountExtActionHandler extends DeclaredTimeoutActionHandler {
  /**
   * @param inner - The handler the domain factory registered for
   *   `unmount_ext` — ultimately a bound
   *   `strategy.unmount(...)` call.
   * @param domainId - The domain this `unmount_ext` handler was registered
   *   for.
   * @param admissionReader - Resolves the domain an extension is admitted
   *   to.
   * @param mountedReader - Reads whether an extension is currently in the
   *   addressed domain's mount set.
   * @param actionTimeoutResolver - The shared timeout rule.
   * @param domainReader - Reads this domain's declaration (for its
   *   `defaultActionTimeout`).
   * @param queue - This domain's occupancy queue (Optional), or `undefined`
   *   for a Concurrent domain.
   * @param concurrentJoiner - This domain's same-extension mount joiner
   *   (Concurrent), used to await an in-flight mount of the same subject, or
   *   `undefined` for an Optional domain.
   * @param router - The injected router, or `undefined` for a standalone
   *   registry.
   * @param readMounted - Reads the domain's current mount set; an execution's
   *   report lists what changed in it while the execution ran.
   */
  constructor(
    private readonly inner: ActionHandler,
    private readonly domainId: string,
    private readonly admissionReader: ExtensionAdmissionReader,
    private readonly mountedReader: MountedExtensionReader,
    private readonly actionTimeoutResolver: ActionTimeoutResolver,
    private readonly domainReader: () => { id: string; defaultActionTimeout: number } | undefined,
    private readonly queue: DomainOccupancyCoordinator | undefined,
    private readonly concurrentJoiner: ConcurrentMountJoiner | undefined,
    private readonly router: RouterPort | undefined,
    private readonly readMounted: () => readonly string[]
  ) {
    super();
  }

  /**
   * Runs the domain's registered `unmount_ext` handler and, where a router
   * is injected, reports what the execution physically mounted and unmounted
   * (and the action's history intent) to it exactly once, mirroring
   * `MountExtActionHandler.runAndReportSettled` (`inst-me-report-settled`,
   * `inst-me-report-before-next`, `inst-me-report-failure-isolated`).
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-settled
  private async runAndReportSettled(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    let failed = false;
    let failure: unknown;
    const before = this.readMounted();
    try {
      await this.inner.handleAction(actionTypeId, payload);
    } catch (error) {
      failed = true;
      failure = error;
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-before-next
    if (this.router) {
      try {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-mounted-unmounted
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-failed-execution
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-empty-execution
        // The mount set read before and after the strategy ran gives what
        // the execution physically unmounted (and mounted), for a failed
        // execution too; a domain without an occupancy queue (Concurrent)
        // runs overlapping executions, each addressing only its own subject.
        const { mounted, unmounted } = executionChange(
          before,
          this.readMounted(),
          this.queue ? undefined : (payload as { subject: string }).subject
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-empty-execution
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-failed-execution
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-mounted-unmounted
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-history-intent:p1:inst-hi-reach-router
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-history-intent:p1:inst-hi-uninterpreted
        // The history intent is passed exactly as the executed action carries
        // it — never interpreted, defaulted, or rewritten here — and stays absent
        // when the action carries none.
        const history = (payload as { history?: HistoryIntent } | undefined)?.history;
        this.router.reportSettled({
          domainId: this.domainId,
          ...(history === undefined ? {} : { history }),
          mounted,
          unmounted,
        });
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-history-intent:p1:inst-hi-uninterpreted
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-history-intent:p1:inst-hi-reach-router
      } catch (reportError) {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-failure-isolated
        console.error(
          `[UnmountExtActionHandler] reportSettled failed for domain '${this.domainId}', ` +
          `subject '${String((payload as { subject?: unknown } | undefined)?.subject)}':`,
          reportError
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-failure-isolated
      }
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-before-next
    if (failed) {
      throw failure;
    }
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-settled

  async handleActionWithDeclaredTimeout(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined,
    declaredTimeout: number | undefined
  ): Promise<void> {
    const subject = (payload as { subject?: unknown } | undefined)?.subject;
    if (typeof subject !== 'string') {
      return this.inner.handleAction(actionTypeId, payload);
    }
    const extensionId = subject;

    if (!this.queue) {
      return this.handleConcurrentUnmount(actionTypeId, payload, extensionId);
    }

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-caller-timer
    const timeoutMs = this.actionTimeoutResolver.resolve(declaredTimeout, this.domainReader(), this.domainId);
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-caller-timer

    await this.queue.submit('unmount', extensionId, timeoutMs, () =>
      this.runUnmountAtTurn(extensionId, actionTypeId, payload)
    );
  }

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-evaluate-at-turn
  private async runUnmountAtTurn(
    extensionId: string,
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-eligibility-at-turn
    if (this.admissionReader.domainOf(extensionId) !== this.domainId) {
      throw new Error(
        `unmount_ext: extension '${extensionId}' is no longer admitted to domain '${this.domainId}'.`
      );
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-eligibility-at-turn

    if (this.mountedReader.isMounted(extensionId)) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-queue-unmount-at-turn
      return this.runAndReportSettled(actionTypeId, payload);
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-queue-unmount-at-turn
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-queue-absent-noop
    return;
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-queue-absent-noop
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-evaluate-at-turn

  /**
   * The Concurrent-domain unmount path — waits for an in-progress mount of
   * the same extension to settle before proceeding.
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-await-mount-settle
  private async handleConcurrentUnmount(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined,
    extensionId: string
  ): Promise<void> {
    const inFlightMount = this.concurrentJoiner?.inFlight(extensionId);
    if (inFlightMount) {
      try {
        await inFlightMount;
      } catch {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-after-mount-failure
        // The awaited mount failed, so the extension never became mounted —
        // this unmount request completes successfully without invoking
        // `inner` at all.
        return;
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-after-mount-failure
      }
      // inst-um-after-mount-success falls through to the ordinary unmount
      // below: the awaited mount has already settled to mounted.
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-after-mount-success
    return this.runAndReportSettled(actionTypeId, payload);
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-after-mount-success
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-await-mount-settle
}
