/**
 * @gears-frontx/framework Dependency Cruiser Configuration
 * Extends Framework layer config - can import SDK packages, no React
 */

const frameworkConfig = require('@gears-frontx/depcruise-config/framework.cjs');

module.exports = {
  forbidden: frameworkConfig.forbidden,
  options: {
    ...frameworkConfig.options,
    // Only analyze this package's source
    doNotFollow: {
      path: 'node_modules',
    },
  },
};
