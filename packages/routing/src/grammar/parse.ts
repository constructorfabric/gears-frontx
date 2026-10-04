/**
 * Grammar Parse — `cpt-frontx-algo-routing-navigation-substrate-grammar-parse`.
 *
 * FEATURE (navigation-substrate) §3, "Grammar Parse"; ADR 0003, "URL
 * Grammar" / "Entry" / "Repetition and order".
 */
import { reportRoutingDefect } from '../diagnostics.js';
import type {
  DomainKey,
  Entry,
  ExtensionToken,
  Param,
  ParseGrammar,
  ParseWarning,
} from '../types/index.js';
import { validateName } from './name.js';
import { decodePercent } from './percent-codec.js';

// @cpt-algo:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1
// @cpt-dod:cpt-frontx-dod-routing-navigation-substrate-shared-history:p1
export const parseGrammar: ParseGrammar = (input) => {
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-split-url
  let shellSubroute: string;
  let search: string;
  let hash: string | undefined;
  if (typeof input === 'string') {
    const hashIndex = input.indexOf('#');
    const beforeHash = hashIndex === -1 ? input : input.slice(0, hashIndex);
    hash = hashIndex === -1 ? undefined : input.slice(hashIndex + 1);
    const queryIndex = beforeHash.indexOf('?');
    if (queryIndex === -1) {
      shellSubroute = beforeHash;
      search = '';
    } else {
      shellSubroute = beforeHash.slice(0, queryIndex);
      search = beforeHash.slice(queryIndex + 1);
    }
  } else {
    shellSubroute = input.shellSubroute;
    search = input.search;
    hash = input.hash;

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-normalize-split-delimiters
    // The already-split form takes the query string and the fragment, not
    // the `?` and `#` that introduce them — the string form above consumes
    // both delimiters, and this branch is specified to receive the halves
    // that splitting produces. `window.location.search`/`.hash` carry the
    // delimiter by DOM convention, so a `HistoryAdapter` written against
    // that convention and passing either value straight through hands one
    // over. Before this, a `?` arriving here survived the `&` split into
    // the first raw entry, made its candidate domain key `?screen` fail the
    // `domain-key` production, and sent the whole segment down the
    // "plainly foreign" branch below — every route in that query string
    // lost, no entry, no warning, nothing. Stripped rather than rejected
    // because parsing never throws (FEATURE §3, Grammar Parse, Output) and
    // an adapter's own convention mismatch must not blank out a deep link a
    // person actually opened; reported rather than stripped quietly because
    // the adapter is genuinely wrong and its author is the only one who can
    // fix it.
    if (search.startsWith('?')) {
      reportRoutingDefect(
        'a query string was given to the grammar parser with its leading "?" still attached; a HistoryAdapter reports `search` without it (the shape `window.location.search` carries, minus the delimiter). Parsing continued on the stripped value.',
      );
      search = search.slice(1);
    }
    if (hash?.startsWith('#') === true) {
      reportRoutingDefect(
        'a fragment was given to the grammar parser with its leading "#" still attached; a HistoryAdapter reports `hash` without it. Parsing continued on the stripped value.',
      );
      hash = hash.slice(1);
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-normalize-split-delimiters
  }

  // A present-but-empty hash (`Location.hash` is `''`, never `undefined`,
  // when the current URL carries no fragment at all — the `Location`
  // contract type has no way to represent "absent") is normalized to
  // `undefined` here, the single point this package draws that line, so
  // Grammar Serialize's own `hash !== undefined` check never re-adds a bare
  // trailing `#` to a URL that never had one.
  if (hash === '') {
    hash = undefined;
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-split-url

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-empty-query
  if (search === '') {
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-return-empty
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-copy-verbatim
    return { shellSubroute, hash, entries: [], foreignSegments: [], warnings: [] };
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-copy-verbatim
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-return-empty
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-empty-query

  const entries: Entry[] = [];
  // A segment that never becomes an `Entry` because it does not parse as one
  // at all is not this package's own business (ADR 0003, "Repetition and
  // order") — kept verbatim here, in encounter order, rather than lost the
  // way an earlier revision of this algorithm discarded it. A segment
  // dropped for colliding with an earlier one under the same domain key
  // (`duplicate-extension`) is not pushed here — it *did* parse as an entry.
  const foreignSegments: string[] = [];
  const warnings: ParseWarning[] = [];

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-split-entries
  const rawEntries = search.split('&');
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-split-entries

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-foreach-raw-entry
  for (const rawEntry of rawEntries) {
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-skip-empty-raw-entry
    if (rawEntry === '') {
      continue;
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-skip-empty-raw-entry

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-split-on-semicolon
    const [head, ...paramSegments] = rawEntry.split(';');
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-split-on-semicolon

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-malformed-head
    const headEquals = head.indexOf('=');
    const candidateDomainKey = headEquals === -1 ? '' : head.slice(0, headEquals);
    const candidateExtension = headEquals === -1 ? '' : head.slice(headEquals + 1);

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-plainly-foreign
    // Plainly not an entry — no `=` at all, or a candidate domain key that
    // fails the `domain-key` production outright: `domain-key = name`, so a
    // token outside the `name` alphabet (a `.`-composed key among them) fails
    // it. This is the line ADR 0003 draws between "not this package's own
    // business" (kept, no warning) and "looks like an entry" (warned,
    // below): a bare `utm_source=news` fails here on its key alone, so it is
    // never even a candidate for the malformed-entry warning — and neither
    // is a dotted key like `screen.app.panel=x`, which fails the
    // `domain-key` production exactly the same way a bare foreign parameter
    // does.
    if (headEquals === -1 || !validateName(candidateDomainKey)) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-keep-foreign
      foreignSegments.push(rawEntry);
      continue;
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-keep-foreign
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-plainly-foreign

    if (!validateName(candidateExtension)) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-entry-candidate-shape
      // A domain key with no `;` parameters is exactly as shaped as a
      // foreign `key=value` pair (ADR 0003, "Repetition and order") —
      // nothing at this layer tells `page=2` apart from a real occupant's
      // malformed extension. `parseGrammar` is never handed the caller's
      // registered domain names (its signature is `string | { shellSubroute,
      // search, hash }` — see the algorithm type and every call site), so it
      // cannot ask "is this key one of mine" and does not invent a channel
      // to do so. It warns only when the shape is unmistakable on its own:
      // the raw segment carries `;` parameters. That shape could not
      // plausibly be an unrelated query parameter, so a broken extension
      // under it still warns below; a bare single-segment key is foreign,
      // silently, however invalid its extension looks.
      const isEntryCandidate = paramSegments.length > 0;
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-entry-candidate-shape

      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-malformed
      // A valid-looking domain key with an invalid extension token still
      // looks enough like an entry to warn about, unlike the plainly
      // foreign case above — dropped from `entries`, warned when its shape
      // is unmistakably ours, and kept verbatim as a foreign segment on the
      // same terms as one either way.
      if (isEntryCandidate) {
        warnings.push({ code: 'malformed-entry', rawEntry });
      }
      foreignSegments.push(rawEntry);
      continue;
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-malformed
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-malformed-head

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-set-domain-key-extension
    const domainKey = candidateDomainKey as DomainKey;
    const extension = candidateExtension as ExtensionToken;
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-set-domain-key-extension

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-duplicate-extension
    if (entries.some((entry) => entry.domainKey === domainKey && entry.extension === extension)) {
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-duplicate-extension
      warnings.push({ code: 'duplicate-extension', rawEntry });
      continue;
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-duplicate-extension
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-duplicate-extension

    const params: Param[] = [];
    // Set by either abandonment rule in the param loop below — a broken
    // escape or a name that decoded to nothing; both abandon this entry
    // whole, and both report it the same way.
    let entryAbandoned = false;
    // Snapshot of `warnings` before this entry's own param loop runs, so an
    // abandonment below can roll back any per-param warning (duplicate-
    // parameter) this same entry already recorded — "abandoning whatever
    // params of this entry were already collected" applies to a warning
    // already emitted for this entry exactly as it applies to a collected
    // param.
    const warningsBeforeThisEntry = warnings.length;

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-foreach-param-segment
    for (const segment of paramSegments) {
      // A segment with no `=` (bare param, step 5.5.1) and a segment with one
      // (keyed param, step 5.5.2) share this single split: each ternary's
      // "no `=`" branch is the bare case, its "has `=`" branch the keyed one.
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-bare-param
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-keyed-param
      const segmentEquals = segment.indexOf('=');
      const rawName = segmentEquals === -1 ? segment : segment.slice(0, segmentEquals);
      const rawValue = segmentEquals === -1 ? '' : segment.slice(segmentEquals + 1);
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-keyed-param
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-bare-param

      // decode-once (`inst-decode-once`) lives in decodePercent.
      const decodedName = decodePercent(rawName);
      const decodedValue = decodePercent(rawValue);

      // Two independent rules abandon the whole entry at the same point and
      // by the same means, so they share one flag and one `break`: a
      // malformed escape or invalid UTF-8 on either side
      // (`inst-if-malformed-escape`), and a name that decoded to nothing
      // (`inst-if-empty-param-name`). Each keeps its own marker pair around
      // the condition it owns.
      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-malformed-escape
      const escapeBroken = decodedName === null || decodedValue === null;
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-malformed-escape

      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-empty-param-name
      // `param-name = 1*( pchar-safe | pct-encoded )` requires at least one
      // character, while the otherwise identical `param-value` production
      // admits the empty string (ADR 0003, "Tokens") — which is why `;k` and
      // `;k=` are both well-formed while `;;`, a trailing `;`, and `;=x` are
      // not.
      const nameEmpty = decodedName === '';
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-empty-param-name

      if (escapeBroken || nameEmpty) {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-malformed-escape
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-empty-param-name
        entryAbandoned = true;
        break;
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-empty-param-name
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-malformed-escape
      }

      // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-duplicate-param
      const existingIndex = params.findIndex((param) => param.name === decodedName);
      if (existingIndex !== -1) {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-overwrite-duplicate-param
        params[existingIndex] = { name: decodedName, value: decodedValue };
        warnings.push({ code: 'duplicate-parameter', rawEntry });
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-overwrite-duplicate-param
      } else {
        // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-append-param
        params.push({ name: decodedName, value: decodedValue });
        // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-append-param
      }
      // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-if-duplicate-param
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-foreach-param-segment

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-malformed-escape
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-empty-param-name
    if (entryAbandoned) {
      // Roll back any per-param warning already recorded for this entry
      // before reporting the single "malformed entry" warning that replaces
      // them — the actual drop both instructions name, not merely the
      // flag+break above that detects either condition.
      warnings.length = warningsBeforeThisEntry;
      warnings.push({ code: 'malformed-entry', rawEntry });
      // This entry's own head looked valid but a param broke the entry
      // rules further in — kept verbatim as a foreign segment, on the same
      // terms as any other segment that warns malformed-entry (see
      // inst-drop-malformed above).
      foreignSegments.push(rawEntry);
      continue;
    }
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-empty-param-name
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-drop-entry-malformed-escape

    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-append-entry
    entries.push({ domainKey, extension, params });
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-append-entry
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-foreach-raw-entry

  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-return-parsed
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-copy-verbatim
  return { shellSubroute, hash, entries, foreignSegments, warnings };
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-copy-verbatim
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-grammar-parse:p1:inst-return-parsed
};
