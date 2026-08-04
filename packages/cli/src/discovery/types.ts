/**
 * F16 cross-package edge (F16 <- F10): the CLI's install path signals the AI
 * Tooling Framework that an installed template is present, so it can run
 * its extension-discovery scan. The CLI has zero compile-time dependency on
 * the AI Tooling Framework's kit package (CLI-1 spirit) — the hook is
 * injected by the caller, exactly like `FetchFn` is injected into the
 * resolver, so the CLI's install path stays agnostic of what (if anything)
 * discovers extensions.
 */

export interface DiscoveryHookContext {
  /** The installed template's name, as recorded in the inventory. */
  name: string;
  /** The installed template's pinned version ref. */
  ref: string;
}

export interface DiscoveryHookResult {
  /** True when the discovery hook actually ran a scan for this install. */
  triggered: boolean;
  /** Number of structural errors the discovery scan reported, if triggered. */
  errorCount?: number;
}

/** Injectable signal: "an installed template is present, discover its AI extensions." */
export type ExtensionDiscoveryHook = (
  context: DiscoveryHookContext,
) => Promise<DiscoveryHookResult> | DiscoveryHookResult;
