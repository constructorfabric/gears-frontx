/**
 * Grammar Serialize — `cpt-frontx-algo-routing-navigation-substrate-grammar-serialize`.
 *
 * FEATURE (navigation-substrate) §3, "Grammar Serialize"; ADR 0003, "URL
 * Grammar" / "Entry".
 */
import { RoutingError } from '../errors.js';
import type { SerializeGrammar } from '../types/index.js';
import { isValidDomainKey, validateName } from './name.js';
import { encodePercent } from './percent-codec.js';

// @cpt-algo:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1
// @cpt-dod:cpt-frontx-dod-routing-navigation-substrate-shared-history:p1
export const serializeGrammar: SerializeGrammar = (input) => {
  const { shellSubroute, hash, entries } = input;
  // `foreignSegments` is optional on `SerializeInput` (unlike `ParseResult`,
  // which always produces it): a caller building a `SerializeInput` by hand
  // for a URL with nothing foreign in it has no list to supply, and
  // shouldn't have to invent an empty one just to satisfy the type.
  const foreignSegments = input.foreignSegments ?? [];

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-shell-subroute
  // A shell subroute produced by grammar parse can never contain one of
  // these three grammar delimiters — parse cuts it off at the first `?`, so
  // `#`/`&` can only ever appear after that cut. This check exists for the
  // caller building a `SerializeInput` by hand: writing one of these
  // characters through unvalidated would reparse into a different, silently
  // corrupted structure the instant the URL is read back (the shell
  // subroute swallowing the query, or the query gaining an extra entry it
  // never had) rather than surfacing the caller's own mistake immediately.
  if (/[?#&]/.test(shellSubroute)) {
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-shell-subroute
    throw RoutingError.invalidShellSubroute(shellSubroute);
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-shell-subroute
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-shell-subroute

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-foreign-segment-validate
  // Same reparse hazard as the shell-subroute check above, for the other
  // input a hand-built `SerializeInput` controls directly: a foreign
  // segment produced by grammar parse can never contain `&` or `#` (parse
  // only ever collects a segment already split on `&`, with any `#`
  // already cut off into the hash), so this rejects only a caller-built
  // segment that would otherwise reparse into an extra entry-or-foreign
  // position (`&`) or bleed into the fragment (`#`) the instant the
  // written URL is read back.
  for (const segment of foreignSegments) {
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-foreign-segment
    if (/[&#]/.test(segment)) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-foreign-segment
      throw RoutingError.invalidForeignSegment(segment);
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-foreign-segment
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-foreign-segment
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-foreign-segment-validate

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-entry-validate
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-tokens
    if (!isValidDomainKey(entry.domainKey)) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-tokens
      throw RoutingError.invalidDomainKey(entry.domainKey, entry);
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-tokens
    }
    if (!validateName(entry.extension)) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-tokens
      throw RoutingError.invalidExtensionToken(entry.extension, entry);
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-tokens
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-tokens

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-param-name
    // `param-name = 1*( pchar-safe | pct-encoded )` (ADR 0003, "Tokens")
    // requires at least one character — `param-value`'s own identical
    // production allows empty, so this check is deliberately name-only. An
    // unvalidated empty name would serialize to a bare `;=value` segment
    // that reparses as a malformed entry, dropped whole, the instant the
    // written URL is read back — the third case of the same reparse-hazard
    // family step 0 (shell subroute) and step 1 (foreign segment) already
    // guard.
    for (const param of entry.params) {
      if (param.name === '') {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-param-name
        throw RoutingError.invalidParamName(entry);
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-invalid-param-name
      }
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-invalid-param-name

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-duplicate-param-name
    const seenParamNames = new Set<string>();
    for (const param of entry.params) {
      if (seenParamNames.has(param.name)) {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-duplicate-param
        throw RoutingError.duplicateParamName(entry);
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-duplicate-param
      }
      seenParamNames.add(param.name);
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-duplicate-param-name

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-duplicate-extension-serialize
    // Index-based scan (`j < i`), not a reference-identity check against
    // `entry` — the input list may legitimately carry the identical `Entry`
    // object at two positions (e.g. a back-projection reorder that reused
    // one survivor object), and a reference-identity check would skip
    // straight past every earlier element without ever comparing them.
    for (let j = 0; j < i; j += 1) {
      const earlier = entries[j];
      if (earlier.domainKey === entry.domainKey && earlier.extension === entry.extension) {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-duplicate-extension
        throw RoutingError.duplicateExtension([earlier, entry]);
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-throw-duplicate-extension
      }
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-duplicate-extension-serialize
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-entry-validate

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-entry-build
  const entryTexts = entries.map((entry) => {
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-build-head
    let text = `${entry.domainKey}=${entry.extension}`;
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-build-head

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-param-build
    for (const param of entry.params) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-param-name
      text += `;${encodePercent(param.name)}`;
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-param-name

      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-nonempty-value
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-bare
      if (param.value !== '') {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-param-value
        text += `=${encodePercent(param.value)}`;
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-param-value
      }
      // else: append nothing further — a bare name is already a complete,
      // empty-valued param once no `=` was appended. Co-located with the
      // enclosing `if`: the branch this step names has no code of its own
      // beyond falling through.
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-bare
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-nonempty-value
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-param-build

    return text;
  });
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-foreach-entry-build

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-join-entries
  const joinedEntries = entryTexts.join('&');
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-join-entries

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-foreign-segments
  // Foreign segments re-emit after every entry, in their own canonical
  // order, then in their own original relative order among themselves —
  // not interleaved with entries the way the source query string may have
  // had them (ADR 0003, "Repetition and order"): once parse separates
  // entries from foreign segments into two lists, this package no longer
  // tracks their original interleaving, and reconstructing it would mean
  // threading position information through every entries-array
  // transformation the back-projection helper performs, for a guarantee
  // (exact original interleaving) neither the FEATURE nor any consumer
  // needs — only exact content preservation, which this placement rule
  // already delivers, including a byte-exact round trip for a query string
  // that carries no entries at all.
  const joined = [joinedEntries, ...foreignSegments].filter((part) => part !== '').join('&');
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-append-foreign-segments

  // `hash !== undefined && hash !== ''` (not just `!== undefined`) at both
  // return sites below: parse always normalizes an empty hash to
  // `undefined` before it ever reaches serialize (see `parse.ts`), but a
  // caller building `SerializeInput` directly — never routed through
  // parse — could still pass `{ hash: '' }`; without this guard that would
  // write a bare trailing `#` for a URL that carries no fragment at all.
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-zero-entries
  if (entries.length === 0 && foreignSegments.length === 0) {
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-return-bare-subroute
    return hash !== undefined && hash !== '' ? `${shellSubroute}#${hash}` : shellSubroute;
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-return-bare-subroute
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-if-zero-entries

  // Reached only when the zero-entries branch above did not return — the
  // implicit else of step 5.
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-else-nonzero-entries
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-return-full-url
  return hash !== undefined && hash !== ''
    ? `${shellSubroute}?${joined}#${hash}`
    : `${shellSubroute}?${joined}`;
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-return-full-url
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-serialize:p1:inst-else-nonzero-entries
};
