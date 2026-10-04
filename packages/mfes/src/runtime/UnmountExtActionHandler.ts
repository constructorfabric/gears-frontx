/**
 * Unmount-Ext Prologue
 *
 * The strategy-agnostic guard that runs before every `unmount_ext` action
 * handler a domain registers. In a Concurrent domain this waits for an
 * in-progress mount of the same extension to settle before proceeding
 * (`inst-um-await-mount-settle`); in an Optional domain (the only strategy
 * that declares `unmount_ext`) an explicit unmount takes part in the SAME
 * two-slot occupancy queue a fresh mount does
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-occupancy-queue`).
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
import type { UnmountExtPayload } from '../types';

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
    private readonly router?: RouterPort
  ) {
    super();
  }

  /**
   * Runs the domain's registered `unmount_ext` handler and, where a router
   * is injected, reports its settled outcome to it exactly once, mirroring
   * `MountExtActionHandler.runAndReportSettled` (`inst-me-report-settled`,
   * `inst-me-report-before-next`, `inst-me-report-failure-isolated`).
   */
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-settled
  private async runAndReportSettled(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    let succeeded = true;
    let failure: unknown;
    try {
      await this.inner.handleAction(actionTypeId, payload);
    } catch (error) {
      succeeded = false;
      failure = error;
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-report-before-next
    if (this.router) {
      try {
        this.router.reportSettled({
          actionTypeId,
          domainId: this.domainId,
          payload: payload as unknown as UnmountExtPayload,
          succeeded,
        });
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
    if (!succeeded) {
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
