/**
 * @gears-frontx/api ESLint Configuration
 * Extends SDK layer config - enforces zero @hai3 dependencies and no React
 */

import { sdkConfig } from '@gears-frontx/eslint-config/sdk.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...sdkConfig,

  // Package-specific ignores
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  // Plugin system requires `any` for generic plugin collections
  // This is a fundamental requirement for class-based plugin architecture
  // where plugins with different TConfig types are stored together
  {
    files: [
      'src/types.ts',
      'src/apiRegistry.ts',
      'src/BaseApiService.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
