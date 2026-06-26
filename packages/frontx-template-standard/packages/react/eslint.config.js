/**
 * @gears-frontx/react ESLint Configuration
 * Extends React layer config - can import framework and React
 */

import { reactConfig } from '@gears-frontx/eslint-config/react.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...reactConfig,

  // Package-specific ignores
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
