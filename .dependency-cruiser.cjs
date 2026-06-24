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
  ],
  options: {
    ...standaloneConfig.options,
    exclude: {
      ...standaloneConfig.options.exclude,
      path: 'packages/.*/dist|node_modules'
    }
  }
};
