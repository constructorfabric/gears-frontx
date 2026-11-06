/**
 * Shared-file asset URL validation for the `./unit-format` loading path.
 *
 * Resolves a shared-file `location` (graph file, unit or pack) by the
 * same rules `MfeHandlerMF` applies to a shared `chunkPath`: an http(s)
 * absolute URL of a file, or a path resolved against the shared asset
 * base — normalized to a directory base — that stays under it and names
 * a file. Extracted from `MfeHandlerMF` unchanged so a host driving the
 * `./unit-loader` subpath applies the identical validation with no
 * hand-written URL logic (`cpt-frontx-algo-unit-format-contract-loader-surface`).
 *
 * One class per file (`runtime_style`); every member is static.
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import { DeterministicLoadFailure } from './DeterministicLoadFailure';

export class SharedAssetUrlResolver {
  protected constructor() {}

  /**
   * Resolve a shared-file `location` (graph file, unit or pack) against
   * `assetBase`. A leading '/' resolves to the origin root, not under the
   * base, so containment rejects it unless the base is the origin root.
   * Protocol-relative `//host` spellings, non-http(s) schemes,
   * backslashes, spaces/control characters, percent-encoded dot segments
   * (`%2e%2e`), and `..` escapes fail the load before any fetch
   * (SEC-001). The refusal depends only on the manifest, so it is thrown
   * as a deterministic load failure and the load is not retried.
   */
  static resolve(location: string, assetBase: string, entryId: string): string {
    const rejection = () =>
      DeterministicLoadFailure.mark(
        new MfeLoadError(
          `shared-file location "${String(location)}" is neither an http(s) ` +
            'URL of a file nor a file path that stays under the shared ' +
            'asset base location.',
          entryId,
        ),
      );
    const base = SharedAssetUrlResolver.parseUrl(assetBase);
    if (base === undefined) {
      throw rejection();
    }
    // Always a directory base: containment is a path-prefix check, so the
    // base pathname must end with '/' or '/dir-evil/' would pass a
    // '/dir/' prefix test.
    const baseHref = SharedAssetUrlResolver.asDirectoryBase(base);
    if (typeof (location as unknown) !== 'string') {
      throw rejection();
    }
    if (
      [...location].some(
        (char) => SharedAssetUrlResolver.isControlOrSpace(char) || char === '\\',
      )
    ) {
      throw rejection();
    }
    // Percent-encoded dot segments ('%2e', '%2e%2e', '.%2e') are rejected
    // outright: URL parsing decodes them for dot-segment resolution, so
    // containing them anyway would only disguise an escape attempt.
    if (/%2e/i.test(location)) {
      throw rejection();
    }
    if (/^https?:\/\//i.test(location)) {
      const absolute = SharedAssetUrlResolver.parseUrl(location);
      if (!absolute || absolute.pathname.endsWith('/')) {
        throw rejection();
      }
      return absolute.href;
    }
    if (
      location.startsWith('//') ||
      SharedAssetUrlResolver.hasUrlScheme(location)
    ) {
      throw rejection();
    }
    const url = SharedAssetUrlResolver.parseUrl(location, baseHref);
    if (!url?.href.startsWith(baseHref) || url.pathname.endsWith('/')) {
      throw rejection();
    }
    return url.href;
  }

  /** Whether `char` is a space or control character a URL parse would mangle. */
  private static isControlOrSpace(char: string): boolean {
    const code = char.charCodeAt(0);
    return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
  }

  /** `new URL(value, base)`, or `undefined` where the constructor would throw. */
  private static parseUrl(value: string, base?: string): URL | undefined {
    try {
      return new URL(value, base);
    } catch {
      return undefined;
    }
  }

  /** Whether `value` starts with a URL scheme, so it is meant as an absolute URL. */
  private static hasUrlScheme(value: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(value);
  }

  /**
   * `url` as a directory base: its pathname ends with '/', and the query
   * and hash are dropped. Only a directory base makes joining a filename
   * and URL resolution agree, and neither carries a query or hash of the
   * base into the file URL.
   */
  private static asDirectoryBase(url: URL): string {
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
    url.search = '';
    url.hash = '';
    return url.href;
  }
}
