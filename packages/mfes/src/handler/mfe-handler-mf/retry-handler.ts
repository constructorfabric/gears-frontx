/**
 * MFE Error Handling Utilities
 *
 * Provides fallback UI rendering and error recovery mechanisms.
 *
 * @packageDocumentation
 */

/**
 * Retry utility for MFE operations.
 * @internal
 */
export class RetryHandler {
  /**
   * Retry an async operation with exponential backoff.
   *
   * @param operation - Operation to retry
   * @param maxRetries - Maximum number of retries (default: 3)
   * @param initialDelay - Initial delay in ms (default: 1000)
   * @returns Result of the operation
   */
  async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          await this.delay(delay);
        }
      }
    }

    throw lastError ?? new Error('Operation failed after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
