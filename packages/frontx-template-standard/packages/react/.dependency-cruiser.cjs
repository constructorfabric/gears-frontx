/**
 * @gears-frontx/react Dependency Cruiser Configuration
 * Extends React layer config - can import framework and React
 */

const reactConfig = require('@gears-frontx/depcruise-config/react.cjs');

module.exports = {
  forbidden: reactConfig.forbidden,
  options: {
    ...reactConfig.options,
    // Only analyze this package's source
    doNotFollow: {
      path: 'node_modules',
    },
  },
};
