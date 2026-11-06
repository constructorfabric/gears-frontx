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
  /** `'<units>'` for the whole-unit-list shard, else an `entryShards` key. */
  key: string;
}

const UNITS_KEY = '<units>';

/** Merge state one pass accumulates, per package name. */
interface MergeState {
  /** Entry shard keys already merged into the loaded graph. */
  entryShards: Map<string, Set<string>>;
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

  /**
   * The shard work a specifier of `dep`'s package needs: the first
   * matching `entryShards` key (`'.'` for the package name, `'./sub'`
   * or its module-path candidates for a subpath), else the whole-unit
   * list — nothing when the package is not sharded or the unit set is
   * already complete.
   */
  private static shardFor(
    loaded: LoadedGraph,
    subpath: string,
    merged: MergeState,
  ): ShardWork | undefined {
    const graph = loaded.graph;
    if (graph.unitsShard === undefined && graph.entryShards === undefined) {
      return undefined;
    }
    const name = loaded.dep.name;
    if (merged.allUnits.has(name)) return undefined;
    const mergedKeys = merged.entryShards.get(name) ?? new Set<string>();
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
      if (!mergedKeys.has(key)) return { dep: loaded.dep, key };
      return undefined;
    }
    if (graph.unitsShard !== undefined) return { dep: loaded.dep, key: UNITS_KEY };
    return undefined;
  }

  /** Whole-package work for `dep`, when loaded and sharded. */
  private static allUnitsWork(
    name: string,
    loaded: ReadonlyMap<string, LoadedGraph>,
    merged: MergeState,
  ): ShardWork | undefined {
    const g = loaded.get(name);
    if (g === undefined || g.graph.unitsShard === undefined) return undefined;
    if (merged.allUnits.has(name)) return undefined;
    return { dep: g.dep, key: UNITS_KEY };
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
        const work = SharedGraphSetLoader.allUnitsWork(name, loaded, merged);
        if (work !== undefined) shards.push(work);
        return;
      }
      const work = SharedGraphSetLoader.shardFor(g, subpath, merged);
      if (work !== undefined) shards.push(work);
    };
    const needSpecifier = (specifier: string): void => {
      const { name, subpath } = SharedEntryResolver.split(specifier);
      need(name, subpath);
    };
    // Roots: string roots name specifiers; unit-id roots need the whole
    // unit list of a sharded package (no shard key a module path maps to).
    for (const root of combinedRoots) {
      if (typeof root === 'string') {
        needSpecifier(root);
      } else if (root !== null && typeof root === 'object') {
        need(root.name, undefined);
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
    const set = merged.entryShards.get(name) ?? new Set<string>();
    set.add(key);
    merged.entryShards.set(name, set);
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
      entryShards: new Map(),
      allUnits: new Set(),
      unitLocations: new Map(),
    };
    const loaded = new Map<string, LoadedGraph>();
    const fetchShard = async (work: ShardWork): Promise<void> => {
      const g = loaded.get(work.dep.name);
      if (g === undefined) return;
      const ref =
        work.key === UNITS_KEY
          ? g.graph.unitsShard
          : g.graph.entryShards?.[work.key];
      // Mark even when the ref is gone: the work is discharged either
      // way, and leaving it unmerged would re-emit it every round.
      if (ref === undefined) {
        SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
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
    };
    const allShardWork = (): ShardWork[] =>
      [...loaded.values()]
        .filter((g) => g.graph.unitsShard !== undefined)
        .map((g) => ({ dep: g.dep, key: UNITS_KEY }));

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
    // Fixpoint on the fetch set: a package is requested at most once
    // (`wanted` keeps naming a reached package until it loads, so
    // gating on `loaded` alone would re-request a fetch that yields no
    // graph forever), and a round that has nothing to do — every wanted
    // dep already requested or loaded, every wanted shard already
    // merged — ends the loop even when `wanted` still flags
    // `fetchAllRest` (a reached package recording no lazy imports and
    // no `requires` keeps flagging it after the last fetch).
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
        ? allShardWork().filter(
            (w) => !merged.allUnits.has(w.dep.name),
          )
        : shardQueue;
      const freshRound = round.filter((d) => !requested.has(d.name));
      const freshShards = shardRound.filter(
        (w) =>
          w.key !== UNITS_KEY
            ? !(merged.entryShards.get(w.dep.name)?.has(w.key) ?? false)
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
    return fetchable
      .map((d) => loaded.get(d.name))
      .filter((g): g is LoadedGraph => g !== undefined);
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
      entryShards: new Map(),
      allUnits: new Set(),
      unitLocations: new Map(),
    };
    const loaded = new Map<string, LoadedGraph>();
    const shardLocations: string[] = [];
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
      const ref =
        work.key === UNITS_KEY
          ? g.graph.unitsShard
          : g.graph.entryShards?.[work.key];
      if (ref === undefined) {
        SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
        return;
      }
      const shard = shardOf(work.dep, ref.location);
      if (shard !== undefined) {
        SharedGraphSetLoader.mergeUnits(g, shard.units, merged);
        shardLocations.push(ref.location);
      }
      SharedGraphSetLoader.markMerged(work.dep.name, work.key, merged);
    };
    const allShardWork = (): ShardWork[] =>
      [...loaded.values()]
        .filter((g) => g.graph.unitsShard !== undefined)
        .map((g) => ({ dep: g.dep, key: UNITS_KEY }));

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
            ? !(merged.entryShards.get(w.dep.name)?.has(w.key) ?? false)
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
