/**
 * HAI3 ESLint Screenset Configuration (L4)
 * Rules for user code (screensets, components, etc.)
 *
 * This includes ALL existing flux architecture rules, screenset isolation,
 * domain-based architecture rules, and action/effect/component restrictions.
 *
 * CRITICAL: This layer includes ALL protections from the existing eslint.config.js
 * to ensure NO existing rules are lost during the SDK migration.
 */

import type { ConfigArray } from 'typescript-eslint';
import type { Linter } from 'eslint';
import { baseConfig } from './base';
import reactHooks from 'eslint-plugin-react-hooks';

interface ScreensetConfigOptions {
  localPlugin?: Linter.Plugin;
}

/**
 * Creates screenset configuration with optional local plugin
 */
export function createScreensetConfig(options: ScreensetConfigOptions = {}): ConfigArray {
  const { localPlugin } = options;

  const config: ConfigArray = [
    ...baseConfig,

    // React hooks rules
    {
      files: ['**/*.{ts,tsx}'],
      plugins: {
        'react-hooks': reactHooks,
        ...(localPlugin ? { local: localPlugin } : {}),
      },
      linterOptions: {
        noInlineConfig: true,
      },
      rules: {
        ...reactHooks.configs.recommended.rules,
        'react-hooks/exhaustive-deps': 'error',

        // Screenset Architecture: Domain-based conventions (disabled globally, enabled for screensets)
        ...(localPlugin ? {
          'local/no-barrel-exports-events-effects': 'off',
          'local/no-coordinator-effects': 'off',
          'local/no-missing-domain-id': 'off',
          'local/domain-event-format': 'off',
          'local/no-inline-styles': 'error',
          'local/uikit-no-business-logic': 'off',
          'local/screen-inline-components': 'off',
        } : {}),

        // Flux Architecture: No direct store.dispatch + Lodash enforcement
        'no-restricted-syntax': [
          'error',
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
    ...(localPlugin ? [{
      files: ['src/screensets/**/*'],
      rules: {
        'local/no-barrel-exports-events-effects': 'error',
        'local/no-coordinator-effects': 'error',
        'local/no-missing-domain-id': 'error',
        'local/domain-event-format': 'error',
      },
    }] : []),

    // UI components: Presentational components only (no @gears-frontx/react business logic)
    ...(localPlugin ? [{
      files: ['src/components/ui/**/*.{ts,tsx}', 'src/mfe_packages/*/src/components/ui/**/*.{ts,tsx}'],
      rules: {
        'local/uikit-no-business-logic': 'error',
      },
    }] : []),

    // Screens: Detect inline component definitions
    ...(localPlugin ? [{
      files: ['src/screensets/**/screens/**/*Screen.tsx'],
      rules: {
        'local/screen-inline-components': 'error',
      },
    }] : []),

    // Flux Architecture: Effects cannot import actions
    {
      files: ['**/*Effects.ts', '**/*Effects.tsx', '**/effects.ts', '**/effects.tsx', '**/effects/**/*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  './actions',
                  '../actions',
                  '**/actions',
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
              "CallExpression[callee.object.name=/Store$/][callee.property.name!='getState']",
            message:
              'FLUX VIOLATION: Components cannot call custom store methods directly. Use Redux actions and useSelector.',
          },
        ],
      },
    },

    // Flux Architecture: Effects cannot emit events
    {
      files: ['**/*Effects.ts', '**/effects.ts', '**/effects/**/*.ts'],
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
          {
            selector:
              "CallExpression[callee.property.name='executeActionsChain']",
            message:
              'FLUX VIOLATION: Effects cannot call executeActionsChain() (triggers ActionsChainsMediator, effectively running actions). Call executeActionsChain() from actions instead.',
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
  ];

  return config;
}

// Default export without local plugin (for packages that don't need it)
export const screensetConfig = createScreensetConfig();
