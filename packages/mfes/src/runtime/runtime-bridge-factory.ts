/**
 * Runtime Bridge Factory
 *
 * Abstract runtime bridge factory — contract for internal bridge wiring.
 * Extracted from @gears-frontx/screensets in Phase 7 (extension-domain governance).
 *
 * This is NOT the same as MfeBridgeFactory in handler/types.ts, which is
 * a public abstraction for custom handler bridge implementations.
 *
 * @packageDocumentation
 * @internal
 */

import type { ParentMfeBridge, ChildMfeBridge } from '../handler/types';
import type { ExtensionDomainState } from './extension-manager';
import type { ActionsChain } from '../types';
import type { ActionHandler } from '../mediator/types';

export abstract class RuntimeBridgeFactory {
  abstract createBridge(
    domainState: ExtensionDomainState,
    extensionId: string,
    entryTypeId: string,
    domainActions: readonly string[],
    executeActionsChain: (chain: ActionsChain) => Promise<void>,
    registerCatchAllActionHandler: (domainId: string, handler: ActionHandler) => void,
    unregisterCatchAllActionHandler: (domainId: string) => void,
    registerExtensionActionHandler: (extensionId: string, actionTypeId: string, handler: ActionHandler, domainId: string) => void,
    unregisterExtensionActionHandler: (extensionId: string) => void
  ): { parentBridge: ParentMfeBridge; childBridge: ChildMfeBridge };

  abstract disposeBridge(
    domainState: ExtensionDomainState,
    parentBridge: ParentMfeBridge
  ): void;
}
