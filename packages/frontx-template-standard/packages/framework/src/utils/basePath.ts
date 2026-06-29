// @cpt-algo:cpt-frontx-algo-framework-composition-base-path:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-app-config:p1

/**
 * Normalizes a base path to ensure consistent format.
 *
 * Rules:
 * - Empty or undefined values normalize to `/` (root)
 * - Ensures leading slash is present
 * - Removes trailing slash (except for root `/`)
 * - Root path `/` is preserved as-is
 *
 * @param base - The base path to normalize
 * @returns Normalized base path with leading slash, no trailing slash
 *
 * @example
 * ```typescript
 * normalizeBase('console')      // '/console'
 * normalizeBase('/console/')    // '/console'
 * normalizeBase('/')            // '/'
 * normalizeBase('')             // '/'
 * normalizeBase(undefined)      // '/'
 * ```
 */
// @cpt-begin:cpt-frontx-algo-framework-composition-base-path:p1:inst-1
export function normalizeBase(base?: string): string {
  if (!base) {
    return '/';
  }

  // Ensure leading slash
  let normalized = base.startsWith('/') ? base : `/${base}`;

  // Remove trailing slash unless it's root
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
// @cpt-end:cpt-frontx-algo-framework-composition-base-path:p1:inst-1

/**
 * Strips the base path from a URL pathname to get the internal path.
 *
 * Returns `null` if the pathname doesn't start with the base path or
 * if there's a partial segment match (e.g., `/app` vs `/application`).
 *
 * @param pathname - The full URL pathname to strip
 * @param base - The normalized base path to remove
 * @returns The internal path without base, or `null` if no match
 *
 * @example
 * ```typescript
 * stripBase('/console/dashboard', '/console')  // '/dashboard'
 * stripBase('/console', '/console')            // '/'
 * stripBase('/admin/users', '/console')        // null (no match)
 * stripBase('/console-admin', '/console')      // null (partial match)
 * stripBase('/dashboard', '/')                 // '/dashboard' (root base)
 * ```
 */
// @cpt-begin:cpt-frontx-algo-framework-composition-base-path:p1:inst-2
export function stripBase(pathname: string, base: string): string | null {
  // Root base matches all paths
  if (base === '/') {
    return pathname;
  }

  // Case-sensitive match (standard URL behavior)
  if (!pathname.startsWith(base)) {
    return null;
  }

  // Verify full segment match to avoid partial matches
  // e.g., base='/app' should match '/app/dashboard' but not '/application'
  const nextChar = pathname.charAt(base.length);
  if (nextChar && nextChar !== '/') {
    return null;
  }

  // Return path without base, or '/' if exact match
  return pathname.slice(base.length) || '/';
}
// @cpt-end:cpt-frontx-algo-framework-composition-base-path:p1:inst-2

/**
 * Prepends the base path to an internal path for URL construction.
 *
 * @param path - The internal path (can be with or without leading slash)
 * @param base - The normalized base path to prepend
 * @returns The full path with base prepended
 *
 * @example
 * ```typescript
 * prependBase('/dashboard', '/console')  // '/console/dashboard'
 * prependBase('dashboard', '/console')   // '/console/dashboard'
 * prependBase('/dashboard', '/')         // '/dashboard'
 * prependBase('/', '/console')           // '/console/'
 * ```
 */
export function prependBase(path: string, base: string): string {
  // Root base returns path as-is
  if (base === '/') {
    return path;
  }

  // Ensure path has leading slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${base}${cleanPath}`;
}

/**
 * Resolves the final base path from configuration sources with fallback chain.
 *
 * Priority order:
 * 1. Plugin-level configuration
 * 2. App-level configuration
 * 3. Default root `/`
 *
 * @param pluginConfig - Optional plugin-level configuration
 * @param appConfig - Optional app-level configuration
 * @returns Normalized base path
 *
 * @example
 * ```typescript
 * // Plugin config takes precedence
 * resolveBase({ base: '/app' }, { base: '/console' })  // '/app'
 *
 * // Falls back to app config
 * resolveBase(undefined, { base: '/console' })         // '/console'
 *
 * // Falls back to root
 * resolveBase(undefined, undefined)                    // '/'
 * ```
 */
export function resolveBase(
  pluginConfig?: { base?: string },
  appConfig?: { base?: string }
): string {
  const rawBase = pluginConfig?.base ?? appConfig?.base ?? '/';
  return normalizeBase(rawBase);
}
