/**
 * @gears-frontx/framework ESLint Configuration
 * Extends Framework layer config - can import SDK packages, no React
 */

import { frameworkConfig } from '@gears-frontx/eslint-config/framework.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...frameworkConfig,

  // Package-specific ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'test-*.ts'],
  },
];
