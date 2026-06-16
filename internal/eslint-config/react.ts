/**
 * FrontX ESLint React Configuration (L3)
 * Rules for @gears-frontx/react package
 *
 * React package CAN import:
 * - @gears-frontx/framework (wires everything together)
 * - @gears-frontx/i18n (only for Language enum re-export due to isolatedModules)
 * - react, react-dom (React adapter)
 *
 * React package CANNOT import:
 * - @gears-frontx/state, @gears-frontx/screensets, @gears-frontx/api (use framework re-exports)
 */

import type { ConfigArray } from 'typescript-eslint';
import { baseConfig } from './base';
import reactHooks from 'eslint-plugin-react-hooks';

export const reactConfig: ConfigArray = [
  ...baseConfig,

  // React hooks rules
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // React package-specific restrictions
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/state', '@gears-frontx/state/*'],
              message: 'REACT VIOLATION: Import from @gears-frontx/framework instead. React package uses framework re-exports.',
            },
            {
              group: ['@gears-frontx/screensets', '@gears-frontx/screensets/*'],
              message: 'REACT VIOLATION: Import from @gears-frontx/framework instead. React package uses framework re-exports.',
            },
            {
              group: ['@gears-frontx/api', '@gears-frontx/api/*'],
              message: 'REACT VIOLATION: Import from @gears-frontx/framework instead. React package uses framework re-exports.',
            },
          ],
        },
      ],
    },
  },
];
