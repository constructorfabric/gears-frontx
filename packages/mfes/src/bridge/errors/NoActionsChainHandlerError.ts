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
