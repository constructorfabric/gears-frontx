/**
 * `UnitFormatConformance` — the conformance suite shipped beside the unit
 * format contract. Any producing build's CI runs it against two independent
 * output directories of the same producer and the same inputs; any returned
 * violation fails the producer run and the output is not admitted for reuse
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-dod-unit-format-contract-conformance-suite`).
 *
 * Checks: the fixed naming rules, the content-identity chain graph file →
 * units/pack — extended to manifest → graph when a manifest path is
 * supplied — closure of each graph file's `requires` over its units' and
 * pack's bare imports, each unit's and the pack's bare specifiers against
 * their bare imports, declared `entryModulePaths` against unit module
 * paths, resolution of every intra-package relative import to a unit
 * (against every member module path), and byte identity across the two
 * output directories. The suite takes no type system and has no
 * test-runner dependency — it returns typed violations.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import type {
  SharedDepGraphFile,
  SharedDepGraphFileRef,
  SharedDepGraphShard,
  SharedDepGraphUnit,
} from './graph-file';
import type { UnitFormatViolation, UnitFormatViolationRule } from './UnitFormatViolation';

const GRAPH_NAME_PATTERN = /^(.+@.+)\.graph\.([0-9a-f]{64})\.json$/;
const SHARD_NAME_PATTERN = /^(.+@.+)\.(units|shard-.+|part-.+)\.([0-9a-f]{64})\.json$/;
const PACK_NAME_PATTERN = /^(.+@.+)\.pack\.([0-9a-f]{64})\.js$/;
const UNIT_NAME_PATTERN = /^.+\.([0-9a-f]{64})\.js$/;
const NAME_HASH_PATTERN = /\.([0-9a-f]{64})\./;
const PACKAGE_DIR_PATTERN = /^(.+)@([^@/]+)$/;

interface ClassifiedFiles {
  graphs: string[];
  /** Shard/partition documents — checked through graph refs, not by name. */
  shardDocs: string[];
  packs: string[];
  units: string[];
}

/**
 * The conformance suite for the shared-dependency unit format contract.
 */
export class UnitFormatConformance {
  /**
   * Check two independent output directories of the same producer and the
   * same inputs. Returns one typed violation per contract failure — naming
   * the violated rule and the offending file — or an empty list when both
   * directories conform and agree byte for byte.
   */
  check(outputA: string, outputB: string, manifestPath?: string): UnitFormatViolation[] {
    return this.checkAll([outputA, outputB], manifestPath);
  }

  /**
   * Check any number of independent output directories of the same
   * producer and the same inputs — built under different install
   * layouts or consumer configs — and require them byte-identical:
   * each directory is checked against the contract, then every
   * directory is compared byte for byte against the first. Returns one
   * typed violation per contract failure — naming the violated rule and
   * the offending file — or an empty list when every directory conforms
   * and all agree byte for byte. A single directory checks conformance
   * only, with no pair to compare.
   */
  checkAll(outputDirs: readonly string[], manifestPath?: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    for (const dir of outputDirs) {
      violations.push(...this.checkOutput(dir));
    }
    const [first, ...rest] = outputDirs;
    if (first !== undefined) {
      for (const dir of rest) {
        violations.push(...this.compareOutputs(first, dir));
      }
    }
    if (manifestPath !== undefined && first !== undefined) {
      // Run once: the manifest→graph leg resolves against the manifest's
      // own directory and declared bases, so checking it per output
      // directory only duplicates violations.
      violations.push(...this.checkManifestLeg(manifestPath, first));
    }
    return violations;
  }

  /**
   * The manifest→graph leg of the hash chain: each `shared[]` entry's
   * `graphFile` reference must name a file present relative to the
   * manifest's shared base — `metaData.sharedBase` when given, else
   * `metaData.publicPath`, resolved against the manifest file's
   * directory when relative — the file's SHA-256 must equal the declared
   * `contentHash`, and the parsed graph's `name`/`version` must match the
   * manifest entry. A base or location resolving to a remote URL has no
   * filesystem leg to check and is skipped.
   */
  private checkManifestLeg(manifestPath: string, dir: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    let manifest: {
      metaData?: { sharedBase?: unknown; publicPath?: unknown };
      shared?: { name?: unknown; version?: unknown; graphFile?: { location?: unknown; contentHash?: unknown } }[];
    };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      violations.push(
        this.violation(dir, manifestPath, 'graph-format', `manifest is not parseable JSON: ${(error as Error).message}`),
      );
      return violations;
    }
    const manifestDir = dirname(manifestPath);
    const meta = manifest.metaData;
    const base =
      typeof meta?.sharedBase === 'string'
        ? meta.sharedBase
        : typeof meta?.publicPath === 'string'
          ? meta.publicPath
          : undefined;
    for (const dep of manifest.shared ?? []) {
      const ref = dep.graphFile;
      if (ref === undefined || typeof ref.location !== 'string' || typeof ref.contentHash !== 'string') {
        continue;
      }
      const graphPath = this.resolveGraphLocation(manifestDir, base, ref.location);
      if (graphPath === undefined) {
        // An absolute-URL location or a remote base has no filesystem
        // file to check — the runtime verifies those at fetch time.
        continue;
      }
      let actual: string;
      try {
        actual = this.sha256File(graphPath);
      } catch {
        violations.push(
          this.violation(dir, ref.location, 'hash-chain', `manifest declares ${dep.name} graph file at "${ref.location}" but no such file exists`),
        );
        continue;
      }
      if (actual !== ref.contentHash) {
        violations.push(
          this.violation(dir, ref.location, 'hash-chain', `manifest declares ${dep.name} graphFile contentHash ${ref.contentHash} but file SHA-256 is ${actual}`),
        );
        continue;
      }
      try {
        const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as SharedDepGraphFile;
        if (graph.name !== dep.name || graph.version !== dep.version) {
          violations.push(
            this.violation(dir, ref.location, 'hash-chain', `manifest entry '${dep.name}@${dep.version}' references a graph file for '${graph.name}@${graph.version}'`),
          );
        }
      } catch (error) {
        violations.push(
          this.violation(dir, ref.location, 'graph-format', `graph file is not parseable JSON: ${(error as Error).message}`),
        );
      }
    }
    return violations;
  }

  /**
   * Resolve a `graphFile.location` to a filesystem path by the contract
   * rule: relative to the manifest's shared base (`metaData.sharedBase`
   * when given, else `metaData.publicPath`), and relative to the
   * manifest file's directory when that base is relative. Returns
   * `undefined` when the location or the base is an absolute URL — a
   * remote reference has no file leg.
   */
  private resolveGraphLocation(
    manifestDir: string,
    base: string | undefined,
    location: string,
  ): string | undefined {
    if (/^https?:\/\//i.test(location)) return undefined;
    const relativeLocation = location.replace(/^\/+/, '');
    if (base === undefined || base === '') {
      return join(manifestDir, relativeLocation);
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(base)) return undefined;
    if (base.startsWith('//')) return undefined;
    const basePath = base.startsWith('/') ? base : join(manifestDir, base);
    return join(basePath, relativeLocation);
  }

  /**
   * Run the per-directory checks over one producer output directory: file
   * naming, graph-file parsing, the hash chain, `requires` closure, and
   * intra-package relative-import resolution.
   */
  private checkOutput(dir: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    const classified = this.classifyFiles(dir, violations);
    for (const graphPath of classified.graphs) {
      this.checkGraph(dir, graphPath, violations);
    }
    for (const packPath of classified.packs) {
      this.checkFileNameHash(dir, packPath, violations);
    }
    for (const unitPath of classified.units) {
      this.checkFileNameHash(dir, unitPath, violations);
    }
    return violations;
  }

  /**
   * Walk an output directory and classify every file by the contract's
   * naming rules; files matching none are naming violations.
   */
  private classifyFiles(dir: string, violations: UnitFormatViolation[]): ClassifiedFiles {
    const classified: ClassifiedFiles = { graphs: [], shardDocs: [], packs: [], units: [] };
    for (const file of this.listFiles(dir)) {
      const rel = relative(dir, file);
      const base = basename(rel);
      if (GRAPH_NAME_PATTERN.test(base)) {
        if (!PACKAGE_DIR_PATTERN.test(GRAPH_NAME_PATTERN.exec(base)![1])) {
          violations.push(this.violation(dir, rel, 'naming', `graph file name "${base}" does not carry "<pkg>@<version>"`));
        }
        classified.graphs.push(rel);
      } else if (SHARD_NAME_PATTERN.test(base)) {
        if (!PACKAGE_DIR_PATTERN.test(SHARD_NAME_PATTERN.exec(base)![1])) {
          violations.push(this.violation(dir, rel, 'naming', `shard file name "${base}" does not carry "<pkg>@<version>"`));
        }
        classified.shardDocs.push(rel);
      } else if (PACK_NAME_PATTERN.test(base)) {
        if (!PACKAGE_DIR_PATTERN.test(PACK_NAME_PATTERN.exec(base)![1])) {
          violations.push(this.violation(dir, rel, 'naming', `pack file name "${base}" does not carry "<pkg>@<version>"`));
        }
        classified.packs.push(rel);
      } else if (UNIT_NAME_PATTERN.test(base)) {
        const parent = basename(dirname(rel));
        if (dirname(rel) === '.' || !PACKAGE_DIR_PATTERN.test(parent)) {
          violations.push(
            this.violation(dir, rel, 'naming', `unit file "${rel}" is not inside a "<pkg>@<version>" directory`),
          );
        }
        classified.units.push(rel);
      } else {
        violations.push(this.violation(dir, rel, 'naming', `file "${rel}" matches no unit-format naming rule`));
      }
    }
    return classified;
  }

  /**
   * Parse a graph file and run its checks: name-hash against content,
   * per-unit and per-pack declared hashes against bytes, `requires`
   * closure over unit bare imports, relative-import resolution, and
   * resolution of every declared entry module path to a unit.
   */
  private checkGraph(dir: string, rel: string, violations: UnitFormatViolation[]): void {
    this.checkFileNameHash(dir, rel, violations);
    let graph: SharedDepGraphFile;
    try {
      graph = JSON.parse(readFileSync(join(dir, rel), 'utf8')) as SharedDepGraphFile;
    } catch (error) {
      violations.push(
        this.violation(dir, rel, 'graph-format', `graph file is not parseable JSON: ${(error as Error).message}`),
      );
      return;
    }
    if (
      typeof graph.name !== 'string' ||
      typeof graph.version !== 'string' ||
      (graph.unitMode !== 'units' && graph.unitMode !== 'single') ||
      !Array.isArray(graph.units)
    ) {
      violations.push(
        this.violation(dir, rel, 'graph-format', 'graph file lacks required fields (name, version, unitMode, units)'),
      );
      return;
    }
    // Shard and partition documents (R3-02): a sharded graph's index
    // carries no units of its own — every shard/partition ref is read,
    // hash-verified and name/version-checked, and its units run the same
    // checks as inline units. Locations are deduped: overlapping entry
    // shards may cite one document.
    const shardCache = new Map<string, SharedDepGraphShard | undefined>();
    const shardRefs: SharedDepGraphFileRef[] = [
      ...Object.values(graph.entryShards ?? {}),
      ...(graph.unitsShard !== undefined ? [graph.unitsShard] : []),
      ...(graph.unitPartitions ?? []),
    ];
    const shardDocs: SharedDepGraphShard[] = [];
    for (const shardRef of shardRefs) {
      const doc = this.readShardDoc(dir, rel, graph, shardRef, shardCache, violations);
      if (doc !== undefined) shardDocs.push(doc);
    }
    const seenUnitLocations = new Set<string>();
    const allUnits = [...graph.units, ...shardDocs.flatMap((d) => d.units)].filter(
      (unit) => {
        if (seenUnitLocations.has(unit.location)) return false;
        seenUnitLocations.add(unit.location);
        return true;
      },
    );
    const allModulePaths = new Set(allUnits.flatMap((u) => u.modulePaths));
    for (const unit of allUnits) {
      this.checkUnit(dir, rel, graph, unit, allModulePaths, violations);
    }
    this.checkPartitionIndex(dir, rel, graph, shardCache, violations);
    for (const [subpath, modulePath] of Object.entries(graph.entryModulePaths ?? {})) {
      if (!allModulePaths.has(modulePath)) {
        violations.push(
          this.violation(
            dir,
            rel,
            'graph-format',
            `entry "${subpath}" names module path "${modulePath}", owned by no unit of ${graph.name}@${graph.version}`,
          ),
        );
      }
    }
    if (graph.pack !== undefined) {
      this.checkDeclaredHash(dir, rel, graph.pack.location, UnitFormatConformance.declaredHashOf(graph.pack, 'pack'), 'pack', violations);
      // The pack obeys the same requires/bareImports rules as a unit.
      for (const bare of graph.pack.bareImports ?? []) {
        if (!graph.requires?.includes(bare)) {
          violations.push(
            this.violation(
              dir,
              rel,
              'requires-closure',
              `pack ${graph.pack.location} keeps bare import "${bare}" external but the graph's requires does not declare it`,
            ),
          );
        }
      }
      for (const specifier of graph.pack.bareSpecifiers ?? []) {
        const segments = specifier.split('/');
        const packageName = segments.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
        if (!(graph.pack.bareImports ?? []).includes(packageName)) {
          violations.push(
            this.violation(
              dir,
              rel,
              'requires-closure',
              `pack ${graph.pack.location} imports bare specifier "${specifier}" but its bareImports does not list "${packageName}"`,
            ),
          );
        }
      }
    }
  }

  /**
   * Read, hash-verify and validate one shard/partition document a graph
   * references (R3-02): the file must exist at `ref.location`, its
   * SHA-256 must equal `ref.contentHash`, and the parsed document must
   * carry `{name, version, units}` matching the graph — the same checks
   * the runtime applies at fetch time. Results are memoized through
   * `cache` so a document cited under two keys is read once.
   */
  private readShardDoc(
    dir: string,
    graphRel: string,
    graph: SharedDepGraphFile,
    ref: SharedDepGraphFileRef,
    cache: Map<string, SharedDepGraphShard | undefined>,
    violations: UnitFormatViolation[],
  ): SharedDepGraphShard | undefined {
    if (cache.has(ref.location)) return cache.get(ref.location);
    const fail = (rule: UnitFormatViolationRule, detail: string): undefined => {
      violations.push(this.violation(dir, graphRel, rule, detail));
      cache.set(ref.location, undefined);
      return undefined;
    };
    let text: string;
    try {
      text = readFileSync(join(dir, ref.location), 'utf8');
    } catch {
      return fail(
        'hash-chain',
        `graph declares shard at "${ref.location}" but no such file exists`,
      );
    }
    const actual = this.sha256File(join(dir, ref.location));
    if (actual !== ref.contentHash) {
      return fail(
        'hash-chain',
        `graph declares shard "${ref.location}" contentHash ${ref.contentHash} but file SHA-256 is ${actual}`,
      );
    }
    let doc: SharedDepGraphShard;
    try {
      doc = JSON.parse(text) as SharedDepGraphShard;
    } catch (error) {
      return fail(
        'graph-format',
        `shard file "${ref.location}" is not parseable JSON: ${(error as Error).message}`,
      );
    }
    if (
      doc.name !== graph.name ||
      doc.version !== graph.version ||
      !Array.isArray(doc.units)
    ) {
      return fail(
        'graph-format',
        `shard file "${ref.location}" does not carry the name, version and units of ${graph.name}@${graph.version}`,
      );
    }
    cache.set(ref.location, doc);
    return doc;
  }

  /**
   * The `unitPartitions`/`modulePartitions` pair, when declared: the two
   * fields must appear together, every index entry must name a valid
   * partition owning the module path, and every member module path of
   * every partition unit must be indexed back to its partition — the
   * bijection the runtime's module-path → partition resolution needs
   * (SZ-014/015/016).
   */
  private checkPartitionIndex(
    dir: string,
    graphRel: string,
    graph: SharedDepGraphFile,
    shardCache: ReadonlyMap<string, SharedDepGraphShard | undefined>,
    violations: UnitFormatViolation[],
  ): void {
    if (graph.unitPartitions === undefined && graph.modulePartitions === undefined) {
      return;
    }
    if (graph.unitPartitions === undefined || graph.modulePartitions === undefined) {
      violations.push(
        this.violation(
          dir,
          graphRel,
          'graph-format',
          'unitPartitions and modulePartitions must be declared together',
        ),
      );
      return;
    }
    const parts = graph.unitPartitions.map((ref) => shardCache.get(ref.location));
    for (const [path, idx] of Object.entries(graph.modulePartitions)) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= parts.length) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'graph-format',
            `modulePartitions["${path}"] names partition ${idx}, outside the ${parts.length} declared partitions`,
          ),
        );
        continue;
      }
      const doc = parts[idx];
      if (doc !== undefined && !doc.units.some((u) => u.modulePaths.includes(path))) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'graph-format',
            `modulePartitions["${path}"] names partition ${idx} but no unit of that partition owns it`,
          ),
        );
      }
    }
    for (const [i, doc] of parts.entries()) {
      if (doc === undefined) continue;
      for (const unit of doc.units) {
        for (const path of unit.modulePaths) {
          if (graph.modulePartitions[path] !== i) {
            violations.push(
              this.violation(
                dir,
                graphRel,
                'graph-format',
                `unit member "${path}" of partition ${i} is not indexed to it by modulePartitions`,
              ),
            );
          }
        }
      }
    }
  }

  /**
   * The content identity a unit or pack declares: its `contentHash`, or
   * the `.<64-hex>.js` filename segment of its `location` when the field
   * is omitted (compact hash encoding). An underivable hash fails as a
   * declared-hash mismatch downstream.
   */
  private static declaredHashOf(
    holder: { contentHash?: string; location: string },
    kind: string,
  ): string {
    if (typeof holder.contentHash === 'string') return holder.contentHash;
    const derived = /\.([0-9a-f]{64})\.[cm]?js$/.exec(holder.location)?.[1];
    return derived ?? `<no declared ${kind} hash>`;
  }

  /**
   * Check one unit's declared content identity against its bytes, its bare
   * imports against the graph's `requires`, its bare specifiers against its
   * bare imports, and its relative imports against the package's module
   * paths.
   */
  private checkUnit(
    dir: string,
    graphRel: string,
    graph: SharedDepGraphFile,
    unit: SharedDepGraphUnit,
    allModulePaths: ReadonlySet<string>,
    violations: UnitFormatViolation[],
  ): void {
    this.checkDeclaredHash(dir, graphRel, unit.location, UnitFormatConformance.declaredHashOf(unit, 'unit'), 'unit', violations);
    for (const bare of unit.bareImports) {
      if (!graph.requires?.includes(bare)) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'requires-closure',
            `unit ${unit.location} keeps bare import "${bare}" external but the graph's requires does not declare it`,
          ),
        );
      }
    }
    for (const specifier of unit.bareSpecifiers ?? []) {
      const segments = specifier.split('/');
      const packageName = segments.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
      if (!unit.bareImports.includes(packageName)) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'requires-closure',
            `unit ${unit.location} imports bare specifier "${specifier}" but its bareImports does not list "${packageName}"`,
          ),
        );
      }
    }
    for (const specifier of unit.relativeImports) {
      // The runtime resolves against EVERY member module path (F-016):
      // the import issues from whichever member could carry it, so the
      // check fails only when no member's resolution lands on an owned
      // module path.
      const resolutions = unit.modulePaths.map((member) =>
        this.resolveRelative(member, specifier),
      );
      if (!resolutions.some((resolved) => allModulePaths.has(resolved))) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'relative-import',
            `unit ${unit.location} relative import "${specifier}" resolves to "${resolutions[0] ?? ''}", owned by no unit of ${graph.name}@${graph.version}`,
          ),
        );
      }
    }
    // Every specifier the producer recorded in `dynamicImports` must
    // resolve: a relative specifier to a unit of the same package
    // (checked like a relative import, against every member module
    // path), a bare specifier to a package the graph's `requires`
    // declares.
    for (const specifier of unit.dynamicImports ?? []) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolutions = unit.modulePaths.map((member) =>
          this.resolveRelative(member, specifier),
        );
        if (!resolutions.some((resolved) => allModulePaths.has(resolved))) {
          violations.push(
            this.violation(
              dir,
              graphRel,
              'relative-import',
              `unit ${unit.location} dynamic import "${specifier}" resolves to "${resolutions[0] ?? ''}", owned by no unit of ${graph.name}@${graph.version}`,
            ),
          );
        }
        continue;
      }
      const segments = specifier.split('/');
      const packageName = segments.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
      if (!graph.requires?.includes(packageName)) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'requires-closure',
            `unit ${unit.location} dynamically imports bare specifier "${specifier}" but the graph's requires does not declare "${packageName}"`,
          ),
        );
      }
    }
  }

  /**
   * Resolve `specifier` against the directory of `memberModulePath` using
   * URL resolution — the same semantics the runtime applies per member.
   */
  private resolveRelative(memberModulePath: string, specifier: string): string {
    return new URL(specifier, new URL(memberModulePath, 'http://r/')).pathname.slice(1);
  }

  /**
   * Verify that a content-addressed file's name hash equals the SHA-256 of
   * its bytes.
   */
  private checkFileNameHash(dir: string, rel: string, violations: UnitFormatViolation[]): void {
    const match = basename(rel).match(NAME_HASH_PATTERN);
    if (match === null) return;
    const actual = this.sha256File(join(dir, rel));
    if (actual !== match[1]) {
      violations.push(
        this.violation(dir, rel, 'hash-chain', `file name hash ${match[1]} does not match content SHA-256 ${actual}`),
      );
    }
  }

  /**
   * Verify that a declared content identity matches the SHA-256 of the file
   * at the declared location, relative to the output directory.
   */
  private checkDeclaredHash(
    dir: string,
    graphRel: string,
    location: string,
    contentHash: string,
    kind: string,
    violations: UnitFormatViolation[],
  ): void {
    const path = join(dir, location);
    let actual: string;
    try {
      actual = this.sha256File(path);
    } catch {
      violations.push(
        this.violation(dir, graphRel, 'hash-chain', `graph declares ${kind} at "${location}" but no such file exists`),
      );
      return;
    }
    if (actual !== contentHash) {
      violations.push(
        this.violation(
          dir,
          location,
          'hash-chain',
          `graph declares ${kind} contentHash ${contentHash} but file SHA-256 is ${actual}`,
        ),
      );
    }
  }

  /**
   * Compare two output directories byte for byte: identical relative file
   * sets, identical bytes per file.
   */
  private compareOutputs(dirA: string, dirB: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    const filesA = new Map(this.listFiles(dirA).map((f) => [relative(dirA, f), f] as const));
    const filesB = new Map(this.listFiles(dirB).map((f) => [relative(dirB, f), f] as const));
    for (const rel of filesA.keys()) {
      if (!filesB.has(rel)) {
        violations.push(this.violation(dirB, rel, 'byte-identity', `present in ${dirA} but absent from ${dirB}`));
      }
    }
    for (const rel of filesB.keys()) {
      if (!filesA.has(rel)) {
        violations.push(this.violation(dirA, rel, 'byte-identity', `present in ${dirB} but absent from ${dirA}`));
      }
    }
    for (const [rel, pathA] of filesA) {
      const pathB = filesB.get(rel);
      if (pathB !== undefined && !readFileSync(pathA).equals(readFileSync(pathB))) {
        violations.push(this.violation(dirA, rel, 'byte-identity', `file "${rel}" differs between ${dirA} and ${dirB}`));
      }
    }
    return violations;
  }

  /** Recursively list every regular file under `dir`. */
  private listFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        files.push(...this.listFiles(path));
      } else {
        files.push(path);
      }
    }
    return files;
  }

  private sha256File(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  private violation(
    dir: string,
    rel: string,
    rule: UnitFormatViolationRule,
    detail: string,
  ): UnitFormatViolation {
    const file = rel.startsWith(dir) ? rel : `${dir}${sep}${rel}`;
    return { rule, file, detail };
  }
}
