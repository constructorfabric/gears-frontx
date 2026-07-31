/**
 * FrontX Template Dependency Cruiser Base Configuration (L0)
 * Universal rules shared by sdk.cjs, framework.cjs, and react.cjs.
 *
 * Ported from the ecosystem's internal/depcruise-config/base.cjs (see
 * issue #470) so template-shell's arch:deps:{sdk,framework,react}
 * scripts do not reach outside the template into ../internal/, a
 * directory this template does not own or ship (see
 * frontx-template.json ownershipBoundaries).
 */

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^(?!.*node_modules)' },
      to: { circular: true },
      comment: 'Circular dependencies create tight coupling and make code harder to reason about.',
    },
  ],
  options: {
    doNotFollow: '^node_modules',
    exclude: {
      dynamic: true,
    },
  },
};
