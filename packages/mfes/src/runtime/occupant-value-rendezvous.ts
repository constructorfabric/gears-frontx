/**
 * Realm-global occupant-value rendezvous.
 *
 * Internal registry plumbing (`cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`).
 * NOT exported from the package's public barrel (`src/index.ts`) — every
 * export here is reachable only from other files inside this package.
 *
 * The router assigns an extension's occupant value to the PARENT registry's
 * copy of this package at mount time. The extension's OWN copy of this
 * package — possibly a different, independently loaded copy
 * (`cpt-frontx-adr-mfe-load-isolation`) — must read that same value back out
 * when it builds its own nested registry. A module-scoped variable cannot
 * cross that boundary; only `globalThis` (`Symbol.for`, exactly as
 * `inbound-bridge-link.ts` and `RealmSharedDepTextCacheProvider.ts` already
 * do for their own rendezvous points) reliably does.
 *
 * Distinct from the mount-context rendezvous (`inbound-bridge-link.ts`,
 * `@gears-frontx/mfes:mount-context:1`) and from the shared-dependency
 * source-text cache slot (`RealmSharedDepTextCacheProvider.ts`) — each
 * concern gets its own `Symbol.for` slot rather than contending for one.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p2
// @cpt-dod:cpt-frontx-dod-mfe-host-communication-occupant-value-rendezvous:p1
// @cpt-dod:cpt-frontx-dod-mfe-host-communication-occupant-value-not-exposed:p1

import type { ChildMfeBridge } from '../handler/ChildMfeBridge';
import type { OccupantValue } from '../router/RouterPort';

/**
 * The rendezvous protocol version this copy produces and recognizes. A
 * reader that finds an entry tagged with a different version treats the
 * rendezvous as absent rather than guessing at an incompatible shape, the
 * same acceptance `cpt-frontx-adr-shared-dep-cache-reach` records for its
 * own slot.
 */
const RENDEZVOUS_PROTOCOL_VERSION = 1 as const;

/**
 * Structural shape a `values` map must offer to be adopted — never
 * `instanceof WeakMap`, since a different, independently loaded copy of this
 * package has its own `WeakMap` class, invisible to an `instanceof` check
 * run from this copy.
 */
interface StructuralWeakMap {
  get(key: ChildMfeBridge): OccupantValue | undefined;
  set(key: ChildMfeBridge, value: OccupantValue): unknown;
  has(key: ChildMfeBridge): boolean;
  delete(key: ChildMfeBridge): boolean;
}

interface OccupantValueRendezvousEntry {
  readonly v: number;
  readonly values: StructuralWeakMap;
}

/**
 * `Symbol.for(...)` — not a module-scoped variable — so every independently
 * loaded copy of this package resolves to the same global symbol registry
 * key, and therefore the same backing `WeakMap`, regardless of which copy's
 * module instance is executing.
 */
const OCCUPANT_VALUE_KEY = Symbol.for('@gears-frontx/mfes:occupant-value:1');

interface OccupantValueGlobal {
  [OCCUPANT_VALUE_KEY]?: OccupantValueRendezvousEntry;
}

/**
 * Structural (duck-typed) check for `get`/`set`/`has`/`delete` as functions —
 * never by class identity, which cannot be relied upon across independently
 * evaluated copies.
 */
function isStructuralWeakMap(candidate: unknown): candidate is StructuralWeakMap {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const maybeMap = candidate as Record<string, unknown>;
  return (
    typeof maybeMap.get === 'function' &&
    typeof maybeMap.set === 'function' &&
    typeof maybeMap.has === 'function' &&
    typeof maybeMap.delete === 'function'
  );
}

function isRecognizedEntry(candidate: unknown): candidate is OccupantValueRendezvousEntry {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const maybeEntry = candidate as { v?: unknown; values?: unknown };
  return maybeEntry.v === RENDEZVOUS_PROTOCOL_VERSION && isStructuralWeakMap(maybeEntry.values);
}

/**
 * Resolves the rendezvous `values` map this copy can act through, or
 * `undefined` if this copy has backed away from an unrecognized or malformed
 * entry (`inst-ov-back-away`), mirroring
 * `RealmSharedDepTextCacheProvider.getCache`'s own back-away diagnostic,
 * logged on every call that finds the entry unusable.
 *
 * @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-read-slot
 */
function resolveValuesMap(): StructuralWeakMap | undefined {
  const host = globalThis as unknown as OccupantValueGlobal;
  const existing = host[OCCUPANT_VALUE_KEY];
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-read-slot

  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-if-empty
  if (existing === undefined) {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-publish
    // Create-and-publish synchronously — no `await` separates the two
    // statements — so two copies racing to reach this slot in one realm
    // cannot each end up holding a map of their own.
    const values = new WeakMap<ChildMfeBridge, OccupantValue>();
    host[OCCUPANT_VALUE_KEY] = { v: RENDEZVOUS_PROTOCOL_VERSION, values };
    return values;
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-publish
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-if-empty

  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-if-version-known
  if (isRecognizedEntry(existing)) {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-adopt
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-trusted-coordination
    // Adopted whichever same-realm code published it: this slot is trusted
    // same-realm coordination state, not a confidentiality or authenticity
    // boundary (`cpt-frontx-adr-shared-dep-cache-reach` records the same
    // acceptance for its own slot).
    return existing.values;
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-trusted-coordination
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-adopt
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-if-version-known

  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-else-version-unknown
  // Malformed, or an unrecognized protocol version: left entirely untouched
  // — not read further, not mutated, not replaced, not deleted.
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-back-away
  console.debug(
    '[occupant-value-rendezvous] Realm occupant-value rendezvous slot ' +
      `(${String(OCCUPANT_VALUE_KEY)}) carries an entry this copy does not recognize ` +
      `as protocol version ${RENDEZVOUS_PROTOCOL_VERSION}. Leaving that entry untouched — ` +
      'every mount this copy performs proceeds with no occupant value crossing.'
  );
  return undefined;
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-back-away
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-else-version-unknown
}

/**
 * Associates `value` with `bridge`, replacing any value an earlier mount of
 * that extension associated. A no-op if this copy has backed away from the
 * rendezvous.
 *
 * @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-set-before-mount
 */
export function associateOccupantValue(bridge: ChildMfeBridge, value: OccupantValue): void {
  resolveValuesMap()?.set(bridge, value);
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-set-before-mount

/**
 * Reads the occupant value associated with `bridge`, or `undefined` when no
 * router assigned one, the bridge holds none, or this copy backed away from
 * the rendezvous.
 *
 * @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-read-own
 */
export function readOccupantValue(bridge: ChildMfeBridge | undefined): OccupantValue | undefined {
  if (!bridge) {
    return undefined;
  }
  return resolveValuesMap()?.get(bridge);
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-read-own

/**
 * Releases the association for `bridge` — called only when the extension's
 * bridge pair is released (permanent unregistration or registry disposal),
 * never on an ordinary unmount or a failed mount, which leave the
 * association in place for the next mount to replace
 * (`inst-ov-release-with-bridge`).
 *
 * @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-release-with-bridge
 */
export function releaseOccupantValue(bridge: ChildMfeBridge | undefined): void {
  if (!bridge) {
    return;
  }
  resolveValuesMap()?.delete(bridge);
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-release-with-bridge

// @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-private-exchange
// Occupant values pass only between copies of this package through this
// module's three exported functions, and between the runtime and the
// injected router through `RouterPort.assignOccupantValue`/`supplyNavigation`
// (both called only from `DefaultMountManager`/`DefaultMfeRegistry`). No
// value is placed on the child or parent bridge, the inbound bridge link,
// the mount context, the lifecycle arguments, an action, or a shared
// property, and no code of this package passes one to extension or host
// code — this module's exports are never re-exported from the package
// barrel (`src/index.ts`).
// @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-private-exchange

// @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-interface-level-guarantee
// That guarantee holds at the level of this package's own interfaces and is
// not a confidentiality boundary: the rendezvous slot above is readable by
// any script running in the same realm, which is accepted on the same
// ground `cpt-frontx-adr-shared-dep-cache-reach` records for its own slot.
// @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-interface-level-guarantee

// @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-return
// Each exported function above returns the association made
// (`associateOccupantValue`), read (`readOccupantValue`), or released
// (`releaseOccupantValue`) — or `undefined`/nothing where no router is
// injected (the caller never calls these at all) or this copy backed away
// from an unrecognized rendezvous entry (`resolveValuesMap` returns
// `undefined`, so every operation above is a no-op).
// @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-return
