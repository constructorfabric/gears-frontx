/**
 * `UnitFormatConformance` — the conformance suite shipped beside the unit
 * format contract. Any producing build's CI runs it against two independent
 * output directories of the same producer and the same inputs; any returned
 * violation fails the producer run and the output is not admitted for reuse
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-dod-unit-format-contract-conformance-suite`).
 *
 * Checks: the fixed naming rules, the content-identity chain graph file →
 * units/pack, closure of each graph file's `requires` over its units' bare
 * imports, resolution of every intra-package relative import to a unit, and
 * byte identity across the two output directories. The suite takes no type
 * system and has no test-runner dependency — it returns typed violations.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import type { SharedDepGraphFile, SharedDepGraphUnit } from './graph-file';
import type { UnitFormatViolation, UnitFormatViolationRule } from './UnitFormatViolation';

const GRAPH_NAME_PATTERN = /^(.+@.+)\.graph\.([0-9a-f]{64})\.json$/;
const PACK_NAME_PATTERN = /^(.+@.+)\.pack\.([0-9a-f]{64})\.js$/;
const UNIT_NAME_PATTERN = /^.+\.([0-9a-f]{64})\.js$/;
const NAME_HASH_PATTERN = /\.([0-9a-f]{64})\./;
const PACKAGE_DIR_PATTERN = /^(.+)@([^@/]+)$/;

interface ClassifiedFiles {
  graphs: string[];
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
  check(outputA: string, outputB: string): UnitFormatViolation[] {
    const violations = [
      ...this.checkOutput(outputA),
      ...this.checkOutput(outputB),
      ...this.compareOutputs(outputA, outputB),
    ];
    return violations;
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
    const classified: ClassifiedFiles = { graphs: [], packs: [], units: [] };
    for (const file of this.listFiles(dir)) {
      const rel = relative(dir, file);
      const base = basename(rel);
      if (GRAPH_NAME_PATTERN.test(base)) {
        if (!PACKAGE_DIR_PATTERN.test(GRAPH_NAME_PATTERN.exec(base)![1])) {
          violations.push(this.violation(dir, rel, 'naming', `graph file name "${base}" does not carry "<pkg>@<version>"`));
        }
        classified.graphs.push(rel);
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
   * closure over unit bare imports, and relative-import resolution.
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
    const allModulePaths = new Set(graph.units.flatMap((u) => u.modulePaths));
    for (const unit of graph.units) {
      this.checkUnit(dir, rel, graph, unit, allModulePaths, violations);
    }
    if (graph.pack !== undefined) {
      this.checkDeclaredHash(dir, rel, graph.pack.location, graph.pack.contentHash, 'pack', violations);
    }
  }

  /**
   * Check one unit's declared content identity against its bytes, its bare
   * imports against the graph's `requires`, and its relative imports
   * against the package's module paths.
   */
  private checkUnit(
    dir: string,
    graphRel: string,
    graph: SharedDepGraphFile,
    unit: SharedDepGraphUnit,
    allModulePaths: ReadonlySet<string>,
    violations: UnitFormatViolation[],
  ): void {
    this.checkDeclaredHash(dir, graphRel, unit.location, unit.contentHash, 'unit', violations);
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
    for (const specifier of unit.relativeImports) {
      const resolved = this.resolveRelativeImport(unit, specifier);
      if (!allModulePaths.has(resolved)) {
        violations.push(
          this.violation(
            dir,
            graphRel,
            'relative-import',
            `unit ${unit.location} relative import "${specifier}" resolves to "${resolved}", owned by no unit of ${graph.name}@${graph.version}`,
          ),
        );
      }
    }
  }

  /**
   * Resolve a unit's relative import against its first member module path —
   * the entry module of the strongly connected component — using URL
   * resolution, so `'./foo.js'` from a unit whose module path is `'bar.js'`
   * names `'foo.js'`.
   */
  private resolveRelativeImport(unit: SharedDepGraphUnit, specifier: string): string {
    const baseModule = unit.modulePaths[0] ?? '';
    return new URL(specifier, new URL(baseModule, 'http://r/')).pathname.slice(1);
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
