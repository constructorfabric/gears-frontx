/**
 * URL primitives the asset-location rules share: the handler resolves
 * `metaData.publicPath` and `metaData.sharedBase` with them and
 * `SharedAssetUrlResolver` resolves every shared-file location with them,
 * so one spelling of each rule decides both
 * (`cpt-frontx-algo-mfe-loading-manifest-discovery`, `inst-md-resolve-location`).
 *
 * One class per file (`runtime_style`); every member is static.
 *
 * @packageDocumentation
 * @internal
 */

export class AssetBaseUrl {
  protected constructor() {}

  /** `new URL(value, base)`, or `undefined` where the constructor would throw. */
  static parse(value: string, base?: string): URL | undefined {
    try {
      return new URL(value, base);
    } catch {
      return undefined;
    }
  }

  /** Whether `value` starts with a URL scheme, so it is meant as an absolute URL. */
  static hasScheme(value: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(value);
  }

  /**
   * Whether `value` carries a backslash (URL parsing reads it as '/'), a
   * space or a control character (C0, DEL or C1; URL parsing strips, drops
   * or encodes them).
   */
  static hasUnsafeCharacter(value: string): boolean {
    return [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x20 || (code >= 0x7f && code <= 0x9f) || char === '\\';
    });
  }

  /**
   * `url` as a directory base: its pathname ends with '/', and the query and
   * hash are dropped. Only a directory base makes joining a filename and URL
   * resolution agree, and neither carries a query or hash of the base into
   * the file URL.
   */
  static directory(url: URL): string {
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
    url.search = '';
    url.hash = '';
    return url.href;
  }
}
