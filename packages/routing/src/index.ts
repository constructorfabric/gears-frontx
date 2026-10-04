// @gears-frontx/routing — package entry point.
//
// This package's public surface is specified by two FEATUREs
// (packages/routing/architecture/features/):
//
//   - navigation-substrate    (cpt-frontx-feature-routing-navigation-substrate)
//   - route-ownership-signal  (cpt-frontx-feature-routing-route-ownership-signal)
//
// Every export below is grouped by the FEATURE section that specifies it;
// `export type *` for `./types` (rather than `export *`) guarantees that
// re-export erases entirely at compile time — the type contracts carry no
// runtime footprint of their own, only the grouped exports beneath them do.
export type * from './types/index.js';

// Navigation Substrate — history half (`cpt-frontx-feature-routing-navigation-substrate`,
// DoD `cpt-frontx-dod-routing-navigation-substrate-shared-history` /
// `cpt-frontx-dod-routing-navigation-substrate-imperative-navigation`).
//
// `resolveNavigationHistory` alone — not `createNavigationHistory` or
// `createWindowHistoryAdapter` — is this package's own public construction
// path (DESIGN §3.3, public surface); see `./history/index.ts` for why.
// `HistoryAdapter` and `AdapterLocation` (its own return/parameter type) are
// re-exported here as types: they sit in
// `resolveNavigationHistory`'s own public signature — the `HistoryAdapter`
// seam, FEATURE §3 — so a caller can name that shape for its own
// `createAdapter` argument; see `./history/index.ts`'s own comment for why
// marking either type as compiler-internal could not be relied on to strip
// them from the published `dist/index.d.ts`.
export { resolveNavigationHistory } from './history/index.js';
export type { AdapterLocation, HistoryAdapter } from './history/index.js';

// URL grammar codec (`cpt-frontx-feature-routing-navigation-substrate` §3:
// Grammar Parse, Grammar Serialize, Name Validity And Equality).
export * from './errors.js';
// Named exports, not `export *`: `domain-key = name`, so checking a
// `domain-key` is exactly `validateName`'s own check (see
// `./grammar/name.js`) — internal callers of that check stay internal to
// the grammar codec, not part of this package's public surface.
export { deriveExtensionToken, namesEqual, validateName } from './grammar/name.js';
export * from './grammar/parse.js';
export * from './grammar/serialize.js';

// Route Ownership Signal (`cpt-frontx-feature-routing-route-ownership-signal`,
// DoD `cpt-frontx-dod-routing-route-ownership-signal-resolution-and-observation`
// / `cpt-frontx-dod-routing-route-ownership-signal-release` /
// `cpt-frontx-dod-routing-route-ownership-signal-url-back-projection`) —
// `createRouteSignal` (the `history`-bound construction path for the
// observable transition signal and the URL back-projection helper — see
// `./signal/route-signal.js` for why this is the only construction path
// exported: an unbound `createObserver`/`backProjectEntries` pair would let a
// caller observe transitions without the `history` binding the observer
// requires, so neither is part of this package's public surface). Entry
// resolution (`./signal/entry-resolution.js`) is this package's own internal
// primitive — DESIGN §3.3 names only the observer as public; a consumer
// reaches resolution only through the transitions the observer reports.
export * from './signal/route-signal.js';
