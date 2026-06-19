/**
 * HAI3 Dependency Cruiser Configuration (Standalone)
 * Base rules for HAI3 projects - screenset isolation and flux architecture
 *
 * This is a SELF-CONTAINED configuration that includes all rules inline.
 * It does NOT depend on @gears-frontx/depcruise-config (which is monorepo-only internal tooling).
 *
 * Rules included:
 * - L0 Base: Universal rules (no-circular)
 * - L4 Screenset: Screenset isolation and flux architecture rules
 *
 * This is the single source of truth for standalone project dependency rules.
 * - CLI copies this to new projects via copy-templates.ts
 *
 * Note: Uses $1, $2 for backreferences (not \1, \2) per dependency-cruiser docs
 */

module.exports = {
  forbidden: [
    // ============ L0 BASE: UNIVERSAL RULES ============
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^(?!.*node_modules)' },
      to: { circular: true },
      comment: 'Circular dependencies create tight coupling and make code harder to reason about.',
    },

    // ============ L4 SCREENSET: ISOLATION RULES ============
    {
      name: 'no-cross-mfe-imports',
      severity: 'error',
      from: { path: '^src/mfe_packages/([^/]+)/' },
      to: {
        path: '^src/mfe_packages/[^/]+/',
        pathNot: ['^src/mfe_packages/$1/', '^src/mfe_packages/shared/'],
      },
      comment: 'MFE packages must not import from other MFE packages (vertical slice isolation). Each MFE is self-contained. Exception: src/mfe_packages/shared/ contains build-time utilities (e.g., Vite plugins) shared across all MFE packages.',
    },
    {
      name: 'no-circular-screenset-deps',
      severity: 'warn',
      from: { path: '^src/screensets/([^/]+)/' },
      to: {
        path: '^src/screensets/$1/',
        circular: true,
      },
      comment: 'Avoid circular dependencies within screenset modules. May indicate tight coupling.',
    },

    // ============ L4 SCREENSET: FLUX ARCHITECTURE RULES ============
    {
      name: 'flux-no-actions-in-effects-folder',
      severity: 'error',
      from: { path: '/effects/' },
      to: { path: '/actions/' },
      comment: 'FLUX VIOLATION: Effects folder cannot import from actions folder (circular flow risk). See EVENTS.md.',
    },
    {
      name: 'flux-no-effects-in-actions-folder',
      severity: 'error',
      from: { path: '/actions/' },
      to: { path: '/effects/' },
      comment: 'FLUX VIOLATION: Actions folder cannot import from effects folder. Use event bus. See EVENTS.md.',
    },
  ],
  options: {
    doNotFollow: '^node_modules',
    exclude: {
      dynamic: true,
    },
  },
};
