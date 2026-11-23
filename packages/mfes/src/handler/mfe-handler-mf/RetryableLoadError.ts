/**
 * A load failure a repeat attempt can change: a request that failed or
 * answered a non-success status, or an attempt whose time budget expired.
 *
 * These are the only failures the load retries; every other failure is
 * decided by data a repeat attempt cannot change and fails the load at
 * once (`cpt-frontx-algo-mfe-loading-attempt-timeout`,
 * `inst-lto-per-attempt-budget`). The class extends `MfeLoadError`, so the
 * handler's public error contract is unchanged.
 *
 * A failure can reach a load from another copy of the package — a request
 * a host's earlier load already has in flight in the shared realm cache — so
 * retryability is recognised by a well-known `Symbol.for` brand on the
 * error, not by `instanceof` against this copy's class.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';

const RETRYABLE_BRAND = Symbol.for('@gears-frontx/mfes:retryable-load-error:1');

export class RetryableLoadError extends MfeLoadError {
  readonly [RETRYABLE_BRAND] = true;

  /** Whether `error` is a retryable load failure of any copy of the package. */
  static isBranded(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, RETRYABLE_BRAND) === true
    );
  }
}
