/**
 * Shared-dependency unit format contract — the single TypeScript typing
 * source for the content-addressed graph file that describes one
 * `package@version` of shared-dependency output.
 *
 * Graph files are type-system-neutral JSON build artifacts: these interfaces
 * are their only typing source and no graph schema exists in any type system
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-mfe-asset-discovery`).
 * The runtime performs no structural validation of graph files — trust rests
 * on hash verification plus build-time conformance — and reads the fields it
 * needs at the point of use.
 *
 * @packageDocumentation
 */

/**
 * The unit mode a package's graph file records: whether the package is split
 * into one unit per strongly connected component of its own module graph, or
 * delivered as a single unit (`cpt-frontx-adr-shared-dep-reuse`).
 */
export type SharedDepUnitMode = 'units' | 'single';

/**
 * One unit within a shared package's graph file — one strongly connected
 * component of the package's own module graph (usually a single module, or
 * the whole cycle when the module is part of an import cycle). A unit's
 * identity is `package@version` plus the module path or paths it contains
 * (`cpt-frontx-adr-shared-dep-reuse`).
 */
export interface SharedDepGraphUnit {
  /**
   * Content identity (SHA-256 hex digest, 64 lowercase hex characters) of the
   * unit's emitted source. Every fetched unit is verified against this before
   * it is used or cached.
   */
  contentHash: string;
  /**
   * Module path or paths belonging to this unit within the package.
   */
  modulePaths: string[];
  /**
   * Bare imports this unit keeps external — package names the unit imports by
   * bare specifier. Every bare import a unit keeps external resolves only
   * from the loading microfrontend's own declarations.
   */
  bareImports: string[];
  /**
   * Relative imports this unit carries — paths to other units of the same
   * package, resolved against the unit's member module paths.
   */
  relativeImports: string[];
  /**
   * Location of the unit's emitted source: a path relative to the package's
   * shared base location, or an absolute URL.
   */
  location: string;
}

/**
 * An optional whole-package pack in the graph file — the whole package
 * emitted as one file, with its own content identity. The runtime may fetch
 * a package's pack instead of its units where the per-unit strategy does not
 * meet the load-time budget (`cpt-frontx-adr-mfe-asset-discovery`).
 */
export interface SharedDepGraphPack {
  /**
   * Content identity (SHA-256 hex digest) of the whole-package pack.
   */
  contentHash: string;
  /**
   * Location of the pack's emitted source: a path relative to the package's
   * shared base location, or an absolute URL.
   */
  location: string;
  /**
   * Bare imports the pack keeps external — package names the pack imports by
   * bare specifier. Absent when the pack is fully self-contained.
   */
  bareImports?: string[];
}

/**
 * The producer that emitted a graph file and its units, recorded for runtime
 * diagnostics and for error messages that name the producer behind a file
 * (`cpt-frontx-adr-shared-dep-reuse`).
 */
export interface SharedDepGraphProducer {
  /** Producer name (e.g. the build tool that emitted the units). */
  name: string;
  /** Producer version. */
  version: string;
}

/**
 * The graph file for one `package@version` — one content-addressed JSON
 * document expressing the package's units, their content identities, their
 * bare and relative imports, the package-level `requires`, the unit mode,
 * the producer and its version, and, optionally, a whole-package pack with
 * its own content identity (`cpt-frontx-adr-shared-dep-reuse`,
 * `cpt-frontx-adr-mfe-asset-discovery`).
 */
export interface SharedDepGraphFile {
  /** Package name, matching the manifest's `shared[].name`. */
  name: string;
  /** Package version, matching the manifest's `shared[].version`. */
  version: string;
  /**
   * Unit mode: `'units'` when the package is split into one unit per strongly
   * connected component, `'single'` when delivered as a single unit.
   */
  unitMode: SharedDepUnitMode;
  /**
   * Why the package carries its unit mode — the fallback reason when the
   * package could not be split or its barrel could not be skipped. Recorded
   * for runtime diagnostics; fallback is automatic and never a build failure.
   */
  fallbackReason?: string;
  /**
   * The units of the package. One per strongly connected component of the
   * package's own module graph.
   */
  units: SharedDepGraphUnit[];
  /**
   * Package-level bare requirements: every bare import the package's units
   * keep external, declared as package names. Entries are bare package names
   * (e.g. `'react'`, `'@scope/pkg'`), not subpath specifiers.
   */
  requires?: string[];
  /**
   * The module path of the package's main entry — the module a bare import
   * of the package name resolves to. Absent when the main entry is not
   * derivable at graph-file time; the runtime falls back to the first unit.
   */
  mainModulePath?: string;
  /**
   * Optional whole-package pack, with its own content identity.
   */
  pack?: SharedDepGraphPack;
  /**
   * The producer that emitted this graph file and its units, and its
   * version.
   */
  producer?: SharedDepGraphProducer;
}
