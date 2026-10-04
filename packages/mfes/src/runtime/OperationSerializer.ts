/**
 * Operation Serializer
 *
 * Serializes operations per entity ID to prevent race conditions.
 * Operations on the same entity ID are queued and executed sequentially.
 * Operations on different entity IDs can execute concurrently.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * Operation serializer for per-entity concurrency control.
 *
 * This utility class ensures that operations on the same entity ID are executed
 * sequentially while allowing operations on different entities to run concurrently.
 *
 * @internal
 */
export class OperationSerializer {
  /**
   * Operation queues keyed by entity ID.
   * Maps entity IDs to their current operation promise chain.
   */
  private readonly operationQueues = new Map<string, Promise<void>>();

  /**
   * Serialize operations per entity ID to prevent race conditions.
   * Operations on the same entity ID are queued and executed sequentially.
   * Operations on different entity IDs can execute concurrently.
   *
   * @param entityId - Entity ID to serialize operations on
   * @param operation - Operation function to execute
   * @returns Promise resolving to operation result
   */
  async serializeOperation<T>(
    entityId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Get existing queue or create empty resolved promise
    const existingQueue = this.operationQueues.get(entityId) ?? Promise.resolve();

    // Create new operation that waits for existing queue
    const newQueue = existingQueue.then(
      () => operation(),
      () => operation() // Execute even if previous operation failed
    );

    // Store as new queue (capture reference for cleanup comparison)
    const voidQueue = newQueue.then(() => {}, () => {});
    this.operationQueues.set(entityId, voidQueue);

    try {
      return await newQueue;
    } finally {
      // Cleanup queue if this was the last operation
      if (this.operationQueues.get(entityId) === voidQueue) {
        this.operationQueues.delete(entityId);
      }
    }
  }

  /**
   * Clear all operation queues.
   * This is called during disposal to cleanup internal state.
   */
  clear(): void {
    this.operationQueues.clear();
  }
}
