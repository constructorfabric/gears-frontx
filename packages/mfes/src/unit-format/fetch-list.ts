/**
 * Shared-dependency unit format contract — the single TypeScript typing
 * source for the unit table and the flat fetch lists a producing build
 * records in the registered manifest and the runtime reads
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-adr-shared-dep-reuse`).
 *
 * The manifest holds each shared chunk once, in its unit table `units`,
 * and one precomputed flat fetch list per exposed module and per lazy
 * target in `lists`. A list references units by content identity, so the
 * runtime requests every unit missing from the realm text cache together
 * with the entry module in one round, then mints per load in dependency
 * order. There is no runtime graph discovery.
 *
 * The unit table and the lists are fields of the closed manifest
 * contract: the type system validates them with the manifest when it is
 * registered, and the runtime trusts the declared content identities.
 *
 * @packageDocumentation
 */

/**
 * One import edge a chunk carries, recorded so dependency-order minting
 * needs no edge derived from source text at mint time. A bare specifier
 * (`'react'`, `'react/jsx-runtime'`, `'@scope/pkg/feature'`) records an
 * external edge answered by the unit whose `answers` name it; an
 * intra-package relative edge — a chunk importing a sibling module of
 * the same package that lives in another unit — is recorded resolved, as
 * the content identity of the unit that supplies it.
 */
export type SharedDepImportEdge =
  | string
  | {
      /**
       * Resolved intra-package edge: the `contentHash` of the unit in the
       * unit table that supplies the imported module.
       */
      unit: string;
    };

/**
 * One shared chunk of the manifest's unit table — one file the runtime
 * fetches, admits and mints for a load. Units are referenced by content
 * identity: two lists naming the same `contentHash` name the same bytes
 * and share one realm-cache entry (`cpt-frontx-adr-shared-dep-cache-reach`).
 */
export interface SharedDepUnit {
  /**
   * Location of the chunk's emitted source: a path relative to the shared
   * base location, or an absolute `http(s)` URL — the URL the unit is
   * fetched from.
   */
  location: string;
  /**
   * Content identity (SHA-256 hex digest, 64 lowercase hex characters)
   * of the chunk's bytes. The fetched text is admitted to the realm
   * cache as fetched, and reuse is keyed on this identity.
   */
  contentHash: string;
  /**
   * The specifiers this chunk answers: every bare specifier — package
   * names and subpaths alike — whose import resolves to a module this
   * chunk's minted exports provide. A specifier appearing in any unit's
   * `imports` is answered by exactly one unit on the combined lists of
   * the module or target and its parent chain.
   */
  answers: string[];
  /**
   * The import edges this chunk carries — every edge the runtime needs
   * for dependency-order minting (see {@link SharedDepImportEdge}).
   */
  imports: SharedDepImportEdge[];
}

/**
 * One flat fetch list — an exposed module's or a lazy target's. The
 * exposed module's list names every shared unit the module reaches; each
 * literal dynamic-import target and each pattern-import match has a list
 * of its own, held once in the manifest's `lists` under the target's chunk
 * location and holding only what the target needs beyond its parent
 * chain's lists. A list names the lazy and pattern lists it reaches by
 * those keys.
 */
export interface SharedDepFetchList {
  /**
   * The content identities of the units this list delivers, each held by
   * the manifest's unit table, precomputed at build time so the runtime
   * requests the missing ones in one round. Order carries no meaning;
   * dependency order is derived at mint time from each unit's `imports`
   * and `answers`.
   */
  units: string[];
  /**
   * Every one of the microfrontend's own chunks the exposed module or
   * lazy target reaches statically — each a path relative to
   * `metaData.publicPath` or an absolute `http(s)` URL, with no content
   * identity because own chunks are not shared.
   */
  ownChunks: string[];
  /**
   * Lazy-target lists: for every literal dynamic-import target in the
   * code this list covers, the key in the manifest's `lists` of the
   * target's own list — the target's chunk location relative to the base
   * that chunk resolves against: `metaData.publicPath` for an own chunk,
   * the shared base for a shared unit.
   */
  lazy?: string[];
  /**
   * Pattern-import lists: for a dynamic import whose argument is a
   * statically bounded pattern, the keys in `lists` of one list per file
   * matching the pattern, under the same base rule as `lazy`.
   */
  patterns?: string[];
}
