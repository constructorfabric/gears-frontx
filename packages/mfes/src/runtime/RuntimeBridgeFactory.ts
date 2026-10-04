/**
 * Runtime Bridge Factory
 *
 * Abstract runtime bridge factory — contract for internal bridge wiring.
 *
 * This is NOT the same as MfeBridgeFactory in handler/MfeBridgeFactory.ts, which is
 * a public abstraction for custom handler bridge implementations.
 *
 * @packageDocumentation
 * @internal
 */

import type { ParentMfeBridge } from '../handler/ParentMfeBridge';
import type { ChildMfeBridge } from '../handler/ChildMfeBridge';
import type { ExtensionDomainState } from './ExtensionManager';
import type { ActionsChain } from '../types';
import type { ActionHandler } from '../mediator/ActionHandler';

export abstract class RuntimeBridgeFactory {
  /**
   * Acquire the bridge pair for an extension's mount. When `existing` is
   * `undefined`, mints a brand-new pair (the extension's first mount). When
   * `existing` is provided (a remount of an already-mounted-before
   * extension), re-wires the transport callbacks onto the SAME bridge pair
   * and reactivates it — never re-subscribing to domain property updates,
   * never replaying property values, never touching handler registrations,
   * which survive deactivation untouched.
   */
  abstract acquireBridge(
    domainState: ExtensionDomainState,
    extensionId: string,
    existing: { parentBridge: ParentMfeBridge; childBridge: ChildMfeBridge } | undefined,
    // The registry's `executeActionsChain` (void) — wired to the child
    // bridge's public capability ONLY.
    dispatchActionsChain: (chain: ActionsChain) => void,
    registerExtensionActionHandler: (extensionId: string, actionTypeId: string, handler: ActionHandler, domainId: string) => void
  ): { parentBridge: ParentMfeBridge; childBridge: ChildMfeBridge };

  /**
   * Deactivate a bridge on unmount or mount failure. The pair is retained —
   * handler registrations and property subscriptions survive — but every
   * action-delivery path through it is explicitly rejected until the next
   * `acquireBridge` reactivates it.
   */
  abstract deactivateBridge(parentBridge: ParentMfeBridge): void;

  /**
   * Permanently tear down a bridge pair. Called only when the extension the
   * bridge belongs to is unregistered.
   */
  abstract destroyBridge(
    domainState: ExtensionDomainState,
    parentBridge: ParentMfeBridge
  ): void;
}
