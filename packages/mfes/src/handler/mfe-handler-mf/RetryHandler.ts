/**
 * Retry with exponential backoff for the MFE load attempt.
 *
 * @packageDocumentation
 */

/**
 * The delay before the first retry; each further retry waits twice as long as
 * the one before (1000 ms, 2000 ms, ...).
 */
export const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Retry utility for MFE operations.
 * @internal
 */
export class RetryHandler {
  /**
   * Retry an async operation with exponential backoff.
   *
   * @param operation - Operation to retry
   * @param maxRetries - Maximum number of retries after the first attempt
   * @param initialDelay - Delay in ms before the first retry
   * @param shouldRetry - Whether a failure is one a repeat attempt can change;
   *   a failure it rejects is thrown at once, without waiting out any backoff
   * @returns Result of the operation
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-per-attempt-budget
  async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    initialDelay: number,
    shouldRetry: (error: unknown) => boolean
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-if-deterministic-failure
        if (attempt >= maxRetries || !shouldRetry(error)) {
          // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-no-retry-deterministic
          throw error;
          // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-no-retry-deterministic
        }
        // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-if-deterministic-failure
        await this.delay(initialDelay * Math.pow(2, attempt));
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-per-attempt-budget

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
