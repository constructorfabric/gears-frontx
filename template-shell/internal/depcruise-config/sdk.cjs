/**
 * FrontX Template Dependency Cruiser SDK Configuration (L1)
 * Rules for packages/state and packages/i18n (see layer-constants.cjs).
 *
 * SDK packages MUST have:
 * - ZERO @gears-frontx/* dependencies (complete isolation)
 * - NO React dependency (framework-agnostic)
 *
 * Ported from the ecosystem's internal/depcruise-config/sdk.cjs, scoped to
 * this template's own SDK_PACKAGES (state, i18n) instead of the
 * ecosystem's (state, api, i18n, mfes).
 */

const base = require('./base.cjs');
const { SDK_PACKAGES } = require('./layer-constants.cjs');

// Derive the "SDK package src roots" regex from the shared layer list so
// this rule and layer-constants.cjs cannot disagree on what counts as SDK.
const SDK_SRC_PATTERN = `^packages/(${SDK_PACKAGES.join('|')})/src`;

// dependency-cruiser matches `to.path` against the *resolved* module path,
// not the raw import specifier. Under npm workspaces, `packages/*` are
// symlinked into node_modules, and dependency-cruiser follows the symlink
// to its repo-relative realpath (e.g. `packages/framework/dist/index.js`)
// rather than reporting `node_modules/@gears-frontx/framework/...` --
// verified empirically against this template's own workspace layout.
// A sibling @gears-frontx package can therefore only ever resolve under
// `packages/<name>/dist/` (a same-package relative import resolves under
// `packages/<name>/src/` instead, which this pattern does not match).
// The `node_modules/@gears-frontx/` alternative is kept for the case this
// template is consumed outside an npm-workspaces layout, where the package
// would resolve as an ordinary installed dependency instead of a symlink.
const ANY_GEARS_FRONTX_PACKAGE = 'packages/[^/]+/dist/|node_modules/@gears-frontx/';

module.exports = {
  forbidden: [
    ...base.forbidden,

    {
      name: 'sdk-no-gears-frontx-imports',
      severity: 'error',
      from: { path: SDK_SRC_PATTERN },
      to: { path: ANY_GEARS_FRONTX_PACKAGE },
      comment: 'SDK VIOLATION: SDK packages must have ZERO @gears-frontx dependencies. Each SDK package is completely isolated.',
    },
    {
      name: 'sdk-no-react',
      severity: 'error',
      from: { path: SDK_SRC_PATTERN },
      to: { path: 'node_modules/react' },
      comment: 'SDK VIOLATION: SDK packages cannot import React. SDK packages must be framework-agnostic.',
    },
  ],
  options: base.options,
};
