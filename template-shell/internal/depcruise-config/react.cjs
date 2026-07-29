/**
 * FrontX Template Dependency Cruiser React Configuration (L3)
 * Rules for packages/react.
 *
 * React CANNOT import:
 * - @gears-frontx/state, @gears-frontx/i18n directly -- must go through
 *   @gears-frontx/framework re-exports (L3 -> L2 -> L1, never L3 -> L1).
 *
 * Ported from the ecosystem's internal/depcruise-config/react.cjs. Narrower
 * than that version, which also excludes @gears-frontx/api (outside this
 * template's three-layer chain) and @gears-frontx/uicore (a deprecated
 * ecosystem package that does not exist in this template).
 */

const base = require('./base.cjs');
const { SDK_PACKAGES } = require('./layer-constants.cjs');

const SDK_PACKAGE_ALTERNATION = SDK_PACKAGES.join('|');

// dependency-cruiser matches `to.path` against the *resolved* module path.
// Under npm workspaces, `@gears-frontx/state` and `@gears-frontx/i18n`
// resolve through their node_modules symlink to their repo-relative
// realpath (`packages/state/dist/...`), not to
// `node_modules/@gears-frontx/state/...` -- verified empirically against
// this template's own workspace layout. The `node_modules/@gears-frontx/`
// alternative is kept for the case this template is consumed outside an
// npm-workspaces layout.
const SDK_PACKAGES_RESOLVED = `packages/(${SDK_PACKAGE_ALTERNATION})/dist/|node_modules/@gears-frontx/(${SDK_PACKAGE_ALTERNATION})`;

module.exports = {
  forbidden: [
    ...base.forbidden,

    {
      name: 'react-no-direct-sdk-import',
      severity: 'error',
      from: { path: '^packages/react/src' },
      to: { path: SDK_PACKAGES_RESOLVED },
      comment: 'REACT VIOLATION: React (L3) must import SDK packages via @gears-frontx/framework re-exports, not directly.',
    },
  ],
  options: base.options,
};
