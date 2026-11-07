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
  SharedDepGraphFileRef,
  SharedDepGraphShard,
  SharedDepGraphUnit,
} from '../../unit-format/graph-file';
import { PackFallbackPolicy } from './PackFallbackPolicy';
import { SharedEntryResolver } from './SharedEntryResolver';
import { SharedGraphIndex } from './SharedGraphIndex';
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
  /**
   * Bare specifiers this record answers through the package's entry
   * points: the package name for the main unit or the pack, and
   * `name/<subpath>` for every `entryModulePaths` subpath it owns.
   */
  readonly entrySpecifiers: readonly string[];
  /** Bare imports this record keeps external (package names). */
  readonly bareImports: readonly string[];
  /**
   * Bare specifiers this record imports, subpaths included — the graph's
   * `bareSpecifiers`, or `bareImports` when the producer recorded none.
   */
  readonly bareSpecifiers: readonly string[];
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

/** What a set of roots reaches across the loaded graph files. */
export interface SharedUnitReach {
  /** Every reached unit, per package. */
  readonly reachedUnits: Map<string, Set<SharedDepGraphUnit>>;
  /** Packages with at least one reached unit. */
  readonly reachedPackages: Set<string>;
  /** Units reached as an entry point (root or bare specifier), per package. */
  readonly entryUnits: Map<string, Set<SharedDepGraphUnit>>;
}

/** One fetched, verified graph file plus the manifest entry declaring it. */
export interface LoadedGraph {
  readonly dep: MfManifestShared;
  readonly graph: SharedDepGraphFile;
  readonly graphFileLocation: string;
  /**
   * Shard-document keys already merged into `graph.units` —
   * `entryShards` keys, `'p:<index>'` partition keys and `'<units>'`
   * for the whole-unit-list shard, whatever the graph's encoding.
   * Recorded by the fetch-set loader so a later on-demand round
   * (`SharedGraphSetLoader.loadMore`) never fetches or merges a shard
   * document twice. Runtime-only: never serialized.
   */
  mergedShardKeys?: Set<string>;
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

  /**
   * The content identity a unit or pack record carries: its declared
   * `contentHash`, or — when the field is omitted (compact encoding) —
   * the `.<64-hex>.js` segment the content-addressed naming rule fixes
   * in `location`. `undefined` when neither yields a hash.
   */
  static contentHashOf(holder: {
    contentHash?: string;
    location: string;
  }): string | undefined {
    if (typeof holder.contentHash === 'string') return holder.contentHash;
    return SharedUnitGraphLoader.LOCATION_HASH.exec(holder.location)?.[1];
  }

  private static readonly LOCATION_HASH = /\.([0-9a-f]{64})\.[cm]?js$/;

  /**
   * Fetch, verify, and parse one shard document of `dep`'s graph —
   * an entry shard or the whole-unit-list shard — and return its unit
   * list. Integrity failure and name/version mismatch fail the load
   * exactly as {@link loadGraph} does for the index file (F-011).
   */
  static async loadShard(
    dep: MfManifestShared,
    ref: SharedDepGraphFileRef,
    shardUrl: string,
    fetchText: (url: string) => Promise<string>,
    entryId: string,
  ): Promise<SharedDepGraphUnit[]> {
    const text = await fetchText(shardUrl);
    const actual = await SharedUnitGraphLoader.sha256Hex(text);
    let parsed: SharedDepGraphShard | undefined;
    try {
      parsed = JSON.parse(text) as SharedDepGraphShard;
    } catch {
      parsed = undefined;
    }
    const producer =
      parsed !== undefined
        ? `${dep.name}@${dep.version}`
        : 'unknown producer';
    if (actual !== ref.contentHash) {
      throw new MfeLoadError(
        `graph shard '${ref.location}' for shared dep '${dep.name}' failed ` +
          `content-identity verification: expected ${ref.contentHash}, ` +
          `got ${actual}.`,
        entryId,
      );
    }
    if (
      parsed === undefined ||
      !Array.isArray(parsed.units) ||
      parsed.name !== dep.name ||
      parsed.version !== dep.version
    ) {
      throw new MfeLoadError(
        `graph shard '${ref.location}' for shared dep '${dep.name}' is not ` +
          `a parseable shard document for '${dep.name}@${dep.version}' ` +
          `with a 'units' array (producer ${producer}).`,
        entryId,
      );
    }
    return parsed.units;
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
    // req -> the graph files (location + producer) requiring it, so the
    // failure names the file and producer behind each unmet requirement.
    const missing = new Map<string, Set<string>>();
    let anyRequiresDeclared = false;
    for (const { graph, graphFileLocation } of graphs) {
      if (graph.requires !== undefined) {
        anyRequiresDeclared = true;
        const label =
          `'${graphFileLocation}' (producer ` +
          `${SharedUnitGraphLoader.producerLabel(graph)})`;
        for (const req of graph.requires) {
          if (!sharedNames.has(req)) {
            const files = missing.get(req) ?? new Set<string>();
            files.add(label);
            missing.set(req, files);
          }
        }
      }
    }
    if (missing.size > 0) {
      const detail = [...missing]
        .map(
          ([req, files]) =>
            `'${req}' required by ${[...files].join(', ')}`,
        )
        .join('; ');
      throw new MfeLoadError(
        `shared-dependency requires closure is not satisfied: ${detail} — ` +
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
        roots.forEach((root, i) => {
          const where = `${field}['${key}'][${i}]`;
          if (typeof root === 'string') return;
          if (typeof root !== 'object' || root === null) {
            throw new MfeLoadError(
              `manifest '${manifest.id}' field '${where}' must be a ` +
                `package-name string or a unit-identifier object — got ` +
                `${String(root)}.`,
              entryId,
            );
          }
          const unitId = root as Record<string, unknown>;
          if (
            typeof unitId['name'] !== 'string' ||
            (unitId['modulePaths'] !== undefined &&
              !(
                Array.isArray(unitId['modulePaths']) &&
                (unitId['modulePaths'] as unknown[]).every(
                  (m) => typeof m === 'string',
                )
              ))
          ) {
            throw new MfeLoadError(
              `manifest '${manifest.id}' field '${where}' carries a ` +
                `malformed unit identifier — 'name' must be a string and ` +
                `'modulePaths', when present, an array of strings.`,
              entryId,
            );
          }
        });
      }
      return value as Record<string, MfManifestRoot[]>;
    };
    const entryRoots = validateMap(manifest.entryRoots, 'entryRoots');
    validateMap(manifest.lazyChunkRoots, 'lazyChunkRoots');
    if (entryRoots === undefined) return undefined;
    return entryRoots[exposedModule];
  }

  /**
   * Compute which units of `graph` the roots reach. A package-name root
   * reaches the package's main unit and a subpath root (`pkg/sub`) the
   * unit owning the subpath's entry module — through `entryModulePaths`
   * when the graph declares the subpath (an `exports`-mapped subpath),
   * else through the candidate module paths (F-017); unit-id roots reach
   * units overlapping `modulePaths`. Relative imports are then traversed
   * against EVERY member module path (F-016), and every bare specifier a
   * reached unit imports — its `bareSpecifiers`, subpaths included, or its
   * `bareImports` package names when the producer recorded no specifiers
   * — reaches the unit that specifier names, in its own or another
   * package.
   *
   * `entryUnits` records, per package, the units reached as an entry
   * point — by a root or by a bare specifier — as opposed to only through
   * a relative import inside the package; the pack-coverage decision reads
   * it. On the fetch-all path (no roots) every unit is reached, and the
   * entry units are the main unit plus every unit owning a declared
   * `entryModulePaths` subpath.
   */
  static reachUnits(
    roots: readonly MfManifestRoot[] | undefined,
    graphs: ReadonlyMap<string, LoadedGraph>,
    entryId = 'shared-dep-graph',
  ): SharedUnitReach {
    const reachedPackages = new Set<string>();
    const reachedUnits = new Map<string, Set<SharedDepGraphUnit>>();
    const entryUnits = new Map<string, Set<SharedDepGraphUnit>>();
    const queue: Array<{ name: string; unit: SharedDepGraphUnit }> = [];
    // Per-LoadedGraph index — modulePath → unit, memoized main unit and
    // unit → entry specifiers — shared with buildPlan and the lazy path
    // through `SharedGraphIndex.of`, replacing the linear scans each of
    // those used to run per unit.
    const indexOf = (loaded: LoadedGraph): SharedGraphIndex =>
      SharedGraphIndex.of(loaded);
    const indexFor = (name: string): SharedGraphIndex | undefined => {
      const loaded = graphs.get(name);
      return loaded === undefined ? undefined : indexOf(loaded);
    };
    const addTo = (
      map: Map<string, Set<SharedDepGraphUnit>>,
      name: string,
      unit: SharedDepGraphUnit,
    ): boolean => {
      let set = map.get(name);
      if (set === undefined) {
        set = new Set();
        map.set(name, set);
      }
      if (set.has(unit)) return false;
      set.add(unit);
      return true;
    };
    const addUnit = (name: string, unit: SharedDepGraphUnit): void => {
      if (addTo(reachedUnits, name, unit)) {
        reachedPackages.add(name);
        queue.push({ name, unit });
      }
    };
    const addEntry = (name: string, unit: SharedDepGraphUnit): void => {
      addTo(entryUnits, name, unit);
      addUnit(name, unit);
    };
    const reachSpecifier = (specifier: string): void => {
      const { name, subpath } = SharedEntryResolver.split(specifier);
      const unit = indexFor(name)?.entryUnit(subpath);
      if (unit !== undefined) addEntry(name, unit);
    };
    // A unit recorded by an older producer carries no `bareSpecifiers`:
    // its `bareImports` say WHICH packages it imports but not which
    // subpaths, so a subpath import could name any unit of the package.
    // The only safe reach is every unit of each imported package —
    // anything narrower leaves subpath entry units unfetched and their
    // specifiers unrewritten (L3-003).
    const reachWholePackage = (name: string): void => {
      const loaded = graphs.get(name);
      if (loaded === undefined) return;
      const index = indexOf(loaded);
      for (const target of loaded.graph.units) {
        addUnit(name, target);
        if (index.entrySpecifiersOf(target).length > 0) {
          addTo(entryUnits, name, target);
        }
      }
    };
    if (roots === undefined) {
      // Fetch-all path: every unit of every declared graph dep is
      // reached, so every unit is validated at its point of use.
      for (const [name, loaded] of graphs) {
        const index = indexOf(loaded);
        for (const unit of loaded.graph.units) {
          index.assertValidated(unit, entryId);
          addTo(reachedUnits, name, unit);
          if (index.entrySpecifiersOf(unit).length > 0) {
            addTo(entryUnits, name, unit);
          }
        }
        reachedPackages.add(name);
      }
      return { reachedUnits, reachedPackages, entryUnits };
    }
    for (const root of roots) {
      if (typeof root === 'object' && root !== null) {
        const g = graphs.get(root.name);
        if (g === undefined) continue;
        for (const unit of g.graph.units) {
          // The overlap test reads `modulePaths` only; a unit whose paths
          // are malformed fails naming that field, and full validation
          // still waits for the unit to be reached (point of use).
          const paths = unit.modulePaths;
          if (!Array.isArray(paths) || paths.length === 0) {
            indexOf(g).assertValidated(unit, entryId);
          }
          if (paths.some((m) => root.modulePaths?.includes(m))) {
            addEntry(root.name, unit);
          }
        }
        continue;
      }
      reachSpecifier(root as string);
    }
    // BFS: relative imports inside a package, bare specifiers anywhere.
    // A unit is field-validated here, the first time the walk reaches it
    // — never for a unit of an unreached package.
    for (let head = 0; head < queue.length; head++) {
      const { name, unit } = queue[head];
      const index = indexFor(name) as SharedGraphIndex;
      index.assertValidated(unit, entryId);
      for (const rel of unit.relativeImports) {
        for (const member of unit.modulePaths) {
          const resolved = SharedSpecifierRewriter.resolveRelativeModulePath(
            member,
            rel,
          );
          const target = index.unitFor(resolved);
          if (target !== undefined) {
            addUnit(name, target);
            break;
          }
        }
      }
      if (unit.bareSpecifiers === undefined) {
        for (const name2 of unit.bareImports) {
          reachWholePackage(name2);
        }
      } else {
        for (const specifier of SharedEntryResolver.importedSpecifiers(unit)) {
          reachSpecifier(specifier);
        }
      }
    }
    return { reachedUnits, reachedPackages, entryUnits };
  }

  /**
   * Whether `name` is delivered by its whole-package pack on this attempt.
   * The pack is the package's main entry bundled whole, so it answers the
   * package name only. Every other entry unit the load reaches must be
   * delivered beside it: a unit with no relative imports (a CommonJS
   * subpath entry bundled on its own, importing the package by name) can
   * be, so the pack is used and that unit fetched with it; a unit with
   * relative imports shares modules the pack already contains, and
   * delivering both would instantiate those modules twice, so the package
   * keeps its units for the attempt — every entry the consumer imports is
   * covered either way.
   *
   * A reached unit that is NOT an entry unit — reached only through the
   * legacy whole-package reach of a graph without `bareSpecifiers`, or
   * through a relative import — has no record a pack delivery could
   * mint: the pack answers the package name and entry specifiers only.
   * Choosing the pack then would drop that unit's text from the plan and
   * leave its module paths unclaimed, so the pack is blocked whenever
   * the reached set outgrows the entry set (L3-02).
   */
  private static choosesPack(
    loaded: LoadedGraph,
    reach: SharedUnitReach,
    packFallbackBudgetMs: number,
    attemptElapsedMs: number,
  ): boolean {
    const { graph, dep } = loaded;
    if (
      graph.pack === undefined ||
      !PackFallbackPolicy.shouldUsePack(true, packFallbackBudgetMs, attemptElapsedMs)
    ) {
      return false;
    }
    const entries = reach.entryUnits.get(dep.name);
    for (const unit of reach.reachedUnits.get(dep.name) ?? []) {
      if (entries === undefined || !entries.has(unit)) {
        return false;
      }
    }
    return SharedUnitGraphLoader.packCompanions(loaded, entries).every(
      (unit) => unit.relativeImports.length === 0,
    );
  }

  /** The reached entry units a pack does not answer: every one but the main unit. */
  private static packCompanions(
    loaded: LoadedGraph,
    entries: ReadonlySet<SharedDepGraphUnit> | undefined,
  ): SharedDepGraphUnit[] {
    const main = SharedGraphIndex.of(loaded).mainUnit();
    return [...(entries ?? [])].filter((unit) => unit !== main);
  }

  /**
   * Orchestrate the graph-file path: load+verify all graph files, run the
   * requires closure, compute reachability, decide pack fallback per
   * package BEFORE any of its text is fetched (F-018), and fetch+verify the
   * chosen texts in one parallel round. Returns the records the minter
   * mints.
   *
   * A package delivered by its pack is reached as a whole: the bare
   * specifiers its pack imports become roots, and reachability and the
   * pack decisions are recomputed until they settle — all before the
   * first fetch, so the set fetched is known up front
   * (`inst-md-fetch-reachable-units`).
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
    entryId = 'shared-dep-graph',
  ): Promise<SharedUnitGraphPlan> {
    const graphByName = new Map(graphs.map((g) => [g.dep.name, g]));
    let currentRoots = roots;
    let reach = SharedUnitGraphLoader.reachUnits(currentRoots, graphByName, entryId);
    let packPackages = new Set<string>();
    // The pack answers the package name only; on the fetch-all path every
    // unit is reached and claimed, so substituting a pack would leave
    // deep-subpath units neither fetched nor claimed (L3-004). Pack
    // fallback is decided only when declared roots narrow the unit set.
    if (roots !== undefined) {
      for (;;) {
        packPackages = new Set(
          graphs
            .filter(
              (g) =>
                reach.reachedPackages.has(g.dep.name) &&
                SharedUnitGraphLoader.choosesPack(g, reach, packFallbackBudgetMs, attemptElapsedMs),
            )
            .map((g) => g.dep.name),
        );
        const declared = currentRoots as readonly MfManifestRoot[];
        const known: Set<string> = new Set(
          declared.filter((r): r is string => typeof r === 'string'),
        );
        const added = graphs
          .filter((g) => packPackages.has(g.dep.name))
          .flatMap((g) => SharedEntryResolver.importedSpecifiers(g.graph.pack ?? {}))
          .filter((specifier) => !known.has(specifier));
        if (added.length === 0) break;
        currentRoots = [...declared, ...new Set(added)];
        reach = SharedUnitGraphLoader.reachUnits(currentRoots, graphByName, entryId);
      }
    }

    const pending: Array<{
      url: string;
      contentHash: string;
      cacheKey: string;
      record: Omit<SharedDepSourceRecord, 'text'>;
    }> = [];
    const packFallbackPackages: string[] = [];
    for (const loaded of graphs) {
      const { dep, graph } = loaded;
      if (!reach.reachedPackages.has(dep.name)) continue;
      const index = SharedGraphIndex.of(loaded);
      const unitRecord = (unit: SharedDepGraphUnit): (typeof pending)[number] => {
        index.assertValidated(unit, entryId);
        return {
        url: resolveAssetUrl(unit.location),
        contentHash: SharedUnitGraphLoader.contentHashOf(unit) as string,
        cacheKey:
          `${dep.name}@${dep.version}@` +
          `${SharedUnitGraphLoader.contentHashOf(unit) as string}`,
        record: {
          key: `${dep.name}@${dep.version}@${[...unit.modulePaths].sort().join(',')}`,
          packageName: dep.name,
          modulePaths: unit.modulePaths,
          isPackageMain: index.mainUnit() === unit,
          entrySpecifiers: index.entrySpecifiersOf(unit) as string[],
          bareImports: unit.bareImports,
          bareSpecifiers: SharedEntryResolver.importedSpecifiers(unit),
          relativeImports: unit.relativeImports,
        },
        };
      };
      if (graph.pack !== undefined && packPackages.has(dep.name)) {
        packFallbackPackages.push(dep.name);
        const packImports = graph.pack.bareImports ?? graph.requires ?? [];
        pending.push({
          url: resolveAssetUrl(graph.pack.location),
          contentHash: SharedUnitGraphLoader.contentHashOf(
            graph.pack
          ) as string,
          cacheKey:
            `${dep.name}@${dep.version}@pack:` +
            `${SharedUnitGraphLoader.contentHashOf(graph.pack) as string}`,
          record: {
            key: `${dep.name}@${dep.version}@pack`,
            packageName: dep.name,
            modulePaths: ['<pack>'],
            isPackageMain: true,
            entrySpecifiers: [dep.name],
            bareImports: packImports,
            bareSpecifiers: graph.pack.bareSpecifiers ?? packImports,
            relativeImports: [],
          },
        });
        for (const unit of SharedUnitGraphLoader.packCompanions(
          loaded,
          reach.entryUnits.get(dep.name),
        )) {
          pending.push(unitRecord(unit));
        }
        continue;
      }
      for (const unit of reach.reachedUnits.get(dep.name) ?? []) {
        pending.push(unitRecord(unit));
      }
    }
    // inst-md-fetch-reachable-units: one parallel request per record.
    const texts = await Promise.all(
      pending.map(({ url, contentHash, cacheKey }) =>
        fetchVerified(url, contentHash, cacheKey),
      ),
    );
    const encoder = new TextEncoder();
    let bytesFetched = 0;
    const records = pending.map(({ record }, i) => {
      bytesFetched += encoder.encode(texts[i]).length;
      return { ...record, text: texts[i] };
    });
    return {
      records,
      reachedPackages: reach.reachedPackages,
      packFallbackPackages,
      bytesFetched,
    };
  }
}
