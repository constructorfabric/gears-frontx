/**
 * HAI3 ESLint SDK Configuration (L1)
 * Rules for SDK packages: @gears-frontx/state, @gears-frontx/layout, @gears-frontx/api, @gears-frontx/i18n
 *
 * SDK packages MUST have:
 * - ZERO @gears-frontx/* dependencies (complete isolation)
 * - NO React dependencies (framework-agnostic)
 */

import type { ConfigArray } from 'typescript-eslint';
import { baseConfig } from './base';

export const sdkConfig: ConfigArray = [
  ...baseConfig,

  // SDK-specific restrictions
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/*'],
              message: 'SDK VIOLATION: SDK packages cannot import other @gears-frontx packages. SDK packages must have ZERO @gears-frontx dependencies.',
            },
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'SDK VIOLATION: SDK packages cannot import React. SDK packages must be framework-agnostic.',
            },
          ],
        },
      ],
    },
  },
];
