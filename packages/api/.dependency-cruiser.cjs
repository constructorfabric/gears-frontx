/**
 * @gears-frontx/api Dependency Cruiser Configuration
 * Extends the Core Framework layer config — zero @gears-frontx imports, no React.
 */

const coreConfig = require('@gears-frontx/depcruise-config/core.cjs');

module.exports = {
  forbidden: coreConfig.forbidden,
  options: {
    ...coreConfig.options,
    // Only analyze this package's source
    doNotFollow: {
      path: 'node_modules',
    },
  },
};
