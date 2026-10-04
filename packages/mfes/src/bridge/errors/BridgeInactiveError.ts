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
