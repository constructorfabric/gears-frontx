/**
 * Marker for a load failure a repeat attempt cannot change.
 *
 * A dependency cycle is a property of the microfrontend's build, and a
 * refusal of the manifest's own data (`publicPath`, a shared `chunkPath`,
 * a shared-file location that cannot resolve) depends only on the
 * manifest, so every attempt reaches the same refusal: retrying only
 * multiplies the source fetches and delays the same user-visible error
 * by the retry backoff. The marker is a class-private symbol rather than
 * an error subclass so that `MfeLoadError` — the handler's public error
 * contract — is unchanged, and so the same marker survives whether the
 * error was produced inside `MfeHandlerMF` or by a collaborator such as
 * `SharedAssetUrlResolver` a host drives through the `./unit-loader`
 * subpath.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

export class DeterministicLoadFailure {
  protected constructor() {}

  private static readonly MARKER = Symbol(
    'frontx.deterministicLoadFailure',
  );

  /** Mark `error` as one no further attempt could change, and return it. */
  static mark<E extends Error>(error: E): E {
    Object.defineProperty(error, DeterministicLoadFailure.MARKER, {
      value: true,
    });
    return error;
  }

  /** Whether `error` was marked by {@link mark}. */
  static is(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as Record<symbol, unknown>)[
        DeterministicLoadFailure.MARKER
      ] === true
    );
  }
}
