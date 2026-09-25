/**
 * Cross-hop routing for the downward forwarding-entry, upward escalation, and
 * parent-to-child-domain forwarding resolution tiers.
 *
 * Deliberately NOT an `ActionHandler`: a `CrossHopRoute` carries a versioned
 * internal envelope across the bridge hop it crosses and hands the node,
 * together with its continuations and the chain's diagnostic context, to the
 * far side in one synchronous, binary call — refused at the call or
 * accepted, never both, and never answered a second time for the node's own
 * completion. The far side's own resolution tiers, bounds, and branch
 * selection are its own from the moment it accepts — none of which fits
 * `ActionHandler.handleAction(actionTypeId, payload)`'s narrower shape.
 * Internal-only: not exported from the package's public barrel.
 *
 * Why a single answer (ADR `cpt-frontx-adr-action-dispatch-and-chaining`,
 * the owner's continuation model): the runtime that executes an action
 * dispatches the continuation its outcome selects from itself, as a new
 * dispatch, from wherever it is. Crossing a hop is therefore nothing more
 * than one runtime handing a node to another and being done: the delivering
 * runtime holds no reservation or other pending state for the node, applies
 * no bound of its own to it, and receives nothing back. A refusal at the
 * call is the current node's own failure, answered by the delivering
 * runtime's declared `fallback`; an acceptance transfers the sub-chain so
 * every later failure — a missing handler, an admission failure, a handler
 * that throws (synchronously included), or a timeout — is the far side's,
 * answered there, with nothing surfacing back through the call that handed
 * the node over.
 *
 * A concrete class (rather than a structural interface implemented by plain
 * object literals) so the mediator's tier dispatch can identify a resolved
 * route with `instanceof` instead of duck-typing on the presence of a `send`
 * method — an ordinary `ActionHandler` subclass is free to define its own
 * unrelated `send` method without being misrouted.
 *
 * @packageDocumentation
 * @internal
 */

import type { ActionsChain } from '../types';

/**
 * The internal cross-hop transport protocol version this copy of the
 * package produces and recognizes. A copy that meets an envelope carrying a
 * version it does not recognize treats the hop as unavailable rather than
 * guessing at an envelope shape it cannot establish (ADR
 * `cpt-frontx-adr-action-dispatch-and-chaining`), following the identical
 * discipline this package already applies to the mount-context rendezvous
 * (`RENDEZVOUS_PROTOCOL_VERSION`, `runtime/inbound-bridge-link.ts`).
 */
export const CROSS_HOP_PROTOCOL_VERSION = 1 as const;

/**
 * Which of the ways a hop became unavailable a `CrossHopUnavailableError`
 * records — the causes `inst-diagnostic-record` requires a diagnostic to
 * distinguish: an inactive or disposed bridge (`bridge-deactivated`), one
 * released with a revoked link (`link-revoked`), no receiver wired on the
 * far side (`no-receiver-wired`), an unrecognized internal transport
 * protocol version (`unrecognized-protocol-version`), a disposed receiving
 * registry (`registry-disposed`), and the residual "the hop did not take
 * the node and said nothing recognisable about why" (`delivery-failed`),
 * which is still an unavailability rather than a handler failure, because
 * no handler ran.
 */
export type CrossHopUnavailabilityCause =
  | 'bridge-deactivated'
  | 'link-revoked'
  | 'no-receiver-wired'
  | 'unrecognized-protocol-version'
  | 'registry-disposed'
  | 'delivery-failed';

/**
 * The `failureClass` a hop's UNAVAILABILITY carries in a
 * `ChainNodeFailureDiagnostic` — a class of its own and never
 * `handler-failure`, because no handler was reached at all
 * (`inst-diagnostic-record`).
 */
export const CROSS_HOP_FAILURE_CLASS_UNAVAILABLE = 'hop-unavailable';

/**
 * Structural brand `CrossHopUnavailableError` carries.
 *
 * Deliberately a data property recognised STRUCTURALLY rather than by
 * `instanceof`: this error routinely crosses a runtime boundary between two
 * independently loaded copies of this package (`cpt-frontx-adr-mfe-load-isolation`),
 * which do not share a class definition — the identical reason
 * `hasOnCrossHopEnvelopeMethod` duck-types the bridge edge rather than
 * testing its class identity.
 */
function hasUnavailableFailureKind(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { frontxCrossHopFailureKind?: unknown }).frontxCrossHopFailureKind ===
      CROSS_HOP_FAILURE_CLASS_UNAVAILABLE
  );
}

// @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-diagnostic-record
/**
 * A hop became UNAVAILABLE: it refused the delivery at the call, so it never
 * took the node at all. Raised inside the node's own failure boundary, so
 * the dispatching chain's declared `fallback` answers it exactly as it
 * answers any other chain failure — the class governs only how the failure
 * is NAMED, never how it is routed (`inst-chain-failure-class`,
 * `inst-diagnostic-record`).
 */
export class CrossHopUnavailableError extends Error {
  readonly frontxCrossHopFailureKind: typeof CROSS_HOP_FAILURE_CLASS_UNAVAILABLE =
    CROSS_HOP_FAILURE_CLASS_UNAVAILABLE;

  constructor(
    /** The hop this executor was dispatching through — the node's target id. */
    public readonly hop: string,
    public readonly unavailabilityCause: CrossHopUnavailabilityCause,
    message: string
  ) {
    super(message);
    this.name = 'CrossHopUnavailableError';
  }
}

/** Structural (cross-copy-safe) recogniser for {@link CrossHopUnavailableError}. */
export function isCrossHopUnavailableError(value: unknown): value is CrossHopUnavailableError {
  return hasUnavailableFailureKind(value);
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-diagnostic-record

/**
 * What crosses a hop: not a bare action, but a contract between two
 * (possibly independently loaded, possibly differently released) copies of
 * this package. Carries the action to execute at the receiving hop's own
 * authoritative registry — the node together with its continuations, since
 * `Action.next`/`Action.fallback` sit alongside it on the chain node — and a
 * diagnostic context substitutable at the receiving end. Carries no budget:
 * per ADR `cpt-frontx-adr-action-dispatch-and-chaining` the node this hop
 * carries is bounded solely by the timeout resolved at the registry
 * authoritative for its target, never by anything the sending side supplies.
 */
export interface CrossHopEnvelope {
  /** Protocol version of the copy that produced this envelope. */
  readonly version: number;
  /**
   * The node to execute at the receiving hop, together with its
   * continuations — `ActionsChain.next`/`ActionsChain.fallback` sit
   * alongside the action on this same object, so handing this one value
   * across the hop is what carries the node's continuations with it
   * (`inst-flow-hand-over`). The receiving side executes this one node on
   * behalf of the sending executor, dispatching whichever continuation its
   * own outcome selects from itself — never a new public root.
   */
  readonly node: ActionsChain;
  /** Diagnostic context, substitutable, carried across the hop for
   * attribution rather than interpreted by the transport itself. */
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

// @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup
export class CrossHopRoute {
  constructor(private readonly sendFn: (envelope: CrossHopEnvelope) => void) {}
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup

  /**
   * Hand the versioned envelope across this hop — down through a specific
   * child's bridge for a forwarding entry or child-domain forwarding, or up
   * through the registry's own inbound bridge for escalation — and be done
   * with it.
   *
   * Synchronous and binary: either this call throws, refusing the delivery
   * with no side effect at the far side, or it returns having accepted the
   * node, in which case the far side has already reserved what the node
   * needs and this runtime holds nothing further for it
   * (`inst-delivery-binary`, `inst-hand-over-done`).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
  send(envelope: CrossHopEnvelope): void {
    this.sendFn(envelope);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
}
