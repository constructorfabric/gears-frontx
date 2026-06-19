/**
 * HAI3 ESLint Framework Configuration (L2)
 * Rules for @gears-frontx/framework package
 *
 * Framework package CAN import:
 * - @gears-frontx/state, @gears-frontx/screensets, @gears-frontx/api, @gears-frontx/i18n (SDK packages)
 *
 * Framework package CANNOT import:
 * - @gears-frontx/react (would create circular dependency)
 * - react, react-dom (framework is headless)
 */

import type { ConfigArray } from 'typescript-eslint';
import { baseConfig } from './base';

export const frameworkConfig: ConfigArray = [
  ...baseConfig,

  // Framework-specific restrictions
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/react'],
              message: 'FRAMEWORK VIOLATION: Framework cannot import @gears-frontx/react (circular dependency).',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'FRAMEWORK VIOLATION: Framework cannot import React. Framework is headless.',
            },
          ],
        },
      ],
    },
  },

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

  // Flux Architecture: Effects cannot emit events or call executeActionsChain
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
];
