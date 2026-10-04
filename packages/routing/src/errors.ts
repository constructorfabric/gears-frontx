/**
 * `@gears-frontx/routing` — runtime error type.
 *
 * ADR 0003 ("Occupant Identity Lexical Rule") and FEATURE
 * (navigation-substrate) §3 (Grammar Serialize) specify a *thrown* error
 * at each of several synchronous input paths;
 * FEATURE (route-ownership-signal) §3 (URL Back-Projection Helper) adds one
 * of its own. `resolveNavigationHistory`'s own default adapter adds another,
 * via this file's `noNavigationHistoryInRealm` factory:
 * resolving the realm-shared singleton with no adapter override, in a realm
 * with no `window` at all (an SSR render, most commonly), is a recognized,
 * clearly-named failure rather than a raw `ReferenceError` reaching the
 * caller from deep inside the default `HistoryAdapter`'s own construction.
 * The re-entrancy bound both round-deferring drains share
 * (`./diagnostics.js`) adds one more: a drain that has run past that
 * bound throws rather than continuing, since an unbounded one surfaces
 * nothing at all on its own.
 * Stated without counts throughout, so that adding a code stays a matter of
 * adding its own `RoutingErrorCode` member, its own factory, and its own
 * bullet in `src/types/index.ts` — never of re-numbering prose elsewhere.
 * This module supplies the single runtime value every one of those `throw`
 * statements constructs — see `RoutingErrorCode`'s own doc comment for the
 * shapes, documented in `src/types/index.ts`.
 *
 * A single `RoutingError` class, not one subclass per code, because every
 * variant is a plain data-carrying error with no behaviour of its own beyond
 * carrying `code` plus whichever offending value(s) that code names — a
 * subclass hierarchy would add ceremony with no behavioural payoff. `code`
 * still discriminates like a tagged union's own field would; the static
 * factories below are what keeps each construction site honest about which
 * fields a given code actually populates (only the fields its own error
 * shape declares are ever set — never all of them at once).
 *
 * @packageDocumentation
 */

import type { DomainKey, Entry, ExtensionToken } from './types/index.js';

/** The codes a thrown `RoutingError` carries — see `src/types/index.ts`
 * for the field shape each one populates. */
export type RoutingErrorCode =
  | 'invalid-shell-subroute'
  | 'invalid-foreign-segment'
  | 'invalid-domain-key'
  | 'invalid-extension-token'
  | 'invalid-param-name'
  | 'duplicate-param-name'
  | 'duplicate-extension'
  | 'reordered-not-permutation'
  | 'replaced-old-extension-absent'
  | 'no-navigation-history-in-realm'
  | 'reentrant-round-limit-exceeded';

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  /** Set only for `invalid-shell-subroute` / `invalid-foreign-segment` /
   * `invalid-domain-key` / `invalid-extension-token`, and
   * for `replaced-old-extension-absent`, where it is the old extension
   * token no entry under `domainKey` carries. */
  readonly value?: string;
  /** Set for `invalid-param-name` / `duplicate-param-name`, and for
   * `invalid-domain-key` / `invalid-extension-token` only when thrown by
   * grammar serialize (FEATURE §3, Grammar Serialize, step 2.1), naming the
   * offending entry. */
  readonly entry?: Entry;
  /** Set only for `duplicate-extension`. */
  readonly entries?: readonly [Entry, Entry];
  /** Set for `reordered-not-permutation` and
   * `replaced-old-extension-absent`. */
  readonly domainKey?: DomainKey;
  /** Set only for `reordered-not-permutation`. */
  readonly reordered?: readonly ExtensionToken[];
  /** Set only for `reentrant-round-limit-exceeded` — the bound that was
   * reached, so a consumer reading this error need not know the constant to
   * report it. */
  readonly limit?: number;

  private constructor(
    code: RoutingErrorCode,
    message: string,
    extra?: {
      value?: string;
      entry?: Entry;
      entries?: readonly [Entry, Entry];
      domainKey?: DomainKey;
      reordered?: readonly ExtensionToken[];
      limit?: number;
    },
  ) {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
    this.value = extra?.value;
    this.entry = extra?.entry;
    this.entries = extra?.entries;
    this.domainKey = extra?.domainKey;
    this.reordered = extra?.reordered;
    this.limit = extra?.limit;
  }

  /**
   * A `shellSubroute` argument given to grammar serialize contains `?`, `#`,
   * or `&` — a grammar delimiter that would otherwise reparse into a
   * different, corrupted structure the instant the written URL is read back
   * (FEATURE §3, Grammar Serialize, step 0).
   */
  static invalidShellSubroute(value: string): RoutingError {
    return new RoutingError(
      'invalid-shell-subroute',
      `Invalid shell subroute (contains "?", "#", or "&"): "${value}"`,
      { value },
    );
  }

  /**
   * A `foreignSegments` entry given to grammar serialize contains `&` or
   * `#` — the same reparse hazard `invalidShellSubroute` guards against, for
   * the other input a caller building a `SerializeInput` by hand controls
   * directly: an embedded `&` splits it into an entry-or-foreign-segment
   * position it never had, and an embedded `#` moves everything after it
   * out of the query string and into the fragment (FEATURE §3, Grammar
   * Serialize, step 1).
   */
  static invalidForeignSegment(value: string): RoutingError {
    return new RoutingError(
      'invalid-foreign-segment',
      `Invalid foreign segment (contains "&" or "#"): "${value}"`,
      { value },
    );
  }

  /**
   * A `domainKey` argument failed the `domain-key` production (ADR 0003,
   * "Tokens"). `entry` is set only when this is thrown by grammar serialize,
   * which names the offending entry, not merely its `domainKey` value
   * (FEATURE §3, Grammar Serialize, step 2.1).
   */
  static invalidDomainKey(value: string, entry?: Entry): RoutingError {
    return new RoutingError('invalid-domain-key', `Invalid domain key: "${value}"`, {
      value,
      entry,
    });
  }

  /**
   * An `extension` argument failed the `name` alphabet. `entry` is set only
   * when this is thrown by grammar serialize (FEATURE §3, Grammar
   * Serialize, step 2.1; see `invalidDomainKey`).
   */
  static invalidExtensionToken(value: string, entry?: Entry): RoutingError {
    return new RoutingError(
      'invalid-extension-token',
      `Invalid extension token: "${value}"`,
      { value, entry },
    );
  }

  /**
   * A serialize-input entry carried a param whose own `name` is the empty
   * string. `param-name = 1*( pchar-safe | pct-encoded )` (ADR 0003,
   * "Tokens") requires at least one character — unlike `param-value`, which
   * the identical production allows empty — so this is not this package's
   * own added restriction, only the grammar's own rule enforced at write
   * time, the third case of the same reparse-hazard family
   * `invalidShellSubroute` and `invalidForeignSegment` guard against: an
   * unvalidated empty name would serialize to a bare `;=value` segment that
   * reparses as a malformed entry, dropped whole, the instant the written
   * URL is read back (FEATURE §3, Grammar Serialize, step 2.2).
   */
  static invalidParamName(entry: Entry): RoutingError {
    return new RoutingError(
      'invalid-param-name',
      `Entry "${entry.domainKey}=${entry.extension}" carries a param with an empty name`,
      { entry },
    );
  }

  /** A serialize-input entry carried two params of the identical `name`. */
  static duplicateParamName(entry: Entry): RoutingError {
    return new RoutingError(
      'duplicate-param-name',
      `Entry "${entry.domainKey}=${entry.extension}" carries a duplicate param name`,
      { entry },
    );
  }

  /**
   * A serialize-input list carried two entries sharing the identical
   * `domainKey` and `extension` — reached either by a caller building that
   * list directly, or by the URL back-projection helper, whose delta named
   * a token the current location already carries under that domain key.
   */
  static duplicateExtension(entries: readonly [Entry, Entry]): RoutingError {
    return new RoutingError(
      'duplicate-extension',
      `Duplicate entry "${entries[0].domainKey}=${entries[0].extension}"`,
      { entries },
    );
  }

  /**
   * A back-projection call's own `reordered` list is not exactly a
   * permutation of `domainKey`'s own entries surviving the delta's other
   * operations — missing a survivor, naming an extra token, or naming one
   * twice.
   */
  static reorderedNotPermutation(
    domainKey: DomainKey,
    reordered: readonly ExtensionToken[],
  ): RoutingError {
    return new RoutingError(
      'reordered-not-permutation',
      `"${domainKey}" back-projection reordered list is not a permutation of its surviving entries: [${reordered.join(', ')}]`,
      { domainKey, reordered },
    );
  }

  /**
   * A back-projection call's own `replaced` pair named an `oldExtension`
   * that no entry under `domainKey` currently carries. `replaced` exists to
   * stand a new entry at an old entry's *own position*; with no such entry
   * there is no such position, so the operation the pair asks for cannot be
   * performed at all. Appending the new entry instead would silently turn
   * the pair into an `added` and put it at the end of the full list — the
   * entry order `replaced` was introduced to stop producing.
   *
   * `domainKey` and `value` together say exactly what is missing: there is
   * no entry `value` under `domainKey`. That is what a consumer acts on —
   * re-read the live entry list, recompute the delta against it, and call
   * again naming the operation that list actually admits (an `added` for a
   * position that does not yet exist).
   */
  static replacedOldExtensionAbsent(
    domainKey: DomainKey,
    oldExtension: ExtensionToken,
  ): RoutingError {
    return new RoutingError(
      'replaced-old-extension-absent',
      `"${domainKey}" back-projection replaced pair names old extension "${oldExtension}", which no entry under that domain key currently carries — there is no position to stand the new entry at`,
      { domainKey, value: oldExtension },
    );
  }

  /**
   * `resolveNavigationHistory` was called with no adapter override in a
   * realm carrying no `window` at all (an SSR render, most commonly) — the
   * default `HistoryAdapter` has no browser API to construct itself over.
   * Thrown instead of letting a raw `ReferenceError: window is not defined`
   * surface from deep inside that construction, so an SSR caller gets a
   * recognizable, `instanceof RoutingError` failure naming the actual cause
   * instead of an unrelated-looking crash.
   */
  static noNavigationHistoryInRealm(): RoutingError {
    return new RoutingError(
      'no-navigation-history-in-realm',
      'resolveNavigationHistory() was called with no adapter override in a realm with no `window` — pass an explicit HistoryAdapter (an SSR-safe one, or a test double) instead of relying on the default browser adapter.',
    );
  }

  /**
   * A re-entrancy drain ran `limit` consecutive rounds without the queue
   * ever emptying — a callback that navigates, or mutates a
   * registered-extensions source, every single time it is notified, feeding
   * the drain a fresh round for each one it completes.
   *
   * Thrown rather than reported and swallowed, because the alternative is
   * the behaviour this bound exists to end: the drain is a loop, not a
   * recursion, so an unbounded one produces no stack overflow and no error
   * of any kind — the realm simply stops making progress, indefinitely,
   * with nothing to see. `site` names which drain reached the bound so the
   * consumer knows which of its own callbacks to look at.
   */
  static reentrantRoundLimitExceeded(site: string, limit: number): RoutingError {
    return new RoutingError(
      'reentrant-round-limit-exceeded',
      `${site}: ${String(limit)} consecutive deferred rounds ran without the queue emptying — a callback is triggering a new round every time it is notified. The queue was abandoned to end the loop.`,
      { limit },
    );
  }
}
