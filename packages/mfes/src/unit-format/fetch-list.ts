/**
 * Shared-dependency fetch-list contract — the single TypeScript typing
 * source for the per-entry flat fetch lists a producing build emits and
 * the runtime reads
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-adr-shared-dep-reuse`).
 *
 * Each build emits one precomputed flat fetch list per entry — each
 * expose, each lazy target, the shell boot. A list names every shared
 * chunk the entry needs up front: the runtime reads the list (from the
 * manifest, or from boot data embedded in the shell boot chunk),
 * fetches every item missing from the realm text cache in one parallel
 * batch, then mints per load in dependency order. There is no runtime
 * graph discovery.
 *
 * Fetch-list documents are type-system-neutral JSON build artifacts:
 * these interfaces are their only typing source and no list schema
 * exists in any type system. The runtime performs no structural
 * validation of a list — trust rests on hash verification plus
 * build-time conformance — and reads the fields it needs at the point
 * of use.
 *
 * @packageDocumentation
 */

import type { SharedDepGraphProducer } from './graph-file';

/**
 * A content-addressed file reference: the location a document is fetched
 * from and the SHA-256 it is verified against. Carried by a list
 * document wherever it names a dependent list document, and by the
 * manifest wherever it names an entry's list document — the same
 * location/identity pair the manifest's graph-file reference uses.
 */
export interface SharedDepFileRef {
  /**
   * Location of the document: a path relative to the manifest's shared
   * base location (`metaData.sharedBase`, or the asset base
   * `metaData.publicPath` when no shared base is given), or an absolute
   * `http(s)` URL.
   */
  location: string;
  /**
   * Content identity (SHA-256 hex digest, 64 lowercase hex characters)
   * of the document's bytes. Every fetched document is verified against
   * this before it is used or cached.
   */
  contentHash: string;
}

/**
 * One shared chunk on a fetch list — one file the runtime fetches,
 * verifies and mints for the load. Items are listed by content identity:
 * two lists naming the same `contentHash` name the same bytes and share
 * one realm-cache entry (`cpt-frontx-adr-shared-dep-cache-reach`).
 */
export interface SharedDepListItem {
  /**
   * Location of the chunk's emitted source: a path relative to the
   * shared base location, or an absolute `http(s)` URL — the URL the
   * item is fetched from.
   */
  location: string;
  /**
   * Content identity (SHA-256 hex digest, 64 lowercase hex characters)
   * of the chunk's bytes. The fetched text is verified against this
   * before it is used or admitted to the realm cache, and reuse is
   * keyed on it.
   */
  contentHash: string;
  /**
   * The specifiers this chunk answers: every bare specifier — package
   * names and subpaths alike (`'react'`, `'react/jsx-runtime'`,
   * `'@scope/pkg/feature'`) — whose import resolves to a module this
   * chunk's minted exports provide. A specifier appearing in any item's
   * `imports` is answered by exactly one item on the entry's combined
   * lists; the build-time list-completeness gate checks that closure.
   */
  answers: string[];
  /**
   * The import edges this chunk carries: every bare specifier the
   * chunk's source imports. At mint time each specifier is rewritten to
   * the item that answers it — a chunk already minted in the same load
   * when its `contentHash` matched an earlier item, otherwise minted in
   * dependency order.
   */
  imports: string[];
}

/**
 * A report entry for a fully opaque dynamic import — an `import(expr)`
 * whose argument is not a literal and not a statically bounded pattern.
 * Such a call stays native at runtime, never fails the build, and is
 * reported so the emitting build's report lists it with file and line.
 */
export interface SharedDepOpaqueImport {
  /**
   * The emitted file carrying the call, as a location relative to the
   * shared base.
   */
  file: string;
  /** The 1-based line of the `import(` call inside `file`. */
  line: number;
  /** The argument's source text, when the producer can record it. */
  expression?: string;
}

/**
 * One entry's flat fetch list — the type-system-neutral JSON document a
 * producing build emits per entry and the runtime reads at the point of
 * use. The entry's own document lists every shared chunk the entry
 * reaches directly; each literal dynamic-import target and each
 * pattern-import match the entry carries gets its own document holding
 * only what the target needs beyond its parent chain's lists, referenced
 * here by location and content identity.
 */
export interface SharedDepFetchList {
  /**
   * The flat item list: every shared chunk this entry's list delivers,
   * precomputed at build time so the runtime fetches them in one
   * parallel batch. Order carries no meaning; dependency order is
   * derived at mint time from each item's `imports` and `answers`.
   */
  items: SharedDepListItem[];
  /**
   * Lazy-target lists: for every literal dynamic-import target in the
   * code this list covers — an MFE lazy chunk, a shell lazy chunk, a
   * literal `import()` inside a shared chunk — the reference to that
   * target's own {@link SharedDepFetchList} document, holding only what
   * the target needs beyond its parent chain's lists. Keyed by the lazy
   * target's chunk location relative to the shared base. On first use
   * the target's list is fetched and its missing items are fetched in
   * one parallel batch and minted into the same load; concurrent
   * resolutions of one target are deduplicated.
   */
  lazy?: Record<string, SharedDepFileRef>;
  /**
   * Pattern-import lists: for a dynamic import whose argument is a
   * statically bounded pattern (a template literal with a fixed prefix
   * and suffix, e.g. ``import(`./locales/${lang}.json`)``), one list
   * document per file matching the pattern, keyed by the matching
   * file's location relative to the shared base. At runtime the call is
   * resolved to its concrete file and that file's list is fetched like
   * a lazy target's.
   */
  patterns?: Record<string, SharedDepFileRef>;
  /**
   * Opaque-import report entries: every fully opaque `import(expr)`
   * call site in the code this list covers, recorded with file and
   * line. The call itself stays native and is not fetched through the
   * cache.
   */
  opaqueImports?: SharedDepOpaqueImport[];
  /**
   * The producer that emitted this list, recorded for runtime
   * diagnostics and for error messages that name the producer behind a
   * document.
   */
  producer?: SharedDepGraphProducer;
}

/**
 * The manifest-side record carrying each entry's fetch-list document:
 * keyed by the exposed module name (e.g. `'./lifecycle'`), each value
 * the location and content identity of that entry's
 * {@link SharedDepFetchList} document. This is the shape of the manifest
 * field that carries the lists (`cpt-frontx-adr-shared-dep-reuse`).
 */
export type SharedDepEntryListRefs = Record<string, SharedDepFileRef>;

/**
 * The shell boot data embedded in the shell boot chunk: the shell's own
 * boot {@link SharedDepFetchList} — with its lazy-target and
 * pattern-import lists nested in the usual way — carried inline because
 * the shell emits no manifest. The boot chunk imports the unit loader
 * from `@gears-frontx/mfes/unit-loader` and loads the shell's shared set
 * through it exactly as a microfrontend load does
 * (`cpt-frontx-adr-shared-dep-reuse`).
 */
export interface SharedDepBootData {
  /** The shell boot entry's inline fetch list. */
  list: SharedDepFetchList;
}
