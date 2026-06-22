/**
 * FrontX Dependency Cruiser Configuration Package
 *
 * Layered configuration for the FrontX SDK architecture:
 * - L0 (base): Universal rules for all code
 * - L1 (sdk): SDK packages with zero @gears-frontx dependencies
 * - L2 (framework): Framework package with only SDK deps
 * - L3 (react): React adapter with only framework dep
 * - L4 (screenset): User code with flux rules and isolation
 */

module.exports = {
  base: require('./base.cjs'),
  sdk: require('./sdk.cjs'),
  framework: require('./framework.cjs'),
  react: require('./react.cjs'),
  screenset: require('./screenset.cjs'),
};
