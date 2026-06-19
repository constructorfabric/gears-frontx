/**
 * HAI3 Dependency Cruiser SDK Configuration (L1)
 * Rules for SDK packages: @gears-frontx/state, @gears-frontx/layout, @gears-frontx/api, @gears-frontx/i18n
 *
 * SDK packages MUST have:
 * - ZERO @gears-frontx/* dependencies (complete isolation)
 * - NO React dependencies (framework-agnostic)
 */

const base = require('./base.cjs');

module.exports = {
  forbidden: [
    ...base.forbidden,

    // ============ SDK ISOLATION RULES ============
    {
      name: 'sdk-no-hai3-imports',
      severity: 'error',
      from: { path: '^packages/(state|screensets|api|i18n)/src' },
      to: { path: 'node_modules/@gears-frontx/' },
      comment: 'SDK VIOLATION: SDK packages must have ZERO @gears-frontx dependencies. Each SDK package is completely isolated.',
    },
    {
      name: 'sdk-no-react',
      severity: 'error',
      from: { path: '^packages/(state|screensets|api|i18n)/src' },
      to: { path: 'node_modules/react' },
      comment: 'SDK VIOLATION: SDK packages cannot import React. SDK packages must be framework-agnostic.',
    },
  ],
  options: base.options,
};
