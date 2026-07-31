/**
 * FrontX Template Dependency Cruiser Framework Configuration (L2)
 * Rules for packages/framework.
 *
 * Framework CANNOT import:
 * - @gears-frontx/react (L3) -- would create a circular L2 <-> L3 dependency
 * - react, react-dom -- framework is headless
 *
 * Ported from the ecosystem's internal/depcruise-config/framework.cjs.
 * Unlike that version, this does not restrict framework to an SDK-only
 * allow-list: packages/auth and the app-facing packages (api, mfes,
 * gts-plugin) sit outside the state/i18n -> framework -> react chain this
 * template enforces, and packages/framework legitimately depends on them.
 */

const base = require('./base.cjs');

// dependency-cruiser matches `to.path` against the *resolved* module path.
// Under npm workspaces, `@gears-frontx/react` resolves through its
// node_modules symlink to its repo-relative realpath
// (`packages/react/dist/...`), not to `node_modules/@gears-frontx/react/...`
// -- verified empirically against this template's own workspace layout.
// The `node_modules/@gears-frontx/react` alternative is kept for the case
// this template is consumed outside an npm-workspaces layout.
const REACT_PACKAGE = 'packages/react/dist/|node_modules/@gears-frontx/react';

module.exports = {
  forbidden: [
    ...base.forbidden,

    {
      name: 'framework-no-react-package',
      severity: 'error',
      from: { path: '^packages/framework/src' },
      to: { path: REACT_PACKAGE },
      comment: 'FRAMEWORK VIOLATION: Framework (L2) cannot import the React package (L3) -- would create a circular dependency.',
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
