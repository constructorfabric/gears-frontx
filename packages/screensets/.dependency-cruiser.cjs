/**
 * @gears-frontx/layout Dependency Cruiser Configuration
 * Extends SDK layer config - enforces zero @gears-frontx dependencies and no React
 */

const sdkConfig = require('@gears-frontx/depcruise-config/sdk.cjs');

module.exports = {
  forbidden: sdkConfig.forbidden,
  options: {
    ...sdkConfig.options,
    // Only analyze this package's source
    doNotFollow: {
      path: 'node_modules',
    },
  },
};
