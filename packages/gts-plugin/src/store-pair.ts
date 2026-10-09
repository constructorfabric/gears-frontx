/**
 * Realm store rendezvous
 *
 * Copies of this package evaluated in one JavaScript realm (the host and each
 * microfrontend load their own module graph) converge on one store pair
 * through a `Symbol.for` slot on the realm's global object, so a runtime can
 * rely on types and instances another runtime registered. What the copies
 * share is an object reached through the global object, never a module record.
 *
 * Internal: the package entry point does not export this module. The slot is
 * trusted same-realm coordination state, not an authenticated channel
 * (`cpt-frontx-adr-realm-shared-gts-store`).
 *
 * @packageDocumentation
 */

import type { JsonEntity, ValidationResult as GtsValidationResult } from '@globaltypesystem/gts-ts';
import { canonicalText, cyrb53 } from './canonical';

// @cpt-algo:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1

/**
 * Bump in the same change that alters the shape of the slot entry or the
 * meaning of the data the stores hold. Copies of different formats never share.
 */
export const STORE_FORMAT = 1;

const KEY_PREFIX = '@gears-frontx/gts-plugin:gts-store';
const KEY_INDEX = Symbol.for('@gears-frontx/gts-plugin:gts-store-keys');

/** The operations this package calls on a store; a store is recognized by these, never by class. */
export interface StoreLike {
  register(entity: JsonEntity): void;
  get(id: string): JsonEntity | undefined;
  getAll(): JsonEntity[];
  validateInstance(id: string): GtsValidationResult;
}

/** Identifies one evaluated copy; its ordinal names the copy in warnings. */
export interface WriterToken {
  readonly ordinal: number;
}

/** The three parts that decide whether copies agree on meaning. */
export interface KeyInputs {
  readonly format: number;
  readonly libraryVersion: string;
  readonly builtinHash: string;
}

/**
 * The slot entry. Changing a field name or kind needs a store format bump.
 * `store` and `scratch` are mutable only through `scratch` replacement by a
 * mirror rebuild; every call reads them afresh from the pair.
 */
export interface StorePair extends KeyInputs {
  readonly store: StoreLike;
  scratch: StoreLike;
  /** Creates a store with the library copy that created the pair, so one validator serves the whole pair. */
  readonly createStore: () => StoreLike;
  /** Identifier to the token of the copy that wrote what the store holds under it. */
  readonly writers: Map<string, WriterToken>;
  /** Warnings already given, so a runtime that registers on every load does not repeat them. */
  readonly reported: Set<string>;
  /** Copies that joined. */
  copies: number;
}

// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-derive-key
export function keyName(inputs: KeyInputs): string {
  return `${KEY_PREFIX}:${inputs.format}:${inputs.libraryVersion}:${inputs.builtinHash}`;
}

/** The package's own version is deliberately not an input: a release that changes neither part keeps sharing. */
export function slotKey(inputs: KeyInputs): symbol {
  return Symbol.for(keyName(inputs));
}
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-derive-key

// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-hash
/**
 * Hash of the built-in set in canonical form, sorted by identifier. Two
 * copies that hold different content under one built-in identifier get
 * different keys, so no verdict depends on which copy loaded first.
 */
export function computeBuiltinHash(builtins: ReadonlyArray<{ id: string; content: unknown }>): string {
  const parts = [...builtins]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, content }) => {
      const canonical = canonicalText(content);
      if (!canonical.ok) {
        throw new Error(`Built-in '${id}' is not representable as JSON: ${canonical.reason}`);
      }
      return canonical.text;
    });
  return cyrb53(parts.join('\n'));
}
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-hash

function hasFunctions(value: unknown, names: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return names.every((name) => typeof Reflect.get(value, name) === 'function');
}

function isStoreLike(value: unknown): value is StoreLike {
  return hasFunctions(value, ['register', 'get', 'getAll', 'validateInstance']);
}

function isWriterMap(value: unknown): value is Map<string, WriterToken> {
  return hasFunctions(value, ['get', 'set']);
}

function isReportedSet(value: unknown): value is Set<string> {
  return hasFunctions(value, ['has', 'add']);
}

// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-if-recognized
/**
 * Accept an entry only when this copy can work with every part of it. The
 * parts are recognized by the operations this copy calls, since each copy
 * evaluates its own GTS library and a store another copy created is an
 * instance of a class this copy does not share.
 */
function isRecognizedPair(entry: unknown, inputs: KeyInputs): entry is StorePair {
  if (typeof entry !== 'object' || entry === null) return false;
  const store: unknown = Reflect.get(entry, 'store');
  const scratch: unknown = Reflect.get(entry, 'scratch');
  const createStore: unknown = Reflect.get(entry, 'createStore');
  const writers: unknown = Reflect.get(entry, 'writers');
  const reported: unknown = Reflect.get(entry, 'reported');
  const copies: unknown = Reflect.get(entry, 'copies');
  if (
    Reflect.get(entry, 'format') !== inputs.format ||
    Reflect.get(entry, 'libraryVersion') !== inputs.libraryVersion ||
    Reflect.get(entry, 'builtinHash') !== inputs.builtinHash ||
    !isStoreLike(store) ||
    !isStoreLike(scratch) ||
    typeof createStore !== 'function' ||
    !isWriterMap(writers) ||
    !isReportedSet(reported) ||
    typeof copies !== 'number'
  ) {
    return false;
  }
  // The entry itself is the pair: copies and scratch are updated in place so
  // every provider instance on it sees the change.
  return true;
}
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-if-recognized

/** A pair holding no entities yet. `createStore` must come from the library copy that owns the pair. */
export function createPair(inputs: KeyInputs, createStore: () => StoreLike): StorePair {
  return {
    format: inputs.format,
    libraryVersion: inputs.libraryVersion,
    builtinHash: inputs.builtinHash,
    store: createStore(),
    scratch: createStore(),
    createStore,
    writers: new Map(),
    reported: new Set(),
    copies: 0,
  };
}

const KEY_PARTS = /^@gears-frontx\/gts-plugin:gts-store:(\d+):(.+):([0-9a-f]+)$/;

function describeDifference(mine: KeyInputs, otherKey: string): string {
  const match = KEY_PARTS.exec(otherKey);
  if (!match) return 'an unrecognized key';
  const parts: string[] = [];
  if (match[1] !== String(mine.format)) parts.push('the store format');
  if (match[2] !== mine.libraryVersion) parts.push('the GTS library version');
  if (match[3] !== mine.builtinHash) parts.push('the built-in hash');
  return parts.length > 0 ? parts.join(' and ') : 'nothing this copy can tell';
}

/**
 * Record the key in the realm's index and warn when other keys exist, since a
 * runtime on another key cannot see registrations made under this one.
 */
function indexKey(host: object, inputs: KeyInputs): void {
  const existing: unknown = Reflect.get(host, KEY_INDEX);
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-index
  let index: unknown[];
  if (existing === undefined) {
    index = [];
    Reflect.set(host, KEY_INDEX, index);
  } else if (Array.isArray(existing)) {
    index = existing;
  } else {
    // Something else owns this slot; leave it alone and skip the warning.
    return;
  }
  const name = keyName(inputs);
  const others = index.filter((k) => k !== name).map(String);
  index.push(name);
  // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-index
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-warn-new-store
  if (others.length > 0) {
    console.warn(
      `[gts-plugin] Opened type store ${keyName(inputs)} while other stores exist: ${others.join(', ')}. ` +
        `They differ in ${[...new Set(others.map((o) => describeDifference(inputs, o)))].join('; ')}. ` +
        'Types and instances registered under the other keys are not visible to runtimes on this key.'
    );
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-warn-new-store
}

const tokens = new WeakMap<StorePair, WriterToken>();

/**
 * The token of this evaluated copy on a pair. The copy joins once per pair, and
 * a debug line gives the ordinal so later warnings can be matched to load order.
 */
// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-join
export function joinPair(pair: StorePair, options: { announce?: boolean } = {}): WriterToken {
  const known = tokens.get(pair);
  if (known) return known;
  pair.copies += 1;
  const token: WriterToken = { ordinal: pair.copies };
  tokens.set(pair, token);
  if (options.announce) {
    console.debug(`[gts-plugin] Copy ${token.ordinal} joined type store ${keyName(pair)}.`);
  }
  return token;
}
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-join

// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-return
// The pair lives as long as the realm: nothing disposes it, counts its
// holders or evicts its entries. Type definitions carry no freshness
// semantics, and instances get theirs from the last write.
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-return

/** Pairs local to this evaluated copy, by key name, used when the realm entry cannot be understood. */
const localPairs = new Map<string, StorePair>();

/** For tests only: forget the pairs local to this evaluated copy. */
export function resetLocalPairForTests(): void {
  localPairs.clear();
}

/**
 * Obtain the pair for this copy: adopt the realm's, publish one, or fall back
 * to a local pair when the entry cannot be understood.
 */
export function obtainSharedPair(
  host: object,
  inputs: KeyInputs,
  createStore: () => StoreLike
): StorePair {
  const key = slotKey(inputs);
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-read-slot
  const entry: unknown = Reflect.get(host, key);
  // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-read-slot

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-if-empty
  if (entry === undefined) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-publish
    // Construction is synchronous, so two copies never each publish for one key.
    const pair = createPair(inputs, createStore);
    Reflect.set(host, key, pair);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-publish
    indexKey(host, inputs);
    // The copy that publishes a pair stays silent; only adopters announce.
    joinPair(pair);
    return pair;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-if-empty

  if (isRecognizedPair(entry, inputs)) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-adopt
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-trusted-coordination
    // Adopted whichever same-realm code published it: recognition guards
    // against accidental incompatibility and does not authenticate.
    joinPair(entry, { announce: true });
    return entry;
    // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-trusted-coordination
    // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-adopt
  }

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-else-unrecognized
  let localPair = localPairs.get(keyName(inputs));
  if (!localPair) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-leave-unrecognized
    console.warn(
      `[gts-plugin] The realm slot ${keyName(inputs)} holds an entry this copy does not recognize. ` +
        'It is left untouched, and this copy works from a local type store: registrations other runtimes make are not visible to it.'
    );
    // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-leave-unrecognized
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-fallback-local
    localPair = createPair(inputs, createStore);
    localPairs.set(keyName(inputs), localPair);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-fallback-local
  }
  joinPair(localPair);
  return localPair;
  // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-else-unrecognized
}
