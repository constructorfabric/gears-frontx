/**
 * Cross-hop route for the downward forwarding-entry and upward escalation
 * resolution tiers.
 *
 * Not an `ActionHandler`: a `CrossHopRoute` hands the sub-chain — the action
 * with its `next` and `fallback` — across a hop in a versioned envelope to
 * the runtime where the target lives, which executes it. The hand-over call
 * either throws, refusing the hand-over, or returns, having accepted it;
 * nothing comes back. Internal-only: not exported from the package barrel.
 *
 * A concrete class so the mediator identifies a resolved route with
 * `instanceof` rather than by the presence of a `send` method.
 *
 * @packageDocumentation
 * @internal
 */

import type { ActionsChain } from '../types';

/**
 * The cross-hop envelope version this copy of the package produces and
 * recognizes. A copy that meets an envelope carrying a version it does not
 * recognize refuses the hand-over.
 */
export const CROSS_HOP_PROTOCOL_VERSION = 1 as const;

/**
 * What crosses a hop: a version and the sub-chain.
 */
export interface CrossHopEnvelope {
  /** Version of the copy that produced this envelope. */
  readonly version: number;
  /** The sub-chain: the action with its `next` and `fallback`. */
  readonly chain: ActionsChain;
}

// @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
export class CrossHopRoute {
  constructor(private readonly sendFn: (envelope: CrossHopEnvelope) => void) {}

  /**
   * Hand the envelope across this hop. Throws to refuse; returns once the
   * far side accepted.
   */
  send(envelope: CrossHopEnvelope): void {
    this.sendFn(envelope);
  }
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
