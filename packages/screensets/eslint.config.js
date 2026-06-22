/**
 * @gears-frontx/layout ESLint Configuration
 * Extends SDK layer config - enforces zero @gears-frontx dependencies and no React
 */

import { sdkConfig } from '@gears-frontx/eslint-config/sdk.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...sdkConfig,

  // Package-specific ignores
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
