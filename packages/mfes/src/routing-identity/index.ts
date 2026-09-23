/**
 * Route Identity — route-name validity, equality, declared-route resolution,
 * and route-token derivation for extension domains and extensions.
 *
 * Mirrors `@gears-frontx/routing`'s own grammar (`validateName`, `namesEqual`,
 * `deriveExtensionToken`; `packages/routing/src/grammar/name.ts`) without
 * depending on that package: `mfes` and `routing` are both core, standalone
 * packages and neither may depend on the other, not even for types
 * (`internal/depcruise-config/core.cjs`, `internal/depcruise-config/layer-constants.cjs`).
 * Agreement between this copy of the alphabet and routing's own is checked
 * by `scripts/routing-mfes-name-agreement.test.mjs`, outside both packages.
 *
 * FEATURE (extension-domain-governance) §3, "Route Identity: Validity,
 * Declared Route, and Token Derivation".
 *
 * @packageDocumentation
 */

import type { Extension } from '../types';

/** `name = lower ( lower | digit | "-" )*` — mirrors the routing grammar's own alphabet. */
const ROUTE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

// @cpt-algo:cpt-frontx-algo-extension-domain-governance-route-identity:p1

/**
 * Route-name validity — FEATURE §3, "Route Identity" step 1. A valid route
 * name is a single lower-case token: a lower-case letter, then any number of
 * lower-case letters, digits, or `-`.
 */
// @cpt-begin:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-is-valid-route-name
export function isValidRouteName(candidate: string): boolean {
  return ROUTE_NAME_PATTERN.test(candidate);
}
// @cpt-end:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-is-valid-route-name

/**
 * Route-name equality — FEATURE §3, "Route Identity" step 2:
 * character-by-character, no decoding.
 */
// @cpt-begin:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-route-names-equal
export function routeNamesEqual(a: string, b: string): boolean {
  return a === b;
}
// @cpt-end:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-route-names-equal

/**
 * Duck-typed shape for the presentation-route fallback: `Extension` itself
 * carries no `presentation` field (that is `ScreenExtension`'s own addition),
 * so any extension may or may not carry one at runtime.
 */
interface ExtensionWithPresentationRoute {
  presentation?: { route?: unknown };
}

/**
 * An extension's declared route — FEATURE §3, "Route Identity" step 3: the
 * base `route` when it is present AND itself a string, else
 * `presentation.route` when the extension carries a presentation object
 * whose `route` is itself a string, else absent. Returns the raw declared
 * value, not normalized. Guarded against untyped/JS callers on both
 * branches — a non-string `route` (an object, `null`, a number, …) is
 * treated exactly like an absent one rather than propagated to a later
 * `.startsWith` call.
 */
// @cpt-begin:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-get-declared-route
export function getDeclaredRoute(extension: Extension): string | undefined {
  if (typeof extension.route === 'string') {
    return extension.route;
  }
  const presentation = (extension as ExtensionWithPresentationRoute).presentation;
  if (presentation && typeof presentation.route === 'string') {
    return presentation.route;
  }
  return undefined;
}
// @cpt-end:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-get-declared-route

/**
 * An extension's route token — FEATURE §3, "Route Identity" step 4: the
 * declared route with one leading `/` stripped, iff that stripped value is a
 * valid route name; `undefined` otherwise (not routable — the routability
 * definition lives in FEATURE §3, "Route Identity"). Mirrors routing's own
 * `deriveExtensionToken` (`packages/routing/src/grammar/name.ts:34-60`).
 */
// @cpt-begin:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-get-extension-route-token
export function getExtensionRouteToken(extension: Extension): string | undefined {
  const declared = getDeclaredRoute(extension);
  if (declared === undefined) {
    return undefined;
  }
  const candidate = declared.startsWith('/') ? declared.slice(1) : declared;
  return isValidRouteName(candidate) ? candidate : undefined;
}
// @cpt-end:cpt-frontx-algo-extension-domain-governance-route-identity:p1:inst-get-extension-route-token
