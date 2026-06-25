/**
 * Bridge Error Classes
 *
 * Error classes specific to ChildMfeBridge and ParentMfeBridge.
 *
 * @packageDocumentation
 */

/**
 * Error thrown when no actions chain handler is registered on a child bridge
 */
export class NoActionsChainHandlerError extends Error {
  readonly code = 'NO_ACTIONS_CHAIN_HANDLER';

  constructor(public readonly instanceId: string) {
    super(
      `No actions chain handler registered for instance '${instanceId}'. Child MFEs must call bridge.onActionsChain() to receive parent actions chains.`
    );
    this.name = 'NoActionsChainHandlerError';
  }
}

/**
 * Error thrown when attempting to use a disposed bridge
 */
export class BridgeDisposedError extends Error {
  readonly code = 'BRIDGE_DISPOSED';

  constructor(public readonly instanceId: string) {
    super(`Bridge has been disposed for instance '${instanceId}'`);
    this.name = 'BridgeDisposedError';
  }
}
