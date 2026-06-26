/**
 * FrontX Dependency Cruiser Configuration (Monorepo Root)
 *
 * This file contains the complete dependency rules for the FrontX monorepo:
 * - Standalone rules from packages/cli/template-sources/project/configs/.dependency-cruiser.cjs
 * - Monorepo-specific package boundary rules
 *
 * For standalone projects, use packages/cli/template-sources/project/configs/.dependency-cruiser.cjs
 */

const standaloneConfig = require('./packages/cli/template-sources/project/configs/.dependency-cruiser.cjs');

module.exports = {
  forbidden: [
    ...standaloneConfig.forbidden,

    // ============ MONOREPO PACKAGE RULES ============
    {
      name: 'no-internal-package-imports',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^packages/[^/]+/src/' },
      comment: 'MONOREPO VIOLATION: App cannot import package internals. Use package root exports.'
    },
    {
      name: 'sdk-no-framework-import',
      severity: 'error',
      from: { path: '^packages/(state|screensets|api|i18n)/' },
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
      to: { path: '^packages/(state|screensets|api|i18n)/' },
      comment: 'LAYER VIOLATION: React (L3) cannot import SDK (L1) directly. Use @gears-frontx/framework re-exports.'
    },
    {
      name: 'packages-no-src-import',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^src/' },
      comment: 'PACKAGE VIOLATION: Packages cannot import from app src/. Packages must be self-contained.'
    },

    // ============ @gears-frontx/mfes BOUNDARY STUBS ============
    // Full enforcement logic added in Phase 10 (pillar1-verify).
    {
      name: 'mfes-no-type-format-literals',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-type-format-literals (MFES-1) — @gears-frontx/mfes must contain no type-system-format string literals. Phase 10 adds enforcement.'
    },
    {
      name: 'mfes-no-solution-shared-properties',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-solution-shared-properties (MFES-2) — @gears-frontx/mfes must define no solution-specific shared-property identifiers. Phase 10 adds enforcement.'
    },
    {
      name: 'mfes-no-layout-domain-values',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-layout-domain-values (MFES-3) — @gears-frontx/mfes must define no specific extension-domain (layout-domain) values. Phase 10 adds enforcement.'
    },
    {
      name: 'mfes-no-type-format-dependency',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4) — @gears-frontx/mfes must declare no dependency on any concrete type-system-format implementation. Phase 10 adds enforcement.'
    },
    {
      name: 'mfes-opaque-schema-surface',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-opaque-schema-surface (MFES-5) — @gears-frontx/mfes schema surface must be opaque; format-specific shape lives in the type-system plugin. Phase 10 adds enforcement.'
    },

    // ============ @gears-frontx/gts-plugin BOUNDARY STUBS ============
    {
      name: 'gts-plugin-owns-infra-schemas',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1) — @gears-frontx/gts-plugin owns infrastructure schemas and default lifecycle instances. Phase 10 adds enforcement.'
    },
    {
      name: 'gts-plugin-excludes-solution-schemas',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2) — @gears-frontx/gts-plugin must own no solution-specific schemas. Phase 10 adds enforcement.'
    },

    // ============ @gears-frontx/api BOUNDARY STUB ============
    {
      name: 'api-no-solution-content',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-api-no-solution-content (API-1) — @gears-frontx/api must contain no solution-specific content (no concrete endpoints, auth wiring, or app-specific plugins). Phase 10 adds enforcement.'
    },

    // ============ PILLAR-1 BOUNDARY ENFORCEMENT (Phase 10) ============
    // Full enforcement for MFES-4, GTS-PLUGIN-1, GTS-PLUGIN-2, API-1.
    // MFES-1/2/3 are enforced via ESLint (no-restricted-syntax in eslint.config.js).
    // MFES-5 is enforced via scripts/test-architecture.ts (grep-based opaque surface check).

    // @cpt-begin:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-mfes-4-type-format-dep',
      severity: 'error',
      from: { path: '^packages/mfes/' },
      to: { path: '^packages/gts-plugin/|node_modules/@globaltypesystem/' },
      comment: 'cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4): @gears-frontx/mfes must declare no dependency on any concrete type-format implementation. The type-substrate port is injected at runtime, not imported at build time.',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-gts-plugin-1-infra-schemas',
      severity: 'error',
      from: { path: '^packages/', pathNot: '^packages/gts-plugin/' },
      to: { path: '^packages/gts-plugin/src/frontx\\.mfes/' },
      comment: 'cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1): Infrastructure schemas are owned exclusively by @gears-frontx/gts-plugin. Other packages must not import gts-plugin internal schema files directly; use the package root export instead.',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-gts-plugin-2-no-solution-schemas',
      severity: 'error',
      from: { path: '^packages/gts-plugin/' },
      to: { path: '^packages/frontx-template-standard/|^packages/framework/src/gts/' },
      comment: 'cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2): @gears-frontx/gts-plugin must not import solution-specific schemas. Solution schemas (theme, language, extension_screen) are owned by frontx-template-standard.',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-api-no-solution-content:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-api-1-no-solution-content',
      severity: 'error',
      from: { path: '^packages/api/', pathNot: '__tests__' },
      to: { path: '^packages/frontx-template-standard/|^packages/auth/' },
      comment: 'cpt-frontx-constraint-api-no-solution-content (API-1): @gears-frontx/api production surface must contain no solution-specific content. Mock plugins, auth wiring, and app-specific plugins belong in frontx-template-standard or application code.',
    },
    // @cpt-end:cpt-frontx-constraint-api-no-solution-content:p10:inst-dep-cruiser-rule
  ],
  options: {
    ...standaloneConfig.options,
    exclude: {
      ...standaloneConfig.options.exclude,
      path: 'packages/.*/dist|node_modules|packages/mfes/mfes'
    }
  }
};
