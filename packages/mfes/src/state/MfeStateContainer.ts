/**
 * Abstract class defining the MFE state container contract.
 *
 * This is a minimal framework-agnostic state container that provides:
 * - State storage
 * - State updates
 * - Subscription mechanism
 * - Disposal
 *
 * Exported from @gears-frontx/mfes for DIP -- consumers type against this.
 */
export abstract class MfeStateContainer<TState = unknown> {
  /**
   * Get the current state.
   */
  abstract getState(): TState;

  /**
   * Update the state.
   * @param updater - Function to compute new state from current state
   */
  abstract setState(updater: (state: TState) => TState): void;

  /**
   * Subscribe to state changes.
   * @param listener - Function called when state changes
   * @returns Unsubscribe function
   */
  abstract subscribe(listener: (state: TState) => void): () => void;

  /**
   * Dispose the container and cleanup all subscriptions.
   */
  abstract dispose(): void;

  /**
   * Whether the container is disposed.
   * Returns true if the container is disposed (attempts to use will throw).
   */
  abstract get disposed(): boolean;
}
