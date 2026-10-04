/**
 * Thrown by the mediator when no handler resolves for an action's target
 * and type. The action fails: the mediator executes `chain.fallback` if
 * present, otherwise the chain ends.
 *
 * Error message format matches the spec contract verbatim:
 * `No handler found for target '{target}' and action type '{actionType}'`.
 *
 * @internal
 */
export class NoHandlerForActionTargetError extends Error {
  constructor(
    public readonly target: string,
    public readonly actionType: string
  ) {
    super(
      `No handler found for target '${target}' and action type '${actionType}'`
    );
    this.name = 'NoHandlerForActionTargetError';
  }
}
