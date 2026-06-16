/**
 * FrontX ESLint Configuration (Standalone)
 * Base rules for FrontX projects - screenset architecture and flux pattern
 *
 * This is a SELF-CONTAINED configuration that includes all rules inline.
 * It does NOT depend on @gears-frontx/eslint-config (which is monorepo-only internal tooling).
 *
 * Rules included:
 * - L0 Base: Universal rules (no-any, unused-imports, prefer-const, etc.)
 * - L4 Screenset: Flux architecture, screenset isolation, domain-based rules
 *
 * This is the single source of truth for standalone project ESLint rules.
 * - CLI copies this to new projects via copy-templates.ts
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { createRequire } from 'module';

// Local plugin uses CommonJS, need to require it
// eslint-plugin-local is in project/ (sibling to configs/)
const localPlugin = createRequire(import.meta.url)('../eslint-plugin-local');

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      'dist/**',
      '**/dist/**',                     // MFE-package build output
      '**/.__mf__temp/**',              // Module Federation Vite plugin temp dir
      '**/coverage/**',
      'node_modules/**',
      '*.config.*',
      '**/*.config.*',                  // sub-package vite/vitest configs
      '**/*.cjs',
      'scripts/**',
      'eslint-plugin-local/**', // ESLint plugin is CommonJS, has its own linting
    ],
  },

  // Base JS config
  js.configs.recommended,

  // TypeScript config
  ...tseslint.configs.recommended,

  // ==== L0 BASE: Universal rules for all TS/TSX files ====
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
      // Unused detection
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

      // Type safety - strict typing required
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': true,
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      // Ban loose types - use concrete types instead (typescript-eslint v8+ rules)
      '@typescript-eslint/no-empty-object-type': 'error', // Disallows {}
      '@typescript-eslint/no-unsafe-function-type': 'error', // Disallows Function
      '@typescript-eslint/no-wrapper-object-types': 'error', // Disallows Object, String, Number, etc.
      // Code quality
      'prefer-const': 'error',
      'no-console': 'off',
      'no-var': 'error',
      'no-empty-pattern': 'error',

      // Layer Architecture Enforcement
      // App-layer projects must only import from @gears-frontx/react (Layer 3), not from L1/L2 packages
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
            // TanStack Query - use HAI3 wrappers instead
            {
              group: ['@tanstack/react-query'],
              message:
                'QUERY VIOLATION: Do not import from @tanstack/react-query directly. ' +
                'Use useApiQuery, useApiMutation, useApiStream, or useQueryCache from @gears-frontx/react. ' +
                'HAI3Provider already includes QueryClientProvider.',
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

  // Terminology: Ban 'reducer' in user-defined identifiers (allow .reducer property access)
  {
    files: ['src/app/**/*', 'src/screensets/**/*'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "VariableDeclarator > Identifier[name=/[Rr]educer/]",
          message:
            'TERMINOLOGY: Use "slice" instead of "reducer" in HAI3 applications. Example: const userSlice = createSlice(...)',
        },
        {
          selector: "FunctionDeclaration > Identifier[name=/[Rr]educer/]",
          message:
            'TERMINOLOGY: Use "slice" instead of "reducer" in HAI3 applications. Example: function createUserSlice()',
        },
      ],
    },
  },

  // ==== L4 SCREENSET: React hooks + Flux architecture + Domain rules ====
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      local: localPlugin,
    },
    linterOptions: {
      noInlineConfig: true,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',

      // Screenset Architecture: Domain-based conventions (disabled globally, enabled for screensets)
      'local/no-barrel-exports-events-effects': 'off',
      'local/no-coordinator-effects': 'off',
      'local/no-missing-domain-id': 'off',
      'local/domain-event-format': 'off',
      'local/no-inline-styles': 'error',
      'local/uikit-no-business-logic': 'off',
      'local/screen-inline-components': 'off',
      'local/no-direct-tanstack-hooks': 'off',
      'local/no-manual-query-keys': 'off',
      'local/no-gts-id-manipulation': 'error',

      // Type safety: Discourage loose types
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSUnknownKeyword',
          message:
            'TYPE VIOLATION: Avoid using `unknown` type. Define a concrete interface or type instead.',
        },
        {
          selector: 'TSObjectKeyword',
          message:
            'TYPE VIOLATION: Avoid using `object` type. Use a concrete interface or Record<string, T> instead.',
        },
        // Flux Architecture: No direct store.dispatch
        {
          selector:
            "CallExpression[callee.name='dispatch'] > MemberExpression[object.name='store']",
          message:
            'FLUX VIOLATION: Components must not call store.dispatch directly. Use actions instead. See EVENTS.md.',
        },
        // Lodash enforcement
        {
          selector: "CallExpression[callee.property.name='trim']",
          message:
            "LODASH VIOLATION: Use lodash trim() instead of native .trim(). Import { trim } from 'lodash'.",
        },
        {
          selector: "CallExpression[callee.property.name='charAt']",
          message:
            'LODASH VIOLATION: Use lodash string methods instead of native .charAt().',
        },
        {
          selector: "CallExpression[callee.property.name='substring']",
          message:
            'LODASH VIOLATION: Use lodash truncate() or other string methods instead of native .substring().',
        },
        {
          selector: "CallExpression[callee.property.name='toUpperCase']",
          message:
            'LODASH VIOLATION: Use lodash upperCase() or upperFirst() instead of native .toUpperCase().',
        },
        {
          selector: "CallExpression[callee.property.name='toLowerCase']",
          message:
            'LODASH VIOLATION: Use lodash lowerCase() or lowerFirst() instead of native .toLowerCase().',
        },
      ],
    },
  },

  // Screensets: Domain-based architecture rules
  {
    files: ['src/screensets/**/*'],
    rules: {
      'local/no-barrel-exports-events-effects': 'error',
      'local/no-coordinator-effects': 'error',
      'local/no-missing-domain-id': 'error',
      'local/domain-event-format': 'error',
    },
  },

  // GTS format parsing is the authorized responsibility of the GTS module
  {
    files: ['**/mfe/gts/**/*.{ts,tsx}'],
    rules: {
      'local/no-gts-id-manipulation': 'off',
    },
  },

  // Tests construct fixture IDs — format manipulation is acceptable in test code
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'local/no-gts-id-manipulation': 'off',
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

  // UI components: Presentational components only (no @gears-frontx/react business logic)
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/mfe_packages/*/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'local/uikit-no-business-logic': 'error',
    },
  },

  // Screens: Detect inline component definitions
  {
    files: ['src/screensets/**/screens/**/*Screen.tsx'],
    rules: {
      'local/screen-inline-components': 'error',
    },
  },

  // Data Layer: Enforce HAI3 query wrappers (no direct TanStack hooks or manual cache keys)
  {
    files: [
      'src/screensets/**/*.{ts,tsx}',
      'src/app/**/*.{ts,tsx}',
      'src/mfe_packages/*/src/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'local/no-direct-tanstack-hooks': 'error',
      'local/no-manual-query-keys': 'error',
    },
  },

  // Flux Architecture: Effects cannot import actions
  {
    files: ['**/*Effects.ts', '**/*Effects.tsx', '**/effects/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/actions/**',
                '../actions/**',
                './actions/**',
                '**/core/actions/**',
              ],
              message:
                'FLUX VIOLATION: Effects cannot import actions (circular flow risk). Effects only listen to events and update slices. See EVENTS.md.',
            },
          ],
        },
      ],
    },
  },

  // Flux Architecture: Actions cannot import slices
  {
    files: ['**/*Actions.ts', '**/*Actions.tsx', '**/actions/**/*'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*Slice', '../*Slice', './*Slice', '**/*Slice.ts'],
              message:
                'FLUX VIOLATION: Actions cannot import slice files. Actions should emit events via eventBus, effects update slices. See EVENTS.md.',
            },
            {
              group: ['**/slices/**', '../slices/**', './slices/**'],
              message:
                'FLUX VIOLATION: Actions cannot import from /slices/ folders. Emit events instead. See EVENTS.md.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "FunctionDeclaration[returnType.typeAnnotation.typeName.name='Promise']",
          message:
            'FLUX VIOLATION: Actions must return void, not Promise<void>. Use fire-and-forget pattern.',
        },
        {
          selector:
            "ArrowFunctionExpression[returnType.typeAnnotation.typeName.name='Promise']",
          message:
            'FLUX VIOLATION: Actions must return void, not Promise<void>. Use fire-and-forget pattern.',
        },
        {
          selector: 'FunctionDeclaration[async=true]',
          message:
            'FLUX VIOLATION: Actions must NOT use async keyword. Use fire-and-forget pattern.',
        },
        {
          selector: 'ArrowFunctionExpression[async=true]',
          message:
            'FLUX VIOLATION: Actions must NOT use async keyword. Use fire-and-forget pattern.',
        },
        {
          selector: "FunctionDeclaration:has(Identifier[name='getState'])",
          message:
            'FLUX VIOLATION: Actions are PURE FUNCTIONS. They must NOT access store via getState().',
        },
        {
          selector: "ArrowFunctionExpression:has(Identifier[name='getState'])",
          message:
            'FLUX VIOLATION: Actions are PURE FUNCTIONS. They must NOT access store via getState().',
        },
      ],
    },
  },

  // Components: No direct slice dispatch
  {
    files: ['src/screensets/**/*.tsx', 'src/components/**/*.tsx', 'src/app/**/*.tsx'],
    ignores: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/*Slice.tsx',
      '**/actions/**',
      '**/effects/**',
      '**/store/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/store/*Store',
                '../store/*Store',
                './store/*Store',
                '../../store/*Store',
              ],
              message:
                'FLUX VIOLATION: Components cannot import custom stores. Use Redux slices with useSelector and dispatch actions.',
            },
            {
              group: [
                '**/hooks/use*Store',
                '../hooks/use*Store',
                './hooks/use*Store',
                '../../hooks/use*Store',
              ],
              message:
                'FLUX VIOLATION: Components cannot use custom store hooks. Use Redux useSelector hook.',
            },
          ],
        },
      ],
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

  // Flux Architecture: Effects cannot emit events
  {
    files: ['**/*Effects.ts', '**/effects/**/*.ts'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='eventBus'][callee.property.name='emit']",
          message:
            'FLUX VIOLATION: Effects cannot emit events (creates circular flow). Effects should only listen to events and update slices.',
        },
      ],
    },
  },

  // Data Layer: No hardcoded i18n values
  {
    files: ['**/types/**/*', '**/api/**/*', '**/mocks.ts', '**/*.types.ts'],
    ignores: ['**/*.test.*', '**/*.spec.*', '**/*.tsx', '**/*.jsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='t']",
          message:
            'I18N VIOLATION: Translation function t() should NOT be used in types, interfaces, or data structures.',
        },
      ],
    },
  },

  // Mock Data: Strict lodash enforcement
  {
    files: ['**/mocks.ts', '**/mock*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='trim']",
          message:
            'MOCK DATA VIOLATION: Use lodash trim() instead of native .trim() in mock data factories.',
        },
        {
          selector: "CallExpression[callee.property.name='charAt']",
          message:
            'MOCK DATA VIOLATION: Use lodash string methods instead of native .charAt() in mock data.',
        },
        {
          selector: "CallExpression[callee.property.name='substring']",
          message:
            'MOCK DATA VIOLATION: Use lodash truncate() or other methods instead of native .substring() in mock data.',
        },
        {
          selector: "CallExpression[callee.property.name='toUpperCase']",
          message:
            'MOCK DATA VIOLATION: Use lodash upperCase() or upperFirst() instead of native .toUpperCase() in mock data.',
        },
        {
          selector: "CallExpression[callee.property.name='toLowerCase']",
          message:
            'MOCK DATA VIOLATION: Use lodash lowerCase() or lowerFirst() instead of native .toLowerCase() in mock data.',
        },
        {
          selector: "CallExpression[callee.property.name='slice']",
          message:
            'MOCK DATA VIOLATION: Use lodash slice() instead of native .slice() in mock data.',
        },
      ],
    },
  },

  // ==== App Events: Allow inline config for module augmentation ====

  // main variants: @/app/themes is copied from monorepo at template build (manifest root.directories),
  // not present in template-sources-only checkouts — allow @ts-expect-error on theme imports.
  {
    files: [
      'src/app/main.tsx',
      'src/app/main.custom-uikit.tsx',
      'src/app/main.no-uikit.tsx',
      // Monorepo: ESLint cwd may be repo root, so paths include packages/cli/template-sources/project/
      'packages/cli/template-sources/project/src/app/main.tsx',
      'packages/cli/template-sources/project/src/app/main.custom-uikit.tsx',
      'packages/cli/template-sources/project/src/app/main.no-uikit.tsx',
    ],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];
