/**
 * FrontX ESLint Configuration (Monorepo Root)
 *
 * After Phase 11 template-move, packages/cli is deleted.
 * Standalone rules are now inlined directly. Non-Pillar-1 packages live under
 * packages/frontx-template-standard/packages/<name>/ and app source at
 * packages/frontx-template-standard/src-app/.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      '**/.__mf__temp/**',
      '**/coverage/**',
      'node_modules/**',
      '*.config.*',
      '**/*.config.*',
      '**/*.cjs',
      'scripts/**',
    ],
  },

  // Base JS + TypeScript
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // L0 BASE: Universal rules for all TS/TSX files
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      'prefer-const': 'error',
      'no-console': 'off',
      'no-var': 'error',
      'no-empty-pattern': 'error',
    },
  },

  // React hooks
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, 'react-hooks/exhaustive-deps': 'error' },
  },

  // Additional monorepo ignores
  {
    ignores: [
      'packages/**/dist/**',
      '**/dist/**', // All dist directories are build artifacts
      '**/*.__mf__temp/**', // Module Federation generated temp files
      '**/.__mf__temp/**', // Module Federation generated temp files (dot-prefixed)
      'packages/**/templates/**',
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
      'packages/frontx-template-standard/packages/state/**/*.ts',
      'packages/api/**/*.ts',
      'packages/frontx-template-standard/packages/i18n/**/*.ts',
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
    files: ['packages/frontx-template-standard/packages/framework/**/*.ts'],
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
    files: ['packages/frontx-template-standard/packages/framework/**/effects.ts', 'packages/frontx-template-standard/packages/framework/**/*Effects.ts'],
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
      'packages/frontx-template-standard/packages/framework/**/effects/**/*Actions.ts',
      'packages/frontx-template-standard/packages/framework/**/effects/*Actions.ts',
      'packages/frontx-template-standard/packages/framework/**/effects/**/actions.ts',
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
    files: ['packages/frontx-template-standard/packages/react/**/*.ts', 'packages/frontx-template-standard/packages/react/**/*.tsx'],
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

  // ============ @gears-frontx/mfes BOUNDARY ENFORCEMENT (Phase 10) ============
  // MFES-1/2/3 enforced here via no-restricted-syntax denylist.
  // MFES-4 enforced via dep-cruiser rule frontx-mfes-4-type-format-dep (.dependency-cruiser.cjs).
  // MFES-5 enforced via scripts/test-architecture.ts (opaque schema surface grep check).
  {
    files: ['packages/mfes/**/*.ts', 'packages/mfes/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // @cpt-begin:cpt-frontx-constraint-mfes-no-type-format-literals:p10:inst-eslint-rule
        {
          selector:
            "Literal[value=/gts\\.(frontx\\.(screensets|framework|state|i18n|react)|[a-z]+\\.(screensets|framework|state|i18n))/]",
          message:
            'MFES-1 VIOLATION (cpt-frontx-constraint-mfes-no-type-format-literals): @gears-frontx/mfes must not contain type-system-format string literals from solution namespaces. These belong in the type-system plugin or consumer packages.',
        },
        // @cpt-end:cpt-frontx-constraint-mfes-no-type-format-literals:p10:inst-eslint-rule
        // @cpt-begin:cpt-frontx-constraint-mfes-no-solution-shared-properties:p10:inst-eslint-rule
        {
          selector: "Literal[value=/^(theme|language)$/]",
          message:
            'MFES-2 VIOLATION (cpt-frontx-constraint-mfes-no-solution-shared-properties): @gears-frontx/mfes must not define solution-specific shared-property identifiers (e.g. theme, language). Supply these via the application layer or templates.',
        },
        // @cpt-end:cpt-frontx-constraint-mfes-no-solution-shared-properties:p10:inst-eslint-rule
        // @cpt-begin:cpt-frontx-constraint-mfes-no-layout-domain-values:p10:inst-eslint-rule
        {
          selector: "Literal[value=/^(header|footer|menu|sidebar|popup|overlay|screen)$/]",
          message:
            'MFES-3 VIOLATION (cpt-frontx-constraint-mfes-no-layout-domain-values): @gears-frontx/mfes must not define specific extension-domain (layout-domain) values. These are solution vocabulary owned by frontx-template-standard (LayoutDomain enum).',
        },
        // @cpt-end:cpt-frontx-constraint-mfes-no-layout-domain-values:p10:inst-eslint-rule
      ],
    },
  },

  // ============ @gears-frontx/gts-plugin ============
  // GTS-PLUGIN-1/2 are enforced via dep-cruiser rules frontx-gts-plugin-1/2 (.dependency-cruiser.cjs).
  // Allow unknown/object types: gts-plugin owns JSONSchema (requires [key: string]: unknown)
  // and implements TypeSystemPlugin.register(entity: unknown) — all architecturally required.
  {
    files: ['packages/gts-plugin/**/*.ts', 'packages/gts-plugin/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // ============ @gears-frontx/api BOUNDARY ============
  // API-1 enforced via dep-cruiser rule frontx-api-1-no-solution-content (.dependency-cruiser.cjs).
  // (no ESLint-level changes needed for api boundary enforcement)

  // ============ @gears-frontx/frontx-template-standard ============
  // Allow unknown/object types: build utilities (mf-gts.ts AST transforms, lazy-import-transform)
  // use unknown for dynamic module shapes and generic AST node types — architecturally required.
  {
    files: ['packages/frontx-template-standard/**/*.ts', 'packages/frontx-template-standard/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
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
    files: ['packages/frontx-template-standard/src-app/layout/**/*.tsx', 'packages/frontx-template-standard/src-app/layout/**/*.ts'],
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
    files: ['packages/frontx-template-standard/src-app/mfe_packages/**/*.{ts,tsx}'],
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
    files: ['packages/frontx-template-standard/src-app/app/**/*.{ts,tsx}'],
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
    files: ['packages/frontx-template-standard/src-app/**/*'],
    ignores: [
      'packages/frontx-template-standard/src-app/app/App.tsx', // Monorepo demo app - renders StudioOverlay
      'packages/frontx-template-standard/src-app/app/App.no-uikit.tsx', // --uikit none variant - renders StudioOverlay
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

];
