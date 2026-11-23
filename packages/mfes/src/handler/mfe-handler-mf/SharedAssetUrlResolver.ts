/**
 * Shared-file asset URL validation for the `./unit-format` loading path.
 *
 * Resolves a shared-file `location` — a unit location or a whole-package
 * `chunkPath` — by one rule: an http(s) absolute URL of a file, or a path
 * resolved against the shared asset base — normalized to a directory
 * base — that stays under it and names a file. `MfeHandlerMF` and a host
 * driving the `./unit-loader` subpath apply the identical validation with
 * no hand-written URL logic
 * (`cpt-frontx-algo-unit-format-contract-loader-surface`).
 *
 * One class per file (`runtime_style`); every member is static.
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import { AssetBaseUrl } from './AssetBaseUrl';

export class SharedAssetUrlResolver {
  protected constructor() {}

  /**
   * Resolve a shared-file `location` against `assetBase`. A leading '/'
   * resolves to the origin root, not under the base, so containment rejects
   * it unless the base is the origin root.
   * Protocol-relative `//host` spellings, non-http(s) schemes,
   * backslashes, spaces/control characters, percent-encoded dot segments
   * (`%2e%2e`), and `..` escapes fail the load before any fetch
   * (SEC-001). The refusal depends only on the manifest, so the load is not
   * retried.
   */
  static resolve(location: string, assetBase: string, entryId: string): string {
    const rejection = () =>
      new MfeLoadError(
        `shared-file location "${String(location)}" is neither an http(s) ` +
          'URL of a file nor a file path that stays under the shared ' +
          'asset base location.',
        entryId,
      );
    const base = AssetBaseUrl.parse(assetBase);
    if (base === undefined) {
      throw rejection();
    }
    // Always a directory base: containment is a path-prefix check, so the
    // base pathname must end with '/' or '/dir-evil/' would pass a
    // '/dir/' prefix test.
    const baseHref = AssetBaseUrl.directory(base);
    if (typeof location !== 'string' || AssetBaseUrl.hasUnsafeCharacter(location)) {
      throw rejection();
    }
    // Percent-encoded dot segments ('%2e', '%2e%2e', '.%2e') are rejected
    // outright: URL parsing decodes them for dot-segment resolution, so
    // containing them anyway would only disguise an escape attempt.
    if (/%2e/i.test(location)) {
      throw rejection();
    }
    if (/^https?:\/\//i.test(location)) {
      const absolute = AssetBaseUrl.parse(location);
      if (!absolute || absolute.pathname.endsWith('/')) {
        throw rejection();
      }
      return absolute.href;
    }
    if (location.startsWith('//') || AssetBaseUrl.hasScheme(location)) {
      throw rejection();
    }
    const url = AssetBaseUrl.parse(location, baseHref);
    if (!url?.href.startsWith(baseHref) || url.pathname.endsWith('/')) {
      throw rejection();
    }
    return url.href;
  }
}
