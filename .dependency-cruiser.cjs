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
  ],
  options: {
    ...standaloneConfig.options,
    exclude: {
      ...standaloneConfig.options.exclude,
      path: 'packages/.*/dist|node_modules'
    }
  }
};
