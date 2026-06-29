/**
 * @gears-frontx/screensets - Type Definitions
 *
 * Pure TypeScript contracts for FrontX MFE (Microfrontend) management.
 * This package has ZERO dependencies - pure types and contracts only.
 *
 * NOTE: Layout state shapes (HeaderState, MenuState, etc.) are in @gears-frontx/framework
 */

// ============================================================================
// Layout Domain Enum
// ============================================================================

// @cpt-constraint:cpt-frontx-constraint-mfes-no-layout-domain-values (MFES-3)
// LayoutDomain relocated to @gears-frontx/frontx-template-standard in Phase 7.
// Re-exported here for backward compatibility.
export { LayoutDomain } from '@gears-frontx/frontx-template-standard';
