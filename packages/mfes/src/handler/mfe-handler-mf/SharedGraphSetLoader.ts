/**
 * Shared graph-set loader: fetches only the graph documents a load can
 * reach, instead of every declared `shared[]` entry's file.
 *
 * The fetch set is driven by the unit walk, not by package-level
 * `requires` (SZ-009): the roots' packages' index graphs are fetched
 * first, then each round's reached units name the packages and the
 * graph shards the next round fetches — a package whose units are never
 * reached never has its graph fetched, and a sharded package yields
 * only the entry shards the reached specifiers name (SZ-008).
 *
 * Sharded graphs (`entryShards`/`unitsShard`, optional contract fields):
 * the index graph's `units` list is empty; a fetched shard's units are
 * merged into it. A specifier naming no shard key — or any reach that
 * needs the whole package (a unit-identifier root, an old-format unit
 * without `bareSpecifiers`) — fetches the `unitsShard` whole-unit list.
 *
 * Fallbacks keep the pre-narrowing behaviour, never an under-fetch:
 * no roots declared (`undefined`) fetches every graph file as before;
 * a reached unit without a `dynamicImports` field whose package records
 * none anywhere reverts that package to its `requires` set (its lazy
 * import coverage is unknowable); a fetched graph file that carries no
 * `requires` field at all widens the set to every remaining dep.
 *
 * `fetchSet` is the synchronous planning twin for build-time tools (the
 * size metric): identical walk, injected readers in place of fetches.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import type {
  MfManifestRoot,
  MfManifestShared,
} from '../../manifest/mf-manifest';
import type {
  SharedDepGraphFile,
  SharedDepGraphFileRef,
  SharedDepGraphShard,
} from '../../unit-format/graph-file';
import { SharedEntryResolver } from './SharedEntryResolver';
import { SharedGraphIndex } from './SharedGraphIndex';
import { SharedSpecifierRewriter } from './SharedSpecifierRewriter';
import {
  SharedUnitGraphLoader,
  type LoadedGraph,
} from './SharedUnitGraphLoader';

/** Work item: one shard of `dep`'s graph to fetch and merge. */
interface ShardWork {
  dep: MfManifestShared;
  /**
   * `'<units>'` for the whole-unit-list shard, `'p:<index>'` for a
   * disjoint `unitPartitions` document, else an `entryShards` key.
   */
  key: string;
}

const UNITS_KEY = '<units>';

/** The work key of `unitPartitions[i]`. */
const partitionKey = (index: number): string => `p:${index}`;

/** Merge state one pass accumulates, per package name. */
interface MergeState {
  /** Shard keys already merged into the loaded graph — `entryShards`
   * keys and `'p:<index>'` partition keys alike. */
  shardKeys: Map<string, Set<string>>;
  /** Packages whose whole-unit list is already merged. */
  allUnits: Set<string>;
  /** Merged unit locations, for dedupe across overlapping shards. */
  unitLocations: Map<string, Set<string>>;
}

/** One wanted computation's result. */
interface Wanted {
  packages: Set<string>;
  shards: ShardWork[];
  fetchAllRest: boolean;
}

export class SharedGraphSetLoader {
  protected constructor() {}

  /**
   * The package names the roots name directly — a string root's package
   * (a subpath root's package too: `pkg/sub` roots `pkg`), a unit-id
   * root's `name`.
   */
  static rootPackageNames(
    roots: readonly MfManifestRoot[] | undefined
  ): Set<string> {
    const names = new Set<string>();
    for (const root of roots ?? []) {
      if (typeof root === 'string') {
        names.add(SharedEntryResolver.split(root).name);
      } else if (root !== null && typeof root === 'object') {
        names.add(root.name);
      }
    }
    return names;
  }

  /** The ref a shard work key names, or `undefined` when it is gone. */
  private static refFor(
    graph: SharedDepGraphFile,
    key: string,
  ): SharedDepGraphFileRef | undefined {
    if (key === UNITS_KEY) return graph.unitsShard;
    if (key.startsWith('p:')) {
      return graph.unitPartitions?.[Number(key.slice(2))];
    }
    return graph.entryShards?.[key];
  }

  /** Whether `graph` carries the disjoint-partition encoding. */
  private static isPartitioned(graph: SharedDepGraphFile): boolean {
    return (
      graph.unitPartitions !== undefined &&
      graph.modulePartitions !== undefined
    );
  }

  /**
   * Whole-package work for a sharded graph: the whole-unit-list shard
   * when one is declared, else every unmerged partition — nothing when
   * the unit set is already complete or the graph is not sharded.
   */
  private static wholeWorks(
    loaded: LoadedGraph,
    merged: MergeState,
  ): ShardWork[] {
    const name = loaded.dep.name;
    if (merged.allUnits.has(name)) return [];
    if (loaded.graph.unitsShard !== undefined) {
      return [{ dep: loaded.dep, key: UNITS_KEY }];
    }
    const parts = loaded.graph.unitPartitions;
    if (parts === undefined) return [];
    const mergedKeys = merged.shardKeys.get(name) ?? new Set<string>();
    return parts
      .map((_, i) => ({ dep: loaded.dep, key: partitionKey(i) }))
      .filter((w) => !mergedKeys.has(w.key));
  }

  /**
   * The shard work a specifier of `dep`'s package needs. A partitioned
   * graph resolves the specifier to a module path (`entryModulePaths`,
   * `mainModulePath`, or the subpath's module-path candidates) and names
   * the one partition owning it through `modulePartitions` — a deep
   * module specifier included (SZ-014); an unindexed path falls back to
   * the whole-unit-list shard or every remaining partition rather than
   * under-fetching. A legacy graph names the first matching
   * `entryShards` key, else the whole-unit list — nothing when the
   * package is not sharded or the unit set is already complete.
   */
  private static shardFor(
    loaded: LoadedGraph,
    subpath: string,
    merged: MergeState,
  ): ShardWork[] {
    const graph = loaded.graph;
    if (
      graph.unitsShard === undefined &&
      graph.entryShards === undefined &&
      graph.unitPartitions === undefined
    ) {
      return [];
    }
    const name = loaded.dep.name;
    if (merged.allUnits.has(name)) return [];
    const mergedKeys = merged.shardKeys.get(name) ?? new Set<string>();
    if (SharedGraphSetLoader.isPartitioned(graph)) {
      const paths =
        subpath === ''
          ? [graph.entryModulePaths?.['.'], graph.mainModulePath]
          : [
              graph.entryModulePaths?.[`./${subpath}`],
              ...SharedSpecifierRewriter.subpathModulePathCandidates(subpath),
            ];
      for (const path of paths) {
        if (path === undefined) continue;
        const idx = graph.modulePartitions?.[path];
        if (idx === undefined) continue;
        const key = partitionKey(idx);
        return mergedKeys.has(key) ? [] : [{ dep: loaded.dep, key }];
      }
      return SharedGraphSetLoader.wholeWorks(loaded, merged);
    }
    const candidates =
      subpath === ''
        ? ['.']
        : [
            `./${subpath}`,
            ...SharedSpecifierRewriter.subpathModulePathCandidates(subpath)
              .filter((c) => c !== subpath)
              .map((c) => `./${c}`),
          ];
    for (const key of candidates) {
      if (graph.entryShards?.[key] === undefined) continue;
      if (!mergedKeys.has(key)) return [{ dep: loaded.dep, key }];
      return [];
    }
    if (graph.unitsShard !== undefined) {
      return [{ dep: loaded.dep, key: UNITS_KEY }];
    }
    return [];
  }

  /**
   * The shard work a unit-identifier root (`{name, modulePaths}`) of a
   * loaded, sharded package needs: a partitioned graph resolves each
   * declared module path through `modulePartitions` (SZ-015) — an
   * unindexed path falls back to the whole set rather than
   * under-fetching; other sharded encodings need the whole-unit list.
   */
  private static unitIdWorks(
    loaded: LoadedGraph,
    modulePaths: readonly string[] | undefined,
    merged: MergeState,
  ): ShardWork[] {
    const graph = loaded.graph;
    if (merged.allUnits.has(loaded.dep.name)) return [];
    if (SharedGraphSetLoader.isPartitioned(graph)) {
      // A unit-identifier root without module paths names no indexed
      // partition — fall back to the whole package rather than
      // fetching nothing (R4-03).
      if (modulePaths === undefined || modulePaths.length === 0) {
        return SharedGraphSetLoader.wholeWorks(loaded, merged);
      }
      const mergedKeys =
        merged.shardKeys.get(loaded.dep.name) ?? new Set<string>();
      const indices = new Set<number>();
      for (const path of modulePaths) {
        const idx = graph.modulePartitions?.[path];
        if (idx === undefined) {
          return SharedGraphSetLoader.wholeWorks(loaded, merged);
        }
        indices.add(idx);
      }
      return [...indices]
        .map((i) => ({ dep: loaded.dep, key: partitionKey(i) }))
        .filter((w) => !mergedKeys.has(w.key));
    }
    return SharedGraphSetLoader.wholeWorks(loaded, merged);
  }

  /**
   * What the currently loaded graphs reach and still need: the
   * runtime's own walk over the merged unit lists names the packages
   * whose index graphs are fetched next and the shards of already
   * loaded packages that must merge first.
   */
  private static wanted(
    loaded: ReadonlyMap<string, LoadedGraph>,
    merged: MergeState,
    combinedRoots: readonly MfManifestRoot[],
    byName: ReadonlyMap<string, MfManifestShared>,
    entryId: string,
  ): Wanted {
    const packages = new Set<string>();
    const shards: ShardWork[] = [];
    let fetchAllRest = false;
    const need = (name: string, subpath: string | undefined): void => {
      if (!byName.has(name)) return;
      const g = loaded.get(name);
      if (g === undefined) {
        packages.add(name);
        return;
      }
      if (subpath === undefined) {
        shards.push(...SharedGraphSetLoader.wholeWorks(g, merged));
        return;
      }
      shards.push(...SharedGraphSetLoader.shardFor(g, subpath, merged));
    };
    const needSpecifier = (specifier: string): void => {
      const { name, subpath } = SharedEntryResolver.split(specifier);
      need(name, subpath);
    };
    // Roots: string roots name specifiers; unit-id roots name the
    // partitions their module paths index into (SZ-015), or the whole
    // unit list of a legacy-sharded package.
    for (const root of combinedRoots) {
      if (typeof root === 'string') {
        needSpecifier(root);
      } else if (root !== null && typeof root === 'object') {
        if (!byName.has(root.name)) continue;
        const g = loaded.get(root.name);
        if (g === undefined) {
          packages.add(root.name);
          continue;
        }
        shards.push(
          ...SharedGraphSetLoader.unitIdWorks(g, root.modulePaths, merged),
        );
      }
    }
    const reach = SharedUnitGraphLoader.reachUnits(
      combinedRoots,
      loaded,
      entryId,
    );
    for (const [name, units] of reach.reachedUnits) {
      const loadedGraph = loaded.get(name);
      if (loadedGraph === undefined) continue;
      // The package's lazy-import coverage is known only when some
      // reached unit records `dynamicImports`; an old-format package
      // recording none anywhere falls back to its `requires` set — and
      // a graph without `requires` at all widens to fetch-all.
      const knowsDynamics = [...units].some(
        (u) => u.dynamicImports !== undefined,
      );
      for (const unit of units) {
        if (unit.bareSpecifiers === undefined) {
          // Old-format unit: package names only — the walk reaches the
          // whole package, so a sharded target yields its unit list.
          for (const target of unit.bareImports ?? []) {
            need(target, undefined);
          }
        } else {
          for (const specifier of SharedEntryResolver.importedSpecifiers(unit)) {
            needSpecifier(specifier);
          }
        }
        for (const specifier of unit.dynamicImports ?? []) {
          needSpecifier(specifier);
        }
      }
      if (!knowsDynamics) {
        const requires = loadedGraph.graph.requires;
        if (requires === undefined) {
          fetchAllRest = true;
        } else {
          for (const req of requires) need(req, undefined);
        }
      }
    }
    // Disjoint partitions (SZ-016): a reached unit's relative import
    // resolving to a module path of an unfetched partition fetches that
    // partition next — the walk composes the intra-package reach across
    // partitions instead of relying on overlapping per-entry closures.
    for (const [name, units] of reach.reachedUnits) {
      const g = loaded.get(name);
      const index = g?.graph.modulePartitions;
      if (
        g === undefined ||
        index === undefined ||
        g.graph.unitPartitions === undefined
      ) {
        continue;
      }
      const mergedKeys = merged.shardKeys.get(name);
      const emitted = new Set<string>();
      for (const unit of units) {
        if (
          !Array.isArray(unit.modulePaths) ||
          !Array.isArray(unit.relativeImports)
        ) {
          continue;
        }
        for (const rel of unit.relativeImports) {
          for (const member of unit.modulePaths) {
            const idx =
              index[
                SharedSpecifierRewriter.resolveRelativeModulePath(member, rel)
              ];
            if (idx === undefined) continue;
            const key = partitionKey(idx);
            if ((mergedKeys?.has(key) ?? false) || emitted.has(key)) continue;
            emitted.add(key);
            shards.push({ dep: g.dep, key });
          }
        }
      }
    }
    return { packages, shards, fetchAllRest };
  }

  /** Units of `shard.units` not already merged, pushed into `loaded`. */
  private static mergeUnits(
    loaded: LoadedGraph,
    units: readonly { location: string }[],
    merged: MergeState,
  ): void {
    let locations = merged.unitLocations.get(loaded.dep.name);
    if (locations === undefined) {
      locations = new Set(
        (loaded.graph.units as { location: string }[]).map((u) => u.location),
      );
      merged.unitLocations.set(loaded.dep.name, locations);
    }
    let grew = false;
    for (const unit of units) {
      if (locations.has(unit.location)) continue;
      locations.add(unit.location);
      (loaded.graph.units as { location: string }[]).push(
        unit as (typeof loaded.graph.units)[number],
      );
      grew = true;
    }
    if (grew) SharedGraphIndex.invalidate(loaded);
  }

  private static markMerged(
    name: string,
    key: string,
    merged: MergeState,
  ): void {
    if (key === UNITS_KEY) {
      merged.allUnits.add(name);
      return;
    }
    const set = merged.shardKeys.get(name) ?? new Set<string>();
    set.add(key);
    merged.shardKeys.set(name, set);
  }

  /**
   * Record `key` on the loaded graph itself, so a later `loadMore`
   * call can seed its merge state for every graph form — partitioned,
   * legacy `entryShards`/`unitsShard`, unsharded alike (R4-05).
   */
  private static recordMerged(loaded: LoadedGraph, key: string): void {
    (loaded.mergedShardKeys ??= new Set<string>()).add(key);
  }

  /**
   * Fetch and verify the graph documents the roots can reach: index
   * graphs of the packages the unit walk names, plus the entry or
   * whole-unit-list shards of sharded packages the reach needs.
   * Deps without a `graphFile` reference are skipped, as before.
   *
   * Returns the loaded graphs in `deps` declaration order — the order
   * `buildPlan` emits its records in.
   */
  static async load(
    deps: readonly MfManifestShared[],
    roots: readonly MfManifestRoot[] | undefined,
    extraRoots: readonly MfManifestRoot[] | undefined,
    resolveAssetUrl: (location: string) => string,
    fetchText: (url: string) => Promise<string>,
    entryId: string
  ): Promise<LoadedGraph[]> {
    const fetchable = deps.filter((d) => d.graphFile !== undefined);
    const byName = new Map(fetchable.map((d) => [d.name, d] as const));
    const loadOne = (dep: MfManifestShared): Promise<LoadedGraph> =>
      SharedUnitGraphLoader.loadGraph(
        dep,
        resolveAssetUrl(dep.graphFile!.location),
        fetchText,
        entryId
      );
    const merged: MergeState = {
      shardKeys: new Map(),
      allUnits: new Set(),
      unitLocations: new Map(),
    };
    const loaded = new Map<string, LoadedGraph>();
    const fetchShard = async (work: ShardWork): Promise<void> => {
      const g = loaded.get(work.dep.name);
      if (g === undefined) return;
      const ref = SharedGraphSetLoader.refFor(g.graph, work.key);
      // Mark even when the ref is gone: the work is discharged either
      // way, and leaving it unmerged would re-emit it every round.
      if (ref === undefined) {
        SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
        SharedGraphSetLoader.recordMerged(g, work.key);
        return;
      }
      const units = await SharedUnitGraphLoader.loadShard(
        work.dep,
        ref,
        resolveAssetUrl(ref.location),
        fetchText,
        entryId,
      );
      SharedGraphSetLoader.mergeUnits(g, units, merged);
      SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
      SharedGraphSetLoader.recordMerged(g, work.key);
    };
    const allShardWork = (): ShardWork[] =>
      [...loaded.values()].flatMap((g) =>
        SharedGraphSetLoader.wholeWorks(g, merged),
      );

    // Fetch-all path: no roots declared, unchanged semantics — every
    // index graph, and the whole-unit list of every sharded package.
    if (roots === undefined) {
      const graphs = await Promise.all(fetchable.map(loadOne));
      for (const g of graphs) loaded.set(g.dep.name, g);
      await Promise.all(allShardWork().map(fetchShard));
      return graphs;
    }

    const combinedRoots: MfManifestRoot[] = [
      ...roots,
      ...(extraRoots ?? []),
    ];
    await SharedGraphSetLoader.runRounds(
      fetchable,
      combinedRoots,
      loaded,
      merged,
      loadOne,
      fetchShard,
      byName,
      entryId,
    );
    return fetchable
      .map((d) => loaded.get(d.name))
      .filter((g): g is LoadedGraph => g !== undefined);
  }

  /**
   * The fetch-set fixpoint shared by {@link load} and {@link loadMore}:
   * a package is requested at most once (`wanted` keeps naming a reached
   * package until it loads, so gating on `loaded` alone would re-request
   * a fetch that yields no graph forever), and a round that has nothing
   * to do — every wanted dep already requested or loaded, every wanted
   * shard already merged — ends the loop even when `wanted` still flags
   * `fetchAllRest` (a reached package recording no lazy imports and no
   * `requires` keeps flagging it after the last fetch).
   */
  private static async runRounds(
    fetchable: readonly MfManifestShared[],
    combinedRoots: readonly MfManifestRoot[],
    loaded: Map<string, LoadedGraph>,
    merged: MergeState,
    loadOne: (dep: MfManifestShared) => Promise<LoadedGraph>,
    fetchShard: (work: ShardWork) => Promise<void>,
    byName: ReadonlyMap<string, MfManifestShared>,
    entryId: string,
  ): Promise<void> {
    const allShardWork = (): ShardWork[] =>
      [...loaded.values()].flatMap((g) =>
        SharedGraphSetLoader.wholeWorks(g, merged),
      );
    const requested = new Set<string>(loaded.keys());
    // Seed from `wanted` up front (R4-04): the roots may need shard or
    // partition documents of graphs ALREADY in `loaded` — computing the
    // queue only after a fetch round would end the loop before the
    // walk ever ran.
    const seed = SharedGraphSetLoader.wanted(
      loaded,
      merged,
      combinedRoots,
      byName,
      entryId,
    );
    let pending = new Set<string>([
      ...SharedGraphSetLoader.rootPackageNames(combinedRoots),
      ...seed.packages,
    ]);
    let shardQueue: ShardWork[] = seed.shards;
    let fetchAllRest = seed.fetchAllRest;
    for (;;) {
      const round = fetchAllRest
        ? fetchable.filter((d) => !loaded.has(d.name))
        : [...pending]
            .map((name) => byName.get(name))
            .filter((d): d is MfManifestShared => d !== undefined);
      const shardRound = fetchAllRest
        ? allShardWork().filter((w) => !merged.allUnits.has(w.dep.name))
        : shardQueue;
      const freshRound = round.filter((d) => !requested.has(d.name));
      const freshShards = shardRound.filter((w) =>
        w.key !== UNITS_KEY
          ? !(merged.shardKeys.get(w.dep.name)?.has(w.key) ?? false)
          : !merged.allUnits.has(w.dep.name),
      );
      if (freshRound.length === 0 && freshShards.length === 0) break;
      for (const d of freshRound) requested.add(d.name);
      const [graphs] = await Promise.all([
        Promise.all(freshRound.map(loadOne)),
        Promise.all(freshShards.map(fetchShard)),
      ]);
      for (const loadedGraph of graphs) {
        loaded.set(loadedGraph.dep.name, loadedGraph);
      }
      const want = SharedGraphSetLoader.wanted(
        loaded,
        merged,
        combinedRoots,
        byName,
        entryId,
      );
      pending = want.packages;
      shardQueue = want.shards;
      fetchAllRest = want.fetchAllRest;
    }
  }

  /**
   * Continue the fetch set on demand — the runtime twin {@link load}
   * uses after boot, when a lazy `spec:` import names a package whose
   * graph was outside the initial fetch set (R3-01): the dep's index
   * graph is fetched, then the same walk-driven rounds fetch the shard
   * or partition documents the specifier's reach needs (deep specifiers
   * and unit-identifier roots included) and the index graphs of newly
   * reached declared deps. `loaded` is seeded with the graphs already
   * fetched and is extended in place; returns the graphs this call
   * added. Partitions whose units are already merged are seeded as
   * merged via `modulePartitions`, so nothing is fetched twice.
   *
   * `fetchGraphText`/`fetchShardText` fetch raw text for the caller's
   * dedupe/cache discipline — the documents are verified against their
   * declared content identities inside `loadGraph`/`loadShard`, exactly
   * as on the boot path.
   */
  static async loadMore(
    deps: readonly MfManifestShared[],
    roots: readonly MfManifestRoot[],
    loaded: Map<string, LoadedGraph>,
    resolveAssetUrl: (location: string) => string,
    fetchGraphText: (dep: MfManifestShared, url: string) => Promise<string>,
    fetchShardText: (
      dep: MfManifestShared,
      ref: SharedDepGraphFileRef,
      url: string,
    ) => Promise<string>,
    entryId: string,
  ): Promise<LoadedGraph[]> {
    const fetchable = deps.filter((d) => d.graphFile !== undefined);
    const byName = new Map(fetchable.map((d) => [d.name, d] as const));
    const merged: MergeState = {
      shardKeys: new Map(),
      allUnits: new Set(),
      unitLocations: new Map(),
    };
    // Seed merge state for EVERY loaded graph form (R4-05): the shard
    // keys a previous round recorded on the graph itself — partitioned,
    // legacy `entryShards`/`unitsShard` and unsharded alike — so no
    // shard document is fetched twice, and the already-merged unit
    // locations so an overlapping merge duplicates no unit.
    for (const g of loaded.values()) {
      merged.unitLocations.set(
        g.dep.name,
        new Set(g.graph.units.map((u) => u.location)),
      );
      for (const key of g.mergedShardKeys ?? []) {
        SharedGraphSetLoader.markMerged(g.dep.name, key, merged);
      }
    }
    // Seed merged partition keys from the index: a partition whose units
    // already sit in the graph's unit list must not be fetched again —
    // the fallback for graphs merged before keys were recorded.
    for (const g of loaded.values()) {
      const index = g.graph.modulePartitions;
      if (index === undefined) continue;
      for (const unit of g.graph.units) {
        if (!Array.isArray(unit.modulePaths)) continue;
        for (const path of unit.modulePaths) {
          const idx = index[path];
          if (idx !== undefined) {
            SharedGraphSetLoader.markMerged(
              g.dep.name,
              partitionKey(idx),
              merged,
            );
          }
        }
      }
    }
    const loadOne = (dep: MfManifestShared): Promise<LoadedGraph> =>
      SharedUnitGraphLoader.loadGraph(
        dep,
        resolveAssetUrl(dep.graphFile!.location),
        (url) => fetchGraphText(dep, url),
        entryId,
      );
    const fetchShard = async (work: ShardWork): Promise<void> => {
      const g = loaded.get(work.dep.name);
      if (g === undefined) return;
      const ref = SharedGraphSetLoader.refFor(g.graph, work.key);
      // Record even when the ref is gone, exactly as `load` does: the
      // work is discharged either way, and an unrecorded key would be
      // re-emitted by the next `loadMore` call (R5-01).
      if (ref === undefined) {
        SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
        SharedGraphSetLoader.recordMerged(g, work.key);
        return;
      }
      const units = await SharedUnitGraphLoader.loadShard(
        work.dep,
        ref,
        resolveAssetUrl(ref.location),
        (url) => fetchShardText(work.dep, ref, url),
        entryId,
      );
      SharedGraphSetLoader.mergeUnits(g, units, merged);
      SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
      SharedGraphSetLoader.recordMerged(g, work.key);
    };
    const before = new Set(loaded.keys());
    await SharedGraphSetLoader.runRounds(
      fetchable,
      roots,
      loaded,
      merged,
      loadOne,
      fetchShard,
      byName,
      entryId,
    );
    return [...loaded.values()].filter((g) => !before.has(g.dep.name));
  }

  /**
   * The synchronous planning twin of {@link load}: the same unit-walk
   * fetch set, computed over graph and shard documents the caller reads
   * itself (`graphOf` for index graphs, `shardOf` for shard refs — both
   * may return `undefined` for a missing document, treated as an empty
   * fetch). Returns the deps whose index graphs would be fetched and
   * the shard file locations fetched beside them — the set the size
   * metric counts. A `MfeLoadError` from the walk propagates.
   */
  static fetchSet(
    deps: readonly MfManifestShared[],
    roots: readonly MfManifestRoot[] | undefined,
    extraRoots: readonly MfManifestRoot[] | undefined,
    graphOf: (dep: MfManifestShared) => SharedDepGraphFile | undefined,
    shardOf: (
      dep: MfManifestShared,
      location: string,
    ) => SharedDepGraphShard | undefined,
    entryId = 'shared-dep-graph',
  ): { deps: MfManifestShared[]; shardLocations: string[] } {
    const fetchable = deps.filter((d) => d.graphFile !== undefined);
    const byName = new Map(fetchable.map((d) => [d.name, d] as const));
    const merged: MergeState = {
      shardKeys: new Map(),
      allUnits: new Set(),
      unitLocations: new Map(),
    };
    const loaded = new Map<string, LoadedGraph>();
    const shardLocations: string[] = [];
    const seenShardLocations = new Set<string>();
    const fetchDep = (dep: MfManifestShared): void => {
      const graph = graphOf(dep);
      if (graph === undefined) return;
      loaded.set(dep.name, {
        dep,
        graph,
        graphFileLocation: dep.graphFile?.location ?? '',
      });
    };
    const fetchShard = (work: ShardWork): void => {
      const g = loaded.get(work.dep.name);
      if (g === undefined) return;
      const ref = SharedGraphSetLoader.refFor(g.graph, work.key);
      if (ref === undefined) {
        SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
        return;
      }
      const shard = shardOf(work.dep, ref.location);
      if (shard !== undefined) {
        SharedGraphSetLoader.mergeUnits(g, shard.units, merged);
        // Two shard keys may name the same document (SZ-017): the fetch
        // set lists each location once.
        if (!seenShardLocations.has(ref.location)) {
          seenShardLocations.add(ref.location);
          shardLocations.push(ref.location);
        }
      }
      SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
    };
    const allShardWork = (): ShardWork[] =>
      [...loaded.values()].flatMap((g) =>
        SharedGraphSetLoader.wholeWorks(g, merged),
      );

    if (roots === undefined) {
      for (const dep of fetchable) fetchDep(dep);
      for (const work of allShardWork()) fetchShard(work);
      return {
        deps: fetchable.filter((d) => loaded.has(d.name)),
        shardLocations,
      };
    }
    const combinedRoots: MfManifestRoot[] = [
      ...roots,
      ...(extraRoots ?? []),
    ];
    // Same fixpoint as `load` — critical here because `fetchDep`
    // no-ops when `graphOf` yields no document: the dep never enters
    // `loaded`, so `wanted` would name it every round forever.
    const requested = new Set<string>();
    let pending = SharedGraphSetLoader.rootPackageNames(combinedRoots);
    let shardQueue: ShardWork[] = [];
    let fetchAllRest = false;
    for (;;) {
      const round = fetchAllRest
        ? fetchable.filter((d) => !loaded.has(d.name))
        : [...pending]
            .map((name) => byName.get(name))
            .filter((d): d is MfManifestShared => d !== undefined);
      const shardRound = fetchAllRest
        ? allShardWork().filter((w) => !merged.allUnits.has(w.dep.name))
        : shardQueue;
      const freshRound = round.filter((d) => !requested.has(d.name));
      const freshShards = shardRound.filter(
        (w) =>
          w.key !== UNITS_KEY
            ? !(merged.shardKeys.get(w.dep.name)?.has(w.key) ?? false)
            : !merged.allUnits.has(w.dep.name),
      );
      if (freshRound.length === 0 && freshShards.length === 0) break;
      for (const d of freshRound) requested.add(d.name);
      for (const dep of freshRound) fetchDep(dep);
      for (const work of freshShards) fetchShard(work);
      const want = SharedGraphSetLoader.wanted(
        loaded,
        merged,
        combinedRoots,
        byName,
        entryId,
      );
      pending = want.packages;
      shardQueue = want.shards;
      fetchAllRest = want.fetchAllRest;
    }
    return {
      deps: fetchable.filter((d) => loaded.has(d.name)),
      shardLocations,
    };
  }
}
