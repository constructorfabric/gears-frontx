/**
 * Single source of truth for the FrontX SDK layer partitioning.
 *
 * Both the depcruise rules (internal/depcruise-config/*.cjs, consumed by
 * `npm run arch:deps:*`) and the package.json layer guard
 * (scripts/sdk-layer-tests.ts, consumed by `npm run arch:sdk`) derive their
 * layer membership, allowed-edge, and deprecation lists from this module so
 * the two checks cannot diverge.
 *
 * Historically these lists were duplicated across the script and each
 * depcruise config; a change to one layer had to be mirrored by hand in the
 * other, and drift silently weakened one of the two guards. Keeping them here
 * means `arch:sdk` and `arch:deps:*` always agree on what counts as SDK,
 * framework, or a deprecated edge.
 */

// L1 — SDK packages. Must have zero `@gears-frontx/*` dependencies and no React.
const SDK_PACKAGES = Object.freeze(['state', 'api', 'i18n', 'screensets']);

// L2 — Framework package may import exactly these SDK packages (no more).
const ALLOWED_FRAMEWORK_SDK_DEPS = Object.freeze([
  '@gears-frontx/state',
  '@gears-frontx/api',
  '@gears-frontx/i18n',
  '@gears-frontx/screensets',
]);

// Packages that have been removed / folded into another layer. Any surviving
// reference to them is a layer violation regardless of layer.
const DEPRECATED_PACKAGES = Object.freeze([
  '@gears-frontx/uikit-contracts', // theme types absorbed by @gears-frontx/framework
  '@gears-frontx/uicore',          // consolidated into @gears-frontx/framework
  '@gears-frontx/layout',          // layout slices now in @gears-frontx/framework
]);

module.exports = {
  SDK_PACKAGES,
  ALLOWED_FRAMEWORK_SDK_DEPS,
  DEPRECATED_PACKAGES,
};
