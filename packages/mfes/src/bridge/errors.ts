/**
 * Bridge Error Classes
 *
 * Error classes specific to ChildMfeBridge and ParentMfeBridge.
 *
 * @packageDocumentation
 */

/**
 * Error thrown when no cross-hop envelope receiver is registered on a child
 * bridge — the far side of a hand-over the delivering runtime's `fallback`
 * answers (`inst-delivery-refused`).
 */
export class NoActionsChainHandlerError extends Error {
  readonly code = 'NO_ACTIONS_CHAIN_HANDLER';

  constructor(public readonly extensionId: string) {
    super(
      `No cross-hop envelope receiver registered for extension '${extensionId}'.`
    );
    this.name = 'NoActionsChainHandlerError';
  }
}

/**
 * Error thrown when attempting to use a permanently disposed bridge.
 */
export class BridgeDisposedError extends Error {
  readonly code = 'BRIDGE_DISPOSED';

  constructor(public readonly extensionId: string) {
    super(`Bridge has been disposed for extension '${extensionId}'`);
    this.name = 'BridgeDisposedError';
  }
}

/**
 * Error thrown when an action-delivery path crosses a bridge whose extension
 * is registered but not currently mounted (inactive), distinct from a
 * missing-handler failure and from permanent disposal.
 */
export class BridgeInactiveError extends Error {
  readonly code = 'BRIDGE_INACTIVE';

  constructor(public readonly extensionId: string) {
    super(`Extension '${extensionId}' is not currently mounted; its bridge is inactive.`);
    this.name = 'BridgeInactiveError';
  }
}
