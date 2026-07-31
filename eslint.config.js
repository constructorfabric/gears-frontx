/**
 * FrontX ESLint Configuration (Ecosystem Root)
 *
 * Covers ONLY the ecosystem packages (mfes, gts-plugin, api, cli,
 * cyber-pilot-kit-frontx).
 * Non-Pillar-1 packages (state, i18n, framework, react, auth, studio) and the
 * host app now live in the self-contained top-level `template-shell/`
 * (see Phase 11 template-move; split from its MFE content into the sibling
 * `template-mfe/` in issue #470); it ships its own `eslint.config.js`. Both
 * `template-shell/` and `template-mfe/` are excluded from this config's
 * scope below.
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
      // Disposable Claude Code agent worktrees — full repo checkouts that
      // should never be linted as part of this repo's own source tree.
      '.claude/**',
      // Constructor Studio vendored/generated runtime — kit-managed tool
      // internals (e.g. bundled browser-side assets), not this repo's own
      // source. Regenerated via `cfs update`/`cfs generate-agents`.
      '.cf-studio/.core/**',
      '.cf-studio/.gen/**',
      // Disposable seed-test scratch — generated template output produced by
      // the offline-seed e2e procedure; not this repo's own source.
      'seeded-test/**',
      '.seed-test-inventory/**',
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
      'template-shell/**', // Self-contained template; ships its own eslint.config.js
      'template-mfe/**', // MFE content extracted from template-shell (issue #470); linted as part of the assembled shell+mfe tree, not from this ecosystem root
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
      'packages/api/**/*.ts',
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

  // @gears-frontx/telemetry: standalone browser SDK — no intra-ecosystem edge, no React.
  // dep-cruiser cannot see this edge: options.exclude.path drops packages/*/dist and every
  // workspace import resolves there, so this block is the gate that catches it.
  // Scoped to src/ to match the two dep-cruiser rules; demo/ consumes the package by name.
  {
    files: ['packages/telemetry/src/**/*.ts', 'packages/telemetry/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/*', '@gears-frontx/*/*'],
              message:
                'SDK VIOLATION: @gears-frontx/telemetry holds no intra-ecosystem package dependency.',
            },
            {
              group: ['react', 'react-dom', 'react-dom/*', 'react/*'],
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

  // The hook signature is variadic so a handler of any shape stays assignable, and the record
  // carries consumer-supplied user data.
  // TODO: type both against a generic payload and drop this block; follow-up PR.
  {
    files: [
      'packages/telemetry/src/utils/hooks.ts',
      'packages/telemetry/src/utils/eventTypes.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // The envelope builders rewrite each record field in place to match the collector's wire format,
  // and the hooks manager dispatches a variadic tuple through a key-indexed handler map.
  // TODO: build the envelope into a fresh typed object and drop this block; follow-up PR.
  {
    files: [
      'packages/telemetry/src/managers/events.ts',
      'packages/telemetry/src/managers/hooks.ts',
    ],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
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
            'MFES-3 VIOLATION (cpt-frontx-constraint-mfes-no-layout-domain-values): @gears-frontx/mfes must not define specific extension-domain (layout-domain) values. These are solution vocabulary owned by frontx-template-shell (LayoutDomain enum).',
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

  // CLI package: Allow unknown types for dynamic command handling
  // Inherits monorepo boundary enforcement from catch-all block
  {
    files: ['packages/cli/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
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
            'FLUX VIOLATION: Do not dispatch slice actions directly. Use event-emitting actions instead.',
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
