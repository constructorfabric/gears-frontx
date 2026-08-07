/**
 * FrontX Dependency Cruiser Base Configuration (L0)
 * Universal rules that apply to ALL FrontX code
 *
 * This is the foundation layer - all other configs extend this.
 */

module.exports = {
  forbidden: [
    // ============ GENERAL RULES ============
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^(?!.*node_modules)' },
      to: { circular: true },
      comment: 'Circular dependencies create tight coupling and make code harder to reason about.',
    },
    // NOTE: no-orphans rule was considered but not included in baseline
    // It would flag legitimate standalone files like templates and test fixtures
  ],
  options: {
    // Matches at any depth, not just the root: npm nests a `node_modules`
    // under a workspace whenever its pins conflict with the root's, and an
    // anchored `^node_modules` lets traversal descend into those until
    // dependency-cruiser OOMs (#523).
    doNotFollow: '(^|/)node_modules/',
    exclude: {
      dynamic: true,
    },
  },
};
