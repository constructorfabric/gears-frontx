/**
 * HAI3 Dependency Cruiser Framework Configuration (L2)
 * Rules for @gears-frontx/framework package
 *
 * Framework package CAN import:
 * - @gears-frontx/state, @gears-frontx/layout, @gears-frontx/api, @gears-frontx/i18n (SDK packages)
 *
 * Framework package CANNOT import:
 * - @gears-frontx/react (would create circular dependency)
 * - @gears-frontx/uicore (deprecated)
 * - react, react-dom (framework is headless)
 */

const base = require('./base.cjs');

module.exports = {
  forbidden: [
    ...base.forbidden,

    // ============ FRAMEWORK LAYER RULES ============
    {
      name: 'framework-only-sdk-deps',
      severity: 'error',
      from: { path: '^packages/framework/src' },
      to: { path: 'node_modules/@gears-frontx/(react|uicore)' },
      comment: 'FRAMEWORK VIOLATION: Framework can only import SDK packages (@gears-frontx/state, layout, api, i18n).',
    },
    {
      name: 'framework-no-react',
      severity: 'error',
      from: { path: '^packages/framework/src' },
      to: { path: 'node_modules/react' },
      comment: 'FRAMEWORK VIOLATION: Framework cannot import React. Framework is headless.',
    },
  ],
  options: base.options,
};
