/**
 * FrontX Template Dependency Cruiser Configuration (template-shell/, self-contained)
 *
 * Template-internal layering/isolation rules, relocated here from the
 * ecosystem monorepo root by Phase 11 template-move: MFE vertical-slice
 * isolation, screenset flux architecture, app/package boundary, and the
 * state/i18n -> framework -> react layer purity chain — all fully contained
 * within this directory. See the ecosystem root's `.dependency-cruiser.cjs`
 * for the rules that still apply to `mfes`, `gts-plugin`, `api`, `cli`,
 * `screensets`.
 */

module.exports = {
  forbidden: [
    // ============ L4 SCREENSET: ISOLATION RULES ============
    {
      name: 'no-cross-mfe-imports',
      severity: 'error',
      from: { path: '^src-app/mfe_packages/([^/]+)/' },
      to: {
        path: '^src-app/mfe_packages/[^/]+/',
        pathNot: [
          '^src-app/mfe_packages/$1/',
          '^src-app/mfe_packages/shared/',
        ],
      },
      comment: 'MFE packages must not import from other MFE packages (vertical slice isolation).',
    },
    {
      name: 'no-circular-screenset-deps',
      severity: 'warn',
      from: { path: '^src-app/screensets/([^/]+)/' },
      to: {
        path: '^src-app/screensets/$1/',
        circular: true,
      },
      comment: 'Avoid circular dependencies within screenset modules.',
    },

    // ============ L4 SCREENSET: FLUX ARCHITECTURE RULES ============
    {
      name: 'flux-no-actions-in-effects-folder',
      severity: 'error',
      from: { path: '/effects/' },
      to: { path: '/actions/' },
      comment: 'FLUX VIOLATION: Effects folder cannot import from actions folder.',
    },
    {
      name: 'flux-no-effects-in-actions-folder',
      severity: 'error',
      from: { path: '/actions/' },
      to: { path: '/effects/' },
      comment: 'FLUX VIOLATION: Actions folder cannot import from effects folder.',
    },

    // ============ TEMPLATE PACKAGE RULES ============
    {
      name: 'no-internal-package-imports',
      severity: 'error',
      from: { path: '^src-app/' },
      to: { path: '^packages/[^/]+/src/' },
      comment: 'MONOREPO VIOLATION: App cannot import package internals. Use package root exports.'
    },
    {
      name: 'sdk-no-framework-import',
      severity: 'error',
      from: { path: '^packages/(state|i18n)/' },
      to: { path: '^packages/(framework|react)/' },
      comment: 'SDK VIOLATION: SDK packages (L1) cannot import from Framework (L2) or React (L3) layers.'
    },
    {
      name: 'framework-no-react',
      severity: 'error',
      from: { path: '^packages/framework/' },
      to: { path: '^packages/react/' },
      comment: 'LAYER VIOLATION: Framework (L2) cannot import React (L3).'
    },
    {
      name: 'react-no-sdk',
      severity: 'error',
      from: { path: '^packages/react/' },
      to: { path: '^packages/(state|i18n)/' },
      comment: 'LAYER VIOLATION: React (L3) cannot import SDK (L1) directly. Use @gears-frontx/framework re-exports.'
    },
    {
      name: 'packages-no-src-app-import',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^src-app/' },
      comment: 'PACKAGE VIOLATION: Packages cannot import from app src-app/. Packages must be self-contained.'
    },
  ],
  options: {
    doNotFollow: '^node_modules',
    exclude: {
      dynamic: true,
      path: 'packages/.*/dist|node_modules',
    },
  },
};
