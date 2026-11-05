/**
 * Per-package pack-fallback decision policy.
 *
 * On a realm-cache miss, `fetch_strategy` may deliver a package by its
 * whole-package `pack` instead of per-unit text when the per-unit
 * strategy does not meet the load-time budget
 * (`cpt-frontx-adr-mfe-asset-discovery`, `inst-md-pack-fallback`,
 * finding F-018). The decision is made per package BEFORE that
 * package's unit text is fetched on the attempt — never paying a failed
 * unit round trip first.
 *
 * One class per file, all members static and pure (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

export class PackFallbackPolicy {
  protected constructor() {}

  /**
   * Interim default for `MfeLoaderConfig.packFallbackBudgetMs`, matching
   * the load-time gate threshold. PROVISIONAL: the host-side measurement
   * behind this budget exists only in phase 14, which measures, sets the
   * host value, and reconciles this default (`load_time_gate` decision,
   * recorded in `out/phase-08-runtime-rebuild.md`).
   */
  static readonly DEFAULT_BUDGET_MS = 1500;

  /**
   * Decide whether `packageName` is delivered by its pack on this
   * attempt. The interim mechanism compares the budget against the
   * elapsed wall-clock of the attempt so far: a `0` budget means any
   * already-spent time exceeds it, so a declared pack is always chosen;
   * the `1500` ms default effectively keeps the per-unit strategy for
   * realistic loads until phase 14 wires a real measurement.
   *
   * Returns false when the graph file declares no pack — the fallback
   * requires a pack to exist.
   */
  static shouldUsePack(
    packDeclared: boolean,
    budgetMs: number,
    attemptElapsedMs: number,
  ): boolean {
    return packDeclared && attemptElapsedMs >= budgetMs;
  }
}
