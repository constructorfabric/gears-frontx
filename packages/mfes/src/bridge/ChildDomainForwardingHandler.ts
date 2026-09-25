// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p2
/**
 * Child Domain Forwarding Route
 *
 * Builds the cross-hop route for forwarding actions targeting a child
 * domain to the child runtime via the bridge transport.
 *
 * When a child MFE registers its own domain, the parent runtime needs a way
 * to route actions to it. This route is registered in the parent's mediator
 * as the catch-all tier for the child domain ID. Per
 * `cpt-frontx-adr-action-dispatch-and-chaining`, every hop that crosses a
 * runtime boundary — this one included — must resolve to the same
 * `CrossHopRoute` shape as the downward forwarding-entry and upward
 * escalation tiers, never to a plain `ActionHandler`: a handler is invoked
 * by the dispatching mediator AFTER it has already admitted the action, so
 * a hop wearing a handler's shape would admit at the forwarding (parent)
 * registry instead of the one authoritative for the target, and would run
 * under a bound the forwarding registry resolved locally rather than the
 * one the authoritative registry resolves for its own target.
 *
 * A catch-all tier is used here because the parent cannot know the full set
 * of action types the child domain supports at registration time — that
 * information lives in the child's own registry.
 *
 * Delivery goes through `ParentMfeBridgeImpl.sendCrossHopEnvelope`, which
 * itself throws `BridgeInactiveError`/`BridgeDisposedError` while the
 * bridge is inactive or destroyed — this module adds no gating logic of its
 * own.
 *
 * @packageDocumentation
 * @internal
 */

import { CrossHopRoute, type CrossHopEnvelope } from '../mediator/cross-hop-route';
import type { ParentMfeBridgeImpl } from './ParentMfeBridge';

/**
 * Build the cross-hop route forwarding any action targeting `childDomainId`
 * through the parent bridge transport.
 *
 * @internal
 */
// @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-register-catchall
export function createChildDomainForwardingRoute(
  parentBridgeImpl: ParentMfeBridgeImpl,
  childDomainId: string
): CrossHopRoute {
  return new CrossHopRoute(
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-catchall-forward
    (envelope: CrossHopEnvelope): void => {
      // Re-target the envelope's action at the child domain — the dispatched
      // action carries the ORIGINAL target (the catch-all tier's own key is
      // the domain id, which IS the action's target here), so no re-targeting
      // is actually needed; forwarded verbatim, with the node's own
      // continuations and diagnostic context carried across unchanged. Hands
      // the node over and is done: a throw here refuses the delivery at the
      // call, with no side effect in the child runtime; a normal return means
      // the child's registry has already accepted and reserved what the node
      // needs, and this runtime holds nothing further for it
      // (`inst-hand-over-node`, `inst-hand-over-done`).
      const forwarded: CrossHopEnvelope = {
        ...envelope,
        node: { ...envelope.node, action: { ...envelope.node.action, target: childDomainId } },
      };
      parentBridgeImpl.sendCrossHopEnvelope(forwarded);
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-catchall-forward
  );
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-register-catchall
