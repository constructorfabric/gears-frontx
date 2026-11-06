/**
 * Per-`LoadedGraph` lookup index: modulePath → unit, the memoized main
 * unit, and unit → entry specifiers, built once per graph file and shared
 * by `SharedUnitGraphLoader.reachUnits`, the `buildPlan` fixpoint, the
 * per-unit record builder, and the lazy-chunk path — replacing the
 * linear scans each of those previously ran per unit (PERF-001/003).
 *
 * The index also carries the per-unit point-of-use validation memo: a
 * unit's field check (`unit_contract_schema_language`, finding F-023)
 * runs the first time the load reaches that unit — never for a unit of
 * an unreached package, and never twice for the same unit.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */
import { MfeLoadError } from '../../errors';
import type { SharedDepGraphUnit } from '../../unit-format/graph-file';
import type { LoadedGraph } from './SharedUnitGraphLoader';
import { SharedSpecifierRewriter } from './SharedSpecifierRewriter';

export class SharedGraphIndex {
  private static readonly cache = new WeakMap<LoadedGraph, SharedGraphIndex>();

  /** The index for `loaded`, built on first use and then shared. */
  static of(loaded: LoadedGraph): SharedGraphIndex {
    let index = SharedGraphIndex.cache.get(loaded);
    if (index === undefined) {
      index = new SharedGraphIndex(loaded);
      SharedGraphIndex.cache.set(loaded, index);
    }
    return index;
  }

  private readonly moduleIndex = new Map<string, SharedDepGraphUnit>();
  private readonly specifierCache = new Map<
    SharedDepGraphUnit,
    readonly string[]
  >();
  private readonly validated = new Set<SharedDepGraphUnit>();
  private main: SharedDepGraphUnit | undefined;
  private mainResolved = false;

  private constructor(private readonly loaded: LoadedGraph) {
    // A malformed `modulePaths` (non-array) is tolerated here — the index
    // skips it — because unit fields are validated at the point of use,
    // when the load first reaches the unit (F-023).
    for (const unit of loaded.graph.units) {
      if (!Array.isArray(unit.modulePaths)) continue;
      for (const member of unit.modulePaths) {
        this.moduleIndex.set(member, unit);
      }
    }
  }

  /** The unit owning `modulePath`, if any. */
  unitFor(modulePath: string): SharedDepGraphUnit | undefined {
    return this.moduleIndex.get(modulePath);
  }

  /**
   * The unit a bare import of the package name resolves to: the owner of
   * `entryModulePaths['.']`, else of `mainModulePath`, else the first
   * unit — memoized.
   */
  mainUnit(): SharedDepGraphUnit | undefined {
    if (!this.mainResolved) {
      const graph = this.loaded.graph;
      const mainPath = graph.entryModulePaths?.['.'] ?? graph.mainModulePath;
      this.main =
        (mainPath !== undefined ? this.unitFor(mainPath) : undefined) ??
        graph.units[0];
      this.mainResolved = true;
    }
    return this.main;
  }

  /**
   * The unit `subpath` resolves to: the owner of a declared
   * `entryModulePaths` entry, else the first unit owning a candidate
   * module path.
   */
  entryUnit(subpath: string): SharedDepGraphUnit | undefined {
    if (subpath === '') return this.mainUnit();
    const declared = this.loaded.graph.entryModulePaths?.[`./${subpath}`];
    if (declared !== undefined) return this.unitFor(declared);
    for (const candidate of SharedSpecifierRewriter.subpathModulePathCandidates(
      subpath,
    )) {
      const unit = this.unitFor(candidate);
      if (unit !== undefined) return unit;
    }
    return undefined;
  }

  /**
   * The specifiers `unit` answers through the package's entry points:
   * the package name when it is the main unit, and `name/<subpath>` for
   * every `entryModulePaths` subpath whose entry module it owns —
   * memoized per unit.
   */
  entrySpecifiersOf(unit: SharedDepGraphUnit): readonly string[] {
    let specifiers = this.specifierCache.get(unit);
    if (specifiers === undefined) {
      const graph = this.loaded.graph;
      const list: string[] = [];
      if (this.mainUnit() === unit) {
        list.push(graph.name);
      }
      const paths = Array.isArray(unit.modulePaths) ? unit.modulePaths : [];
      for (const [key, modulePath] of Object.entries(
        graph.entryModulePaths ?? {},
      )) {
        if (key !== '.' && key.startsWith('./') && paths.includes(modulePath)) {
          list.push(`${graph.name}/${key.slice(2)}`);
        }
      }
      specifiers = list;
      this.specifierCache.set(unit, specifiers);
    }
    return specifiers;
  }

  /**
   * Point-of-use field check (`unit_contract_schema_language`), run at
   * most once per unit: the fields the runtime reads must carry their
   * contract shapes, else the load fails with `MfeLoadError` naming the
   * graph file and producer — never a raw `TypeError` from an unchecked
   * field.
   */
  assertValidated(unit: SharedDepGraphUnit, entryId: string): void {
    if (this.validated.has(unit)) return;
    this.assertUnitFields(unit, entryId);
    this.validated.add(unit);
  }

  private assertUnitFields(
    unit: SharedDepGraphUnit,
    entryId: string,
  ): void {
    const graph = this.loaded.graph;
    const producer =
      graph.producer !== undefined
        ? `${graph.producer.name}@${graph.producer.version}`
        : 'unknown producer';
    const label =
      `graph file '${this.loaded.graphFileLocation}' for shared dep ` +
      `'${this.loaded.dep.name}' (producer ${producer})`;
    const fail = (field: string, expected: string): never => {
      throw new MfeLoadError(
        `${label} declares a unit with a malformed '${field}' field — ` +
          `expected ${expected}.`,
        entryId,
      );
    };
    const stringArray = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((m) => typeof m === 'string');
    if (!stringArray(unit.modulePaths) || unit.modulePaths.length === 0) {
      fail('modulePaths', 'a non-empty array of strings');
    }
    if (typeof unit.location !== 'string') {
      fail('location', 'a string');
    }
    if (typeof unit.contentHash !== 'string') {
      fail('contentHash', 'a string');
    }
    if (!stringArray(unit.relativeImports)) {
      fail('relativeImports', 'an array of strings');
    }
    if (!stringArray(unit.bareImports)) {
      fail('bareImports', 'an array of strings');
    }
    if (
      unit.bareSpecifiers !== undefined &&
      !stringArray(unit.bareSpecifiers)
    ) {
      fail('bareSpecifiers', 'an array of strings');
    }
    if (
      unit.dynamicImports !== undefined &&
      !stringArray(unit.dynamicImports)
    ) {
      fail('dynamicImports', 'an array of strings');
    }
  }
}
