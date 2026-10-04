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
