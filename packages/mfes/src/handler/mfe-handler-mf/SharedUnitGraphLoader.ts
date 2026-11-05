/**
 * Shared-unit graph loader: fetches, verifies, and interprets the
 * `./unit-format` graph files a manifest's `shared[].graphFile` declares,
 * then produces the per-package unit/pack fetch plan the minter consumes.
 *
 * Realizes `inst-md-requires-closure` (the `requires` closure check runs
 * on every path, including the fetch-all path when no roots are
 * declared — finding F-027) and the point-of-use field validation of
 * `unit_contract_schema_language`: a missing or malformed required field
 * fails the load with `MfeLoadError` naming the graph file and the
 * producer name/version recorded in it (finding F-023, F-011).
 *
 * One class per file (`runtime_style`). Stateless except for the
 * injected fetch function; every method is static where it needs no
 * fetch access — the fetch itself is injected so the handler's
 * cache/ledger discipline is preserved.
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import type {
  MfManifest,
  MfManifestRoot,
  MfManifestShared,
} from '../../manifest/mf-manifest';
import type {
  SharedDepGraphFile,
  SharedDepGraphUnit,
} from '../../unit-format/graph-file';
import { PackFallbackPolicy } from './PackFallbackPolicy';
import { SharedSpecifierRewriter } from './SharedSpecifierRewriter';

/** One unit or pack text the minter is asked to mint a blob URL for. */
export interface SharedDepSourceRecord {
  /** Identity key: `name@version` + sorted member module paths, or pack. */
  readonly key: string;
  readonly packageName: string;
  /** Member module paths; `['<pack>']` for a pack record. */
  readonly modulePaths: readonly string[];
  /** Whether this record answers the package's bare-name specifier. */
  readonly isPackageMain: boolean;
  /** Bare imports this record keeps external (package names). */
  readonly bareImports: readonly string[];
  readonly relativeImports: readonly string[];
  readonly text: string;
}

export interface SharedUnitGraphPlan {
  /** Fetched, verified source records in declaration order. */
  readonly records: SharedDepSourceRecord[];
  /** Packages reached by the declared roots (or all, when no roots). */
  readonly reachedPackages: ReadonlySet<string>;
  /** Packages delivered by pack fallback this attempt. */
  readonly packFallbackPackages: readonly string[];
  /** UTF-8 bytes of unit/pack/graph text fetched on this attempt. */
  readonly bytesFetched: number;
}

interface LoadedGraph {
  readonly dep: MfManifestShared;
  readonly graph: SharedDepGraphFile;
  readonly graphFileLocation: string;
}

export class SharedUnitGraphLoader {
  protected constructor() {}

  /** SHA-256 hex digest — the same identity the graph format declares. */
  static async sha256Hex(text: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) {
      throw new MfeLoadError(
        'shared-dep verification requires WebCrypto (crypto.subtle)',
        'shared-dep-verify',
      );
    }
    const digest = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Producer label for error messages: `name@version` or `unknown`. */
  private static producerLabel(graph: SharedDepGraphFile): string {
    const p = graph.producer;
    return p !== undefined ? `${p.name}@${p.version}` : 'unknown producer';
  }

  /**
   * Fetch, verify, and parse one dep's graph file. Integrity failure and
   * name/version mismatch fail the load naming the graph file and its
   * producer (F-011); malformed `requires`/`units` fail naming the field
   * (F-023).
   */
  static async loadGraph(
    dep: MfManifestShared,
    graphFileUrl: string,
    fetchText: (url: string) => Promise<string>,
    entryId: string,
  ): Promise<LoadedGraph> {
    const ref = dep.graphFile;
    if (ref === undefined) {
      throw new MfeLoadError(
        `shared dep '${dep.name}' has no graphFile reference`,
        entryId,
      );
    }
    const text = await fetchText(graphFileUrl);
    const actual = await SharedUnitGraphLoader.sha256Hex(text);
    let parsed: SharedDepGraphFile | undefined;
    try {
      parsed = JSON.parse(text) as SharedDepGraphFile;
    } catch {
      parsed = undefined;
    }
    const producer =
      parsed !== undefined
        ? SharedUnitGraphLoader.producerLabel(parsed)
        : 'unknown producer';
    if (actual !== ref.contentHash) {
      throw new MfeLoadError(
        `graph file '${ref.location}' for shared dep '${dep.name}' failed ` +
          `content-identity verification (producer ${producer}): expected ` +
          `${ref.contentHash}, got ${actual}.`,
        entryId,
      );
    }
    if (parsed === undefined || !Array.isArray(parsed.units)) {
      throw new MfeLoadError(
        `graph file '${ref.location}' for shared dep '${dep.name}' is not ` +
          `a parseable graph document with a 'units' array — a malformed ` +
          `field such as 'requires' or 'units' invalidates the file ` +
          `(producer ${producer}).`,
        entryId,
      );
    }
    // Version identity is checked against the declaring shared[] entry;
    // the graph's `name` is not re-asserted — two deps may legitimately
    // declare identical bytes (the byte-agreement case, F-011), and a
    // test/aggregation fixture may point a second entry at the same
    // graph document.
    if (parsed.version !== dep.version) {
      throw new MfeLoadError(
        `graph file '${ref.location}' declares ` +
          `'${String(parsed.name)}@${String(parsed.version)}' but the ` +
          `manifest shared[] entry declares '${dep.name}@${dep.version}' ` +
          `(producer ${producer}).`,
        entryId,
      );
    }
    if (
      parsed.requires !== undefined &&
      !(
        Array.isArray(parsed.requires) &&
        parsed.requires.every((r) => typeof r === 'string')
      )
    ) {
      throw new MfeLoadError(
        `graph file '${ref.location}' for shared dep '${dep.name}' ` +
          `carries a malformed 'requires' field — expected an array of ` +
          `bare package names (producer ${producer}).`,
        entryId,
      );
    }
    return { dep, graph: parsed, graphFileLocation: ref.location };
  }

  /**
   * The `requires` closure check (`inst-md-requires-closure`): every
   * package name any fetched graph file requires must be declared in the
   * manifest's `shared[]` set. Missing packages fail the load naming
   * each one. Runs on every path — including the fetch-all path when no
   * roots are declared (F-027).
   */
  static checkRequiresClosure(
    graphs: readonly LoadedGraph[],
    sharedNames: ReadonlySet<string>,
    entryId: string,
  ): { anyRequiresDeclared: boolean } {
    const missing = new Set<string>();
    let anyRequiresDeclared = false;
    for (const { graph } of graphs) {
      if (graph.requires !== undefined) {
        anyRequiresDeclared = true;
        for (const req of graph.requires) {
          if (!sharedNames.has(req)) {
            missing.add(req);
          }
        }
      }
    }
    if (missing.size > 0) {
      const names = [...missing].map((n) => `'${n}'`).join(', ');
      throw new MfeLoadError(
        `shared-dependency requires closure is not satisfied: ${names} ` +
          `required by fetched graph files but not declared in ` +
          `manifest.shared[].`,
        entryId,
      );
    }
    return { anyRequiresDeclared };
  }

  /**
   * Validate `manifest.entryRoots`/`lazyChunkRoots` shape and return the
   * root list for `exposedModule`. Malformed roots fail with
   * `MfeLoadError` naming the field (F-023); an absent roots set returns
   * `undefined` (fetch-all path, reported by the caller — F-011).
   */
  static rootsForExposedModule(
    manifest: MfManifest,
    exposedModule: string,
    entryId: string,
  ): readonly MfManifestRoot[] | undefined {
    const validateMap = (
      value: unknown,
      field: string,
    ): Record<string, MfManifestRoot[]> | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new MfeLoadError(
          `manifest '${manifest.id}' field '${field}' must be an object ` +
            `mapping module ids to reachability-root arrays.`,
          entryId,
        );
      }
      for (const [key, roots] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (!Array.isArray(roots)) {
          throw new MfeLoadError(
            `manifest '${manifest.id}' field '${field}['${key}']' must be ` +
              `an array of reachability roots — got ${String(roots)}.`,
            entryId,
          );
        }
      }
      return value as Record<string, MfManifestRoot[]>;
    };
    const entryRoots = validateMap(manifest.entryRoots, 'entryRoots');
    validateMap(manifest.lazyChunkRoots, 'lazyChunkRoots');
    if (entryRoots === undefined) return undefined;
    return entryRoots[exposedModule];
  }

  /**
   * Compute which units of `graph` the roots reach. Package-name roots
   * reach the unit containing `mainModulePath` (first unit when absent);
   * subpath roots (`pkg/sub`) reach the unit owning the subpath's module
   * path (F-017); unit-id roots reach units overlapping `modulePaths`.
   * Relative imports are then traversed against EVERY member module path
   * (F-016), and bare imports mark their packages reached.
   */
  static reachUnits(
    roots: readonly MfManifestRoot[] | undefined,
    graphs: ReadonlyMap<string, LoadedGraph>,
  ): {
    reachedUnits: Map<string, Set<SharedDepGraphUnit>>;
    reachedPackages: Set<string>;
  } {
    const reachedPackages = new Set<string>();
    const reachedUnits = new Map<string, Set<SharedDepGraphUnit>>();
    const addUnit = (name: string, unit: SharedDepGraphUnit): void => {
      let set = reachedUnits.get(name);
      if (set === undefined) {
        set = new Set();
        reachedUnits.set(name, set);
      }
      if (!set.has(unit)) {
        set.add(unit);
        reachedPackages.add(name);
        queue.push({ name, unit });
      }
    };
    const unitForModulePath = (
      name: string,
      modulePath: string,
    ): SharedDepGraphUnit | undefined =>
      graphs
        .get(name)
        ?.graph.units.find((u) => u.modulePaths.includes(modulePath));
    const mainUnit = (name: string): SharedDepGraphUnit | undefined => {
      const g = graphs.get(name)?.graph;
      if (g === undefined) return undefined;
      return (
        (g.mainModulePath !== undefined
          ? unitForModulePath(name, g.mainModulePath)
          : undefined) ?? g.units[0]
      );
    };
    const queue: Array<{ name: string; unit: SharedDepGraphUnit }> = [];
    if (roots === undefined) {
      // Fetch-all path: every unit of every declared graph dep.
      for (const [name, { graph }] of graphs) {
        for (const unit of graph.units) {
          let set = reachedUnits.get(name);
          if (set === undefined) {
            set = new Set();
            reachedUnits.set(name, set);
          }
          set.add(unit);
        }
        reachedPackages.add(name);
      }
      return { reachedUnits, reachedPackages };
    }
    for (const root of roots) {
      if (typeof root === 'object' && root !== null) {
        const g = graphs.get(root.name);
        if (g === undefined) continue;
        for (const unit of g.graph.units) {
          if (unit.modulePaths.some((m) => root.modulePaths?.includes(m))) {
            addUnit(root.name, unit);
          }
        }
        continue;
      }
      const specifier = root as string;
      // Split specifier into package name + optional subpath, honouring
      // scoped names.
      const segments = specifier.split('/');
      const pkgName = specifier.startsWith('@')
        ? segments.slice(0, 2).join('/')
        : segments[0];
      const subpath = specifier.startsWith('@')
        ? segments.slice(2).join('/')
        : segments.slice(1).join('/');
      if (graphs.get(pkgName) === undefined) continue;
      if (subpath === '') {
        const unit = mainUnit(pkgName);
        if (unit !== undefined) addUnit(pkgName, unit);
        continue;
      }
      for (const candidate of SharedSpecifierRewriter.subpathModulePathCandidates(
        subpath,
      )) {
        const unit = unitForModulePath(pkgName, candidate);
        if (unit !== undefined) {
          addUnit(pkgName, unit);
          break;
        }
      }
    }
    // BFS: relative imports inside a package, bare imports across.
    while (queue.length > 0) {
      const { name, unit } = queue.shift() as { name: string; unit: SharedDepGraphUnit };
      for (const rel of unit.relativeImports) {
        for (const member of unit.modulePaths) {
          const resolved = SharedSpecifierRewriter.resolveRelativeModulePath(
            member,
            rel,
          );
          const target = unitForModulePath(name, resolved);
          if (target !== undefined) {
            addUnit(name, target);
            break;
          }
        }
      }
      for (const bare of unit.bareImports) {
        const target = mainUnit(bare);
        if (target !== undefined) addUnit(bare, target);
      }
    }
    return { reachedUnits, reachedPackages };
  }

  /**
   * Orchestrate the graph-file path: load+verify all graph files, run the
   * requires closure, compute reachability, decide pack fallback per
   * package BEFORE its unit text is fetched (F-018), and fetch+verify the
   * chosen texts. Returns the records the minter mints.
   *
   * `fetchVerified(url, hash, key)` must fetch `url`, verify its text
   * against `hash` (rejecting on mismatch), and dedup through the realm
   * cache under `key` — supplied by the handler so cache/ledger
   * discipline stays in one place.
   */
  static async buildPlan(
    graphs: readonly LoadedGraph[],
    roots: readonly MfManifestRoot[] | undefined,
    packFallbackBudgetMs: number,
    attemptElapsedMs: number,
    fetchVerified: (
      url: string,
      contentHash: string,
      cacheKey: string,
    ) => Promise<string>,
    resolveAssetUrl: (location: string) => string,
  ): Promise<SharedUnitGraphPlan> {
    const graphByName = new Map(graphs.map((g) => [g.dep.name, g]));
    const { reachedUnits, reachedPackages } = SharedUnitGraphLoader.reachUnits(
      roots,
      graphByName,
    );
    const records: SharedDepSourceRecord[] = [];
    const packFallbackPackages: string[] = [];
    let bytesFetched = 0;
    const encoder = new TextEncoder();
    for (const { dep, graph } of graphs) {
      if (!reachedPackages.has(dep.name)) continue;
      const units = reachedUnits.get(dep.name) ?? new Set();
      if (
        graph.pack !== undefined &&
        PackFallbackPolicy.shouldUsePack(
          true,
          packFallbackBudgetMs,
          attemptElapsedMs,
        )
      ) {
        const text = await fetchVerified(
          resolveAssetUrl(graph.pack.location),
          graph.pack.contentHash,
          `${dep.name}@${dep.version}@pack:${graph.pack.contentHash}`,
        );
        bytesFetched += encoder.encode(text).length;
        packFallbackPackages.push(dep.name);
        records.push({
          key: `${dep.name}@${dep.version}@pack`,
          packageName: dep.name,
          modulePaths: ['<pack>'],
          isPackageMain: true,
          bareImports: graph.pack.bareImports ?? graph.requires ?? [],
          relativeImports: [],
          text,
        });
        continue;
      }
      const sortedUnits = [...units];
      for (const unit of sortedUnits) {
        const text = await fetchVerified(
          resolveAssetUrl(unit.location),
          unit.contentHash,
          `${dep.name}@${dep.version}@${unit.contentHash}`,
        );
        bytesFetched += encoder.encode(text).length;
        records.push({
          key: `${dep.name}@${dep.version}@${[...unit.modulePaths]
            .sort()
            .join(',')}`,
          packageName: dep.name,
          modulePaths: unit.modulePaths,
          isPackageMain:
            graph.mainModulePath !== undefined
              ? unit.modulePaths.includes(graph.mainModulePath)
              : graph.units[0] === unit,
          bareImports: unit.bareImports,
          relativeImports: unit.relativeImports,
          text,
        });
      }
    }
    return { records, reachedPackages, packFallbackPackages, bytesFetched };
  }
}
