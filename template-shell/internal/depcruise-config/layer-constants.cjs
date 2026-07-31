/**
 * Single source of truth for template-shell's layer partitioning.
 *
 * sdk.cjs and react.cjs both derive their package lists from here so the
 * two checks cannot drift apart the way the ecosystem's script and config
 * duplication once did (see internal/depcruise-config/layer-constants.cjs
 * in the ecosystem root).
 *
 * This template's layer chain is narrower than the ecosystem's: only the
 * packages wired into arch:deps:sdk / arch:deps:framework / arch:deps:react
 * are covered. packages/auth and packages/studio sit outside this chain
 * and are intentionally not listed here.
 *
 *   L1 SDK:       packages/state, packages/i18n  (zero @gears-frontx deps)
 *   L2 Framework: packages/framework              (SDK deps allowed)
 *   L3 React:     packages/react                  (framework dep only)
 */

// L1 -- SDK packages. Must have zero `@gears-frontx/*` dependencies and no React.
const SDK_PACKAGES = Object.freeze(['state', 'i18n']);

module.exports = {
  SDK_PACKAGES,
};
