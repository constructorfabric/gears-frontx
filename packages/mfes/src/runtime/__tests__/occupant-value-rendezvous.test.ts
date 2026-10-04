/**
 * Unit tests for the realm-global occupant-value rendezvous
 * (`cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`).
 *
 * Covers the same-copy accessor surface directly, plus the cross-copy
 * protocol property the rendezvous slot depends on: the accessor resolves
 * the slot fresh from `globalThis` on every call (no module-level cached
 * reference), and recognizes an entry by structural shape, not by
 * `instanceof` — so a second, independently loaded copy of this module,
 * sharing nothing with this one but `globalThis`, can read what this copy
 * wrote and vice versa. The last two tests below prove that property with a
 * hand-built second reader that re-implements the same resolution rule
 * rather than a real second module instance: the ESLint dynamic-code
 * trust-kernel rule (`cpt-frontx-adr-mfe-load-isolation`) confines dynamic
 * `import()` to `mf-dynamic-module-ops.ts` and forbids it everywhere else
 * under `packages/mfes/src/**`, including tests, so `vi.resetModules()` +
 * dynamic `import()` is not an option here. The full two-independently-
 * loaded-copies integration claim (AC6.4 in the FEATURE — a nested registry
 * built with a router inside the extension's `mount` calling
 * `supplyNavigation` with a value read back through an actual second
 * module graph) is out of scope for this file and remains unverified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  associateOccupantValue,
  readOccupantValue,
  releaseOccupantValue,
} from '../occupant-value-rendezvous';
import type { ChildMfeBridge } from '../../handler/ChildMfeBridge';

const OCCUPANT_VALUE_KEY = Symbol.for('@gears-frontx/mfes:occupant-value:1');

function fakeBridge(): ChildMfeBridge {
  // A bare object is sufficient: the rendezvous keys its WeakMap by object
  // identity only, never by any member of ChildMfeBridge.
  return {} as ChildMfeBridge;
}

function clearRendezvousSlot(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[OCCUPANT_VALUE_KEY];
}

describe('occupant-value rendezvous', () => {
  beforeEach(() => {
    clearRendezvousSlot();
  });

  it('reads undefined for a bridge nothing was ever associated with', () => {
    expect(readOccupantValue(fakeBridge())).toBeUndefined();
  });

  it('reads undefined for an undefined bridge', () => {
    expect(readOccupantValue(undefined)).toBeUndefined();
  });

  it('associates a value and reads it back through the same bridge', () => {
    const bridge = fakeBridge();
    const value = { marker: 'sentinel-1' };
    associateOccupantValue(bridge, value);
    expect(readOccupantValue(bridge)).toBe(value);
  });

  it('a later association for the same bridge replaces the earlier one', () => {
    const bridge = fakeBridge();
    associateOccupantValue(bridge, 'first');
    associateOccupantValue(bridge, 'second');
    expect(readOccupantValue(bridge)).toBe('second');
  });

  it('a lookup by a different bridge, never associated, returns undefined', () => {
    const bridgeA = fakeBridge();
    const bridgeB = fakeBridge();
    associateOccupantValue(bridgeA, 'only-a');
    expect(readOccupantValue(bridgeB)).toBeUndefined();
    expect(readOccupantValue(bridgeA)).toBe('only-a');
  });

  it('releasing an entry makes that bridge read undefined again, without touching others', () => {
    const bridgeA = fakeBridge();
    const bridgeB = fakeBridge();
    associateOccupantValue(bridgeA, 'a-value');
    associateOccupantValue(bridgeB, 'b-value');

    releaseOccupantValue(bridgeA);

    expect(readOccupantValue(bridgeA)).toBeUndefined();
    expect(readOccupantValue(bridgeB)).toBe('b-value');
  });

  it('releasing an undefined bridge is a no-op', () => {
    expect(() => releaseOccupantValue(undefined)).not.toThrow();
  });

  it('backs away from a slot carrying an unrecognized protocol version: reads undefined, logs a diagnostic, and never writes through it', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    (globalThis as unknown as Record<symbol, unknown>)[OCCUPANT_VALUE_KEY] = {
      v: 999,
      values: new WeakMap(),
    };

    const bridge = fakeBridge();
    expect(readOccupantValue(bridge)).toBeUndefined();
    expect(() => associateOccupantValue(bridge, 'ignored')).not.toThrow();
    // Still backed away — a write attempt after back-away does not somehow
    // adopt the slot; the association is simply dropped.
    expect(readOccupantValue(bridge)).toBeUndefined();
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });

  it('backs away from a malformed slot entry (missing values) without touching it', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    (globalThis as unknown as Record<symbol, unknown>)[OCCUPANT_VALUE_KEY] = { v: 1 };

    expect(readOccupantValue(fakeBridge())).toBeUndefined();
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });

  it('adopts a structurally-conforming values map published by other same-realm code, recognized by shape not class identity', () => {
    const bridge = fakeBridge();
    // A structural stand-in for a WeakMap from a "different copy" — not an
    // actual WeakMap instance, proving the accessor recognizes it by its
    // get/set/has/delete operations rather than `instanceof`.
    const store = new Map<ChildMfeBridge, unknown>();
    const structuralMap = {
      get: (k: ChildMfeBridge) => store.get(k),
      set: (k: ChildMfeBridge, v: unknown) => { store.set(k, v); return structuralMap; },
      has: (k: ChildMfeBridge) => store.has(k),
      delete: (k: ChildMfeBridge) => store.delete(k),
    };
    (globalThis as unknown as Record<symbol, unknown>)[OCCUPANT_VALUE_KEY] = {
      v: 1,
      values: structuralMap,
    };

    associateOccupantValue(bridge, 'via-foreign-map');
    expect(readOccupantValue(bridge)).toBe('via-foreign-map');
    expect(store.get(bridge)).toBe('via-foreign-map');
  });

  /**
   * A hand-built stand-in for a second, independently loaded copy of this
   * module's own `resolveValuesMap` + read path: it resolves
   * `Symbol.for(...)` and checks the entry's shape exactly as the real
   * accessor does, but is written out separately, sharing no module, no
   * closure, and no reference with the accessor under test — only
   * `globalThis`, exactly the boundary a second package copy would cross.
   */
  function secondCopyRead(bridge: ChildMfeBridge): unknown {
    const entry = (globalThis as unknown as Record<symbol, unknown>)[OCCUPANT_VALUE_KEY] as
      | { v?: unknown; values?: { get(key: ChildMfeBridge): unknown } }
      | undefined;
    if (
      entry === undefined ||
      entry.v !== 1 ||
      typeof entry.values?.get !== 'function'
    ) {
      return undefined;
    }
    return entry.values.get(bridge);
  }

  it('a value this accessor associates is readable by a second, independently written reader sharing only globalThis', () => {
    const bridge = fakeBridge();

    associateOccupantValue(bridge, 'from-first-reader');

    expect(secondCopyRead(bridge)).toBe('from-first-reader');
  });

  it('a second reader backs away from an unrecognized protocol version exactly as this accessor does', () => {
    (globalThis as unknown as Record<symbol, unknown>)[OCCUPANT_VALUE_KEY] = {
      v: 999,
      values: new WeakMap(),
    };

    expect(secondCopyRead(fakeBridge())).toBeUndefined();
  });
});
