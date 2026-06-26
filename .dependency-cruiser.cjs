/**
 * FrontX Dependency Cruiser Configuration (Monorepo Root)
 *
 * Contains the complete dependency rules for the FrontX monorepo:
 * - Universal rules (no-circular, screenset isolation, flux architecture)
 * - Monorepo-specific package boundary rules
 *
 * Note: After Phase 11 template-move, non-Pillar-1 packages live under
 * packages/frontx-template-standard/packages/<name>/ and the root
 * application source lives under packages/frontx-template-standard/src-app/.
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
      from: { path: '^packages/frontx-template-standard/src-app/mfe_packages/([^/]+)/' },
      to: {
        path: '^packages/frontx-template-standard/src-app/mfe_packages/[^/]+/',
        pathNot: [
          '^packages/frontx-template-standard/src-app/mfe_packages/$1/',
          '^packages/frontx-template-standard/src-app/mfe_packages/shared/',
        ],
      },
      comment: 'MFE packages must not import from other MFE packages (vertical slice isolation).',
    },
    {
      name: 'no-circular-screenset-deps',
      severity: 'warn',
      from: { path: '^packages/frontx-template-standard/src-app/screensets/([^/]+)/' },
      to: {
        path: '^packages/frontx-template-standard/src-app/screensets/$1/',
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

    // ============ MONOREPO PACKAGE RULES ============
    {
      name: 'no-internal-package-imports',
      severity: 'error',
      from: { path: '^packages/frontx-template-standard/src-app/' },
      to: { path: '^packages/[^/]+/src/' },
      comment: 'MONOREPO VIOLATION: App cannot import package internals. Use package root exports.'
    },
    {
      name: 'sdk-no-framework-import',
      severity: 'error',
      from: { path: '^packages/(screensets|api)/|^packages/frontx-template-standard/packages/(state|i18n)/' },
      to: { path: '^packages/frontx-template-standard/packages/(framework|react)/' },
      comment: 'SDK VIOLATION: SDK packages (L1) cannot import from Framework (L2) or React (L3) layers.'
    },
    {
      name: 'framework-no-react',
      severity: 'error',
      from: { path: '^packages/frontx-template-standard/packages/framework/' },
      to: { path: '^packages/frontx-template-standard/packages/react/' },
      comment: 'LAYER VIOLATION: Framework (L2) cannot import React (L3).'
    },
    {
      name: 'react-no-sdk',
      severity: 'error',
      from: { path: '^packages/frontx-template-standard/packages/react/' },
      to: { path: '^packages/(screensets|api)/|^packages/frontx-template-standard/packages/(state|i18n)/' },
      comment: 'LAYER VIOLATION: React (L3) cannot import SDK (L1) directly. Use @gears-frontx/framework re-exports.'
    },
    {
      name: 'packages-no-src-import',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^packages/frontx-template-standard/src-app/' },
      comment: 'PACKAGE VIOLATION: Packages cannot import from app src-app/. Packages must be self-contained.'
    },

    // ============ @gears-frontx/mfes BOUNDARY STUBS ============
    {
      name: 'mfes-no-type-format-literals',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-type-format-literals (MFES-1) — @gears-frontx/mfes must contain no type-system-format string literals.',
    },
    {
      name: 'mfes-no-solution-shared-properties',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-solution-shared-properties (MFES-2)',
    },
    {
      name: 'mfes-no-layout-domain-values',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-layout-domain-values (MFES-3)',
    },
    {
      name: 'mfes-no-type-format-dependency',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4)',
    },
    {
      name: 'mfes-opaque-schema-surface',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-opaque-schema-surface (MFES-5)',
    },

    // ============ @gears-frontx/gts-plugin BOUNDARY STUBS ============
    {
      name: 'gts-plugin-owns-infra-schemas',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1)',
    },
    {
      name: 'gts-plugin-excludes-solution-schemas',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2)',
    },

    // ============ @gears-frontx/api BOUNDARY STUB ============
    {
      name: 'api-no-solution-content',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-api-no-solution-content (API-1)',
    },

    // ============ PILLAR-1 BOUNDARY ENFORCEMENT (Phase 10) ============

    // @cpt-begin:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-mfes-4-type-format-dep',
      severity: 'error',
      from: { path: '^packages/mfes/' },
      to: { path: '^packages/gts-plugin/|node_modules/@globaltypesystem/' },
      comment: 'cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4): @gears-frontx/mfes must declare no dependency on any concrete type-format implementation.',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-gts-plugin-1-infra-schemas',
      severity: 'error',
      from: { path: '^packages/', pathNot: '^packages/gts-plugin/' },
      to: { path: '^packages/gts-plugin/src/frontx\\.mfes/' },
      comment: 'cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1): Infrastructure schemas are owned exclusively by @gears-frontx/gts-plugin.',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-gts-plugin-2-no-solution-schemas',
      severity: 'error',
      from: { path: '^packages/gts-plugin/' },
      to: { path: '^packages/frontx-template-standard/' },
      comment: 'cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2): @gears-frontx/gts-plugin must not import solution-specific schemas.',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-api-no-solution-content:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-api-1-no-solution-content',
      severity: 'error',
      from: { path: '^packages/api/', pathNot: '__tests__' },
      to: { path: '^packages/frontx-template-standard/' },
      comment: 'cpt-frontx-constraint-api-no-solution-content (API-1): @gears-frontx/api production surface must contain no solution-specific content.',
    },
    // @cpt-end:cpt-frontx-constraint-api-no-solution-content:p10:inst-dep-cruiser-rule
  ],
  options: {
    doNotFollow: '^node_modules',
    exclude: {
      dynamic: true,
      path: 'packages/.*/dist|node_modules|packages/mfes/mfes',
    },
  },
};
