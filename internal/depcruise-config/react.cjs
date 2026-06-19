/**
 * HAI3 Dependency Cruiser React Configuration (L3)
 * Rules for @gears-frontx/react package
 *
 * React package CAN import:
 * - @gears-frontx/framework (wires everything together)
 * - react, react-dom (React adapter)
 *
 * React package CANNOT import:
 * - @gears-frontx/state, @gears-frontx/screensets, @gears-frontx/api, @gears-frontx/i18n (use framework re-exports)
 * - @gears-frontx/uicore (deprecated)
 */

const base = require('./base.cjs');

module.exports = {
  forbidden: [
    ...base.forbidden,

    // ============ REACT LAYER RULES ============
    {
      name: 'react-only-framework-dep',
      severity: 'error',
      from: { path: '^packages/react/src' },
      to: { path: 'node_modules/@gears-frontx/(state|screensets|api|i18n)' },
      comment: 'REACT VIOLATION: React package imports SDK via @gears-frontx/framework, not directly. Use framework re-exports.',
    },
    {
      name: 'react-no-uicore',
      severity: 'error',
      from: { path: '^packages/react/src' },
      to: { path: 'node_modules/@gears-frontx/uicore' },
      comment: 'REACT VIOLATION: @gears-frontx/uicore is deprecated. Use @gears-frontx/framework and @gears-frontx/react.',
    },
  ],
  options: base.options,
};
