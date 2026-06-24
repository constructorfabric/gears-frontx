/**
 * FrontX ESLint Configuration (Monorepo Root)
 *
 * This file contains the complete ESLint rules for the FrontX monorepo:
 * - Standalone rules from packages/cli/template-sources/project/configs/eslint.config.js
 * - Monorepo-specific package boundary rules
 * - SDK/Framework package exceptions (unknown type is required for generic code)
 *
 * For standalone projects, use packages/cli/template-sources/project/configs/eslint.config.js
 */

import standaloneConfig from './packages/cli/template-sources/project/configs/eslint.config.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Include all standalone configs
  ...standaloneConfig,

  // Additional monorepo ignores
  {
    ignores: [
      'packages/**/dist/**',
      '**/dist/**', // All dist directories are build artifacts
      '**/*.__mf__temp/**', // Module Federation generated temp files
      '**/.__mf__temp/**', // Module Federation generated temp files (dot-prefixed)
      'packages/**/templates/**', // CLI templates are build artifacts
      'packages/cli/template-sources/**', // CLI template sources (linted separately in standalone)
      'scripts/**', // Monorepo scripts
      '**/.vitepress/**',
      // Legacy config files (still used by dependency-cruiser)
      '.dependency-cruiser.cjs',
      '.husky/**',
      '.artifacts/**', // Sandbox artifacts (gitignored)
      '.agents/**', // Agent infrastructure (gitignored)
    ],
  },

  // Monorepo-specific: Package internals and @/ aliases (catch-all for packages without layer-specific rules)
  // This block must appear BEFORE layer-specific blocks so they can override it
  {
    files: ['packages/**/*'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages. @/ aliases are only for app code (src/).',
            },
          ],
        },
      ],
    },
  },

  // SDK foundation: @gears-frontx/mfes — the port-contract package.
  // Allow unknown/object types (TypeSystemPlugin uses TSchema=unknown and entity:unknown).
  // mfes is the lowest-level SDK package; it cannot import any other @gears-frontx package.
  {
    files: ['packages/mfes/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/*'],
              message:
                'SDK VIOLATION: @gears-frontx/mfes is the SDK foundation and cannot import other @gears-frontx packages.',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message:
                'SDK VIOLATION: SDK packages cannot import React.',
            },
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages.',
            },
          ],
        },
      ],
    },
  },

  // SDK packages: Allow unknown/object types (required for generic event bus, store, etc.)
  // These packages use generics and need flexible typing for consumer code to augment
  // Layer enforcement: SDK packages cannot import other @gears-frontx packages or React,
  //   EXCEPT @gears-frontx/mfes which is the extracted port-contract foundation.
  {
    files: [
      'packages/state/**/*.ts',
      'packages/api/**/*.ts',
      'packages/i18n/**/*.ts',
      'packages/screensets/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/!(mfes)', '@gears-frontx/!(mfes)/*'],
              message:
                'SDK VIOLATION: SDK packages cannot import other @gears-frontx packages (except @gears-frontx/mfes).',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message:
                'SDK VIOLATION: SDK packages cannot import React.',
            },
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages.',
            },
          ],
        },
      ],
    },
  },

  // Framework package: Allow unknown/object types (wraps SDK with plugin architecture)
  // Layer enforcement: Framework cannot import @gears-frontx/react or React
  // BUT keep Flux rules for effects files
  {
    files: ['packages/framework/**/*.ts'],
    ignores: ['**/effects.ts', '**/*Effects.ts', '**/effects/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/react', '@gears-frontx/react/*'],
              message:
                'FRAMEWORK VIOLATION: Framework cannot import @gears-frontx/react (circular dependency).',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message:
                'FRAMEWORK VIOLATION: Framework cannot import React.',
            },
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages.',
            },
          ],
        },
      ],
    },
  },

  // Framework effects: Keep Flux rules with layer enforcement
  {
    files: ['packages/framework/**/effects.ts', 'packages/framework/**/*Effects.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/react', '@gears-frontx/react/*'],
              message:
                'FRAMEWORK VIOLATION: Framework cannot import @gears-frontx/react (circular dependency).',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message:
                'FRAMEWORK VIOLATION: Framework cannot import React.',
            },
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages.',
            },
          ],
        },
      ],
      // Keep no-restricted-syntax (enforced by frameworkConfig Flux rules)
    },
  },

  // Framework action files in effects directory: Allow event emission with layer enforcement
  {
    files: [
      'packages/framework/**/effects/**/*Actions.ts',
      'packages/framework/**/effects/*Actions.ts',
      'packages/framework/**/effects/**/actions.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off', // Actions emit events as their primary purpose
      'no-restricted-imports': 'off', // Action files may import from slices for direct coordination
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/react', '@gears-frontx/react/*'],
              message:
                'FRAMEWORK VIOLATION: Framework cannot import @gears-frontx/react (circular dependency).',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message:
                'FRAMEWORK VIOLATION: Framework cannot import React.',
            },
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages.',
            },
          ],
        },
      ],
    },
  },

  // React package: Allow unknown types for hook generics
  // Layer enforcement: React must import from @gears-frontx/framework, not SDK packages directly
  {
    files: ['packages/react/**/*.ts', 'packages/react/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-empty-object-type': 'off', // Allow empty EventPayloadMap for module augmentation
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/state', '@gears-frontx/state/*'],
              message:
                'REACT VIOLATION: Import from @gears-frontx/framework instead.',
            },
            {
              group: ['@gears-frontx/screensets', '@gears-frontx/screensets/*'],
              message:
                'REACT VIOLATION: Import from @gears-frontx/framework instead.',
            },
            {
              group: ['@gears-frontx/api', '@gears-frontx/api/*'],
              message:
                'REACT VIOLATION: Import from @gears-frontx/framework instead.',
            },
            {
              group: ['@gears-frontx/i18n', '@gears-frontx/i18n/*'],
              message:
                'REACT VIOLATION: Import from @gears-frontx/framework instead.',
            },
            {
              group: ['@gears-frontx/*/src/**'],
              message:
                'MONOREPO VIOLATION: Import from package root, not internal paths.',
            },
            {
              group: ['@/*'],
              message:
                'PACKAGE VIOLATION: Use relative imports within packages.',
            },
          ],
        },
      ],
    },
  },

  // ============ @gears-frontx/mfes BOUNDARY STUBS ============
  // STUB: cpt-frontx-constraint-mfes-no-type-format-literals (MFES-1),
  //       cpt-frontx-constraint-mfes-no-solution-shared-properties (MFES-2),
  //       cpt-frontx-constraint-mfes-no-layout-domain-values (MFES-3),
  //       cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4),
  //       cpt-frontx-constraint-mfes-opaque-schema-surface (MFES-5)
  // Full enforcement rules added in Phase 10 (pillar1-verify).
  {
    files: ['packages/mfes/**/*.ts', 'packages/mfes/**/*.tsx'],
    rules: {
      // Boundary enforcement for @gears-frontx/mfes will be added here in Phase 10.
    },
  },

  // ============ @gears-frontx/gts-plugin BOUNDARY STUBS ============
  // STUB: cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1),
  //       cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2)
  // Full enforcement rules added in Phase 10 (pillar1-verify).
  {
    files: ['packages/gts-plugin/**/*.ts', 'packages/gts-plugin/**/*.tsx'],
    rules: {
      // Boundary enforcement for @gears-frontx/gts-plugin will be added here in Phase 10.
    },
  },

  // ============ @gears-frontx/api BOUNDARY STUB ============
  // STUB: cpt-frontx-constraint-api-no-solution-content (API-1)
  // Full enforcement rules added in Phase 10 (pillar1-verify).
  {
    files: ['packages/api/**/*.ts', 'packages/api/**/*.tsx'],
    rules: {
      // Boundary enforcement for @gears-frontx/api will be added here in Phase 10.
    },
  },

  // CLI package: Allow unknown types for dynamic command handling
  // Inherits monorepo boundary enforcement from catch-all block
  {
    files: ['packages/cli/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Layout components: Allow unknown types for API registry type assertions
  {
    files: ['src/layout/**/*.tsx', 'src/layout/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Keep flux/lodash rules but remove TSUnknownKeyword restriction
        {
          selector: "CallExpression[callee.name='dispatch'] > MemberExpression[object.name='store']",
          message: 'FLUX VIOLATION: Components must not call store.dispatch directly. Use actions instead.',
        },
      ],
    },
  },

  // MFE packages: Each MFE is fully self-contained — no imports from host or other MFEs
  {
    files: ['src/mfe_packages/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../app/*', '../../app/**'],
              message:
                'MFE VIOLATION: MFE packages cannot import from the host app. MFEs must be self-contained.',
            },
            {
              group: ['../*-mfe/*', '../*-mfe/**', '../_*/*', '../_*/**'],
              message:
                'MFE VIOLATION: MFE packages cannot import from other MFE packages. Each MFE must be self-contained.',
            },
          ],
        },
      ],
    },
  },

  // App: Layer enforcement for src/app/** (must use @gears-frontx/react, not L1/L2 packages)
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      // Use @typescript-eslint rule to catch TypeScript-specific imports (import type, side-effect imports)
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/framework', '@gears-frontx/framework/*'],
              message:
                'LAYER VIOLATION: App-layer code must import from @gears-frontx/react, not directly from @gears-frontx/framework (Layer 2).',
            },
            {
              group: ['@gears-frontx/state', '@gears-frontx/state/*'],
              message:
                'LAYER VIOLATION: App-layer code must import from @gears-frontx/react, not directly from @gears-frontx/state (Layer 1).',
            },
            {
              group: ['@gears-frontx/api', '@gears-frontx/api/*'],
              message:
                'LAYER VIOLATION: App-layer code must import from @gears-frontx/react, not directly from @gears-frontx/api (Layer 1).',
            },
            {
              group: ['@gears-frontx/i18n', '@gears-frontx/i18n/*'],
              message:
                'LAYER VIOLATION: App-layer code must import from @gears-frontx/react, not directly from @gears-frontx/i18n (Layer 1).',
            },
            {
              group: ['@gears-frontx/screensets', '@gears-frontx/screensets/*'],
              message:
                'LAYER VIOLATION: App-layer code must import from @gears-frontx/react, not directly from @gears-frontx/screensets (Layer 1).',
            },
            // Redux term bans - use FrontX state terms instead
            {
              group: ['react-redux'],
              importNames: ['useDispatch'],
              message:
                'REDUX VIOLATION: Do not use useDispatch from react-redux. Use useAppDispatch from @gears-frontx/react instead.',
            },
            {
              group: ['react-redux'],
              importNames: ['useSelector'],
              message:
                'REDUX VIOLATION: Do not use useSelector from react-redux. Use useAppSelector from @gears-frontx/react instead.',
            },
          ],
        },
      ],
    },
  },

  // App: Studio should only be imported via FrontXProvider (auto-detection)
  // Only App.tsx variants are allowed to import StudioOverlay directly
  {
    files: ['src/**/*'],
    ignores: [
      'src/app/App.tsx', // Monorepo demo app - renders StudioOverlay
      'src/app/App.no-uikit.tsx', // --uikit none variant - renders StudioOverlay
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/studio', '@gears-frontx/studio/**'],
              message:
                'STUDIO VIOLATION: Studio should not be imported directly in app code. FrontXProvider auto-detects and loads Studio in development mode.',
            },
          ],
        },
      ],
    },
  },

  // Studio: Exclude from inline styles rule (dev-only package with intentional glassmorphic effects)
  {
    files: ['packages/studio/**/*.tsx'],
    rules: {
      'local/no-inline-styles': 'off',
    },
  },

  // Monorepo: uicore components must also follow flux rules (no direct slice dispatch)
  {
    files: [
      'packages/uicore/src/components/**/*.tsx',
      'packages/uicore/src/layout/domains/**/*.tsx',
    ],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='dispatch'] CallExpression[callee.name=/^set[A-Z]/]",
          message:
            'FLUX VIOLATION: Components cannot call slice reducers (setXxx functions). Use actions from /actions/ instead.',
        },
        {
          selector:
            "CallExpression[callee.name='dispatch'] CallExpression[callee.object.name][callee.property.name]",
          message:
            'FLUX VIOLATION: Do not dispatch slice actions directly. Use event-emitting actions instead. See EVENTS.md.',
        },
        {
          selector:
            "CallExpression[callee.object.name=/Store$/][callee.property.name!='getState']",
          message:
            'FLUX VIOLATION: Components cannot call custom store methods directly. Use Redux actions and useSelector.',
        },
      ],
    },
  },

  // App: Domain-based architecture rules for actions/effects
  {
    files: ['src/app/actions/**/*', 'src/app/effects/**/*'],
    rules: {
      'local/no-barrel-exports-events-effects': 'error',
    },
  },

  // App: Prevent coordinator effect anti-pattern in effects
  {
    files: ['src/app/effects/**/*'],
    rules: {
      'local/no-coordinator-effects': 'error',
    },
  },

  // App: Domain event format for events
  {
    files: ['src/app/events/**/*'],
    rules: {
      'local/domain-event-format': 'error',
    },
  },

  // Trust kernel: files excluded from Codacy security scanning must satisfy
  // strict safety guardrails (required JSDoc `@safety-reviewed` / `@why`
  // tags on every export, no module-level state, no unsafe imports).
  // Adding a file here requires coordinated update to `.codacy.yaml`.
  {
    files: ['packages/screensets/src/mfe/handler/mf-dynamic-module-ops.ts'],
    rules: {
      'local/trusted-patterns-file': 'error',
    },
  },
];
