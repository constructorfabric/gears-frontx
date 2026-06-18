/**
 * MFE State Container
 *
 * Framework-agnostic state container for MFE instances.
 * DefaultMfeStateContainer is used internally by DefaultMountManager for bridge construction.
 *
 * Key Principles:
 * - Framework-agnostic (no store slice, no React assumptions)
 * - Instance-level isolation (each MFE gets its own store)
 * - Proper disposal on unmount
 *
 * @packageDocumentation
 */

/**
 * Configuration for creating an MFE state container.
 */
export interface MfeStateContainerConfig<TState = unknown> {
  /**
   * Initial state for the container.
   */
  initialState: TState;
}

/**
 * Abstract class defining the MFE state container contract.
 *
 * This is a minimal framework-agnostic state container that provides:
 * - State storage
 * - State updates
 * - Subscription mechanism
 * - Disposal
 *
 * Exported from @gears-frontx/screensets for DIP -- consumers type against this.
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

/**
 * Default concrete implementation of MfeStateContainer.
 * INTERNAL: Used only by DefaultMountManager for bridge construction.
 * NOT exported from public barrel.
 */
export class DefaultMfeStateContainer<TState = unknown> extends MfeStateContainer<TState> {
  private currentState: TState | null;
  private listeners: Set<(state: TState) => void>;
  private isDisposed: boolean;

  constructor(config: MfeStateContainerConfig<TState>) {
    super();
    this.currentState = config.initialState;
    this.listeners = new Set();
    this.isDisposed = false;
  }

  getState(): TState {
    if (this.isDisposed || this.currentState === null) {
      throw new Error('Cannot get state from disposed container');
    }
    return this.currentState;
  }

  setState(updater: (state: TState) => TState): void {
    if (this.isDisposed || this.currentState === null) {
      throw new Error('Cannot set state on disposed container');
    }

    const newState = updater(this.currentState);
    if (newState !== this.currentState) {
      this.currentState = newState;
      // Notify all listeners
      this.listeners.forEach((listener) => {
        try {
          listener(this.currentState as TState);
        } catch (error) {
          console.error('Error in state listener:', error);
        }
      });
    }
  }

  subscribe(listener: (state: TState) => void): () => void {
    if (this.isDisposed) {
      throw new Error('Cannot subscribe to disposed container');
    }

    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.isDisposed) {
      return; // Idempotent
    }

    this.isDisposed = true;
    this.listeners.clear();
    this.currentState = null;
  }

  get disposed(): boolean {
    return this.isDisposed;
  }
}
