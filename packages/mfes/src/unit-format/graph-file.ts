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
 *
 * A unit's emitted source MAY carry a dynamic `import(...)` with a
 * literal specifier: at mint time the runtime rewrites each literal
 * `import()` whose target resolves to a unit — a relative module of the
 * same package or a shared package/subpath — into the per-load lazy
 * resolver that fetches, verifies and mints the target unit on demand.
 * A non-literal call (`import(expr)`) passes through untouched, and the
 * producer records each dynamic specifier in the optional
 * `dynamicImports` field so the conformance suite can check that each
 * resolves.
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
   * Bare specifiers this unit imports, exactly as written — package names
   * and subpaths alike (`'react'`, `'react/jsx-runtime'`,
   * `'@scope/pkg/feature'`). Optional, for backward compatibility: when
   * present, the runtime follows each specifier to the unit it names (an
   * imported subpath reaches that subpath's entry unit, not only the
   * package's main unit); when absent, it follows `bareImports` to each
   * package's main unit. Every specifier's package name is listed in
   * `bareImports`.
   */
  bareSpecifiers?: string[];
  /**
   * Relative imports this unit carries — paths to other units of the same
   * package, resolved against the unit's member module paths.
   */
  relativeImports: string[];
  /**
   * Specifiers this unit imports dynamically through literal
   * `import('<specifier>')` calls — relative module paths and bare
   * specifiers alike, exactly as written. Optional, for backward
   * compatibility. The conformance suite checks that every recorded
   * specifier resolves: a relative specifier to a unit of the same
   * package, a bare specifier to a package the graph's `requires`
   * declares. The runtime does not read the field — it locates literal
   * `import()` calls in the source itself at mint time and resolves each
   * against the same unit set.
   */
  dynamicImports?: string[];
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
  /**
   * Bare specifiers the pack imports, exactly as written, subpaths
   * included — the same meaning as a unit's `bareSpecifiers`. Optional;
   * when absent the runtime follows `bareImports`.
   */
  bareSpecifiers?: string[];
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
   * The package's delivered entry points: each subpath a consumer may
   * import, keyed as in the package's `exports` map (`'.'` for the
   * package name, `'./client'`, `'./jsx-runtime'`), mapped to the module
   * path of the entry module it resolves to (`'client.js'`,
   * `'esm/button/index.js'`) — a member of exactly one unit's
   * `modulePaths`. Optional, for backward compatibility: a subpath listed
   * here resolves to the unit owning its entry module, and that unit's
   * minted reference answers the subpath specifier; a subpath not listed
   * falls back to the module paths `<subpath>`, `<subpath>.js`,
   * `<subpath>/index.js`. The `'.'` entry, when present, takes precedence
   * over `mainModulePath`.
   */
  entryModulePaths?: Record<string, string>;
  /**
   * Optional whole-package pack, with its own content identity. The pack
   * is the package's main entry bundled whole and answers the package
   * name only; a load delivering it also delivers every other entry unit
   * it reaches.
   */
  pack?: SharedDepGraphPack;
  /**
   * The producer that emitted this graph file and its units, and its
   * version.
   */
  producer?: SharedDepGraphProducer;
}
