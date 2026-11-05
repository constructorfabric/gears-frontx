/**
 * Entry resolution for shared-dependency graph files: which unit a bare
 * specifier — a package name or one of its subpaths — names inside a
 * package's graph file, and which specifiers a unit answers.
 *
 * A subpath is resolved through the graph file's `entryModulePaths`, the
 * producer's record of the package's `exports` map (`'./client'` →
 * `'client.js'`, `'./button'` → `'esm/button/index.js'`), so an
 * exports-mapped subpath reaches the unit that owns its entry module. A
 * graph file without the field keeps the earlier behaviour: the package
 * name resolves through `mainModulePath` (first unit when absent) and a
 * subpath through the candidate module paths
 * `SharedSpecifierRewriter.subpathModulePathCandidates` derives.
 *
 * One class per file, all members static and pure (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import type {
  SharedDepGraphFile,
  SharedDepGraphUnit,
} from '../../unit-format/graph-file';
import { SharedSpecifierRewriter } from './SharedSpecifierRewriter';

/** A bare specifier split into its package name and subpath. */
export interface SharedSpecifierParts {
  /** Package name, scope included (`react`, `@scope/pkg`). */
  readonly name: string;
  /** Subpath below the package name without a leading `/`; `''` for the package itself. */
  readonly subpath: string;
}

export class SharedEntryResolver {
  protected constructor() {}

  /** Split `specifier` into package name and subpath, honouring scoped names. */
  static split(specifier: string): SharedSpecifierParts {
    const segments = specifier.split('/');
    const nameLength = specifier.startsWith('@') ? 2 : 1;
    return {
      name: segments.slice(0, nameLength).join('/'),
      subpath: segments.slice(nameLength).join('/'),
    };
  }

  /** The unit owning `modulePath`, if any. */
  static unitForModulePath(
    graph: SharedDepGraphFile,
    modulePath: string,
  ): SharedDepGraphUnit | undefined {
    return graph.units.find((unit) => unit.modulePaths.includes(modulePath));
  }

  /**
   * The unit a bare import of the package name resolves to: the owner of
   * `entryModulePaths['.']`, else of `mainModulePath`, else the first unit.
   */
  static mainUnit(graph: SharedDepGraphFile): SharedDepGraphUnit | undefined {
    const mainPath = graph.entryModulePaths?.['.'] ?? graph.mainModulePath;
    return (
      (mainPath !== undefined
        ? SharedEntryResolver.unitForModulePath(graph, mainPath)
        : undefined) ?? graph.units[0]
    );
  }

  /**
   * The unit `subpath` of the package resolves to. A subpath the graph's
   * `entryModulePaths` declares resolves to the owner of its entry module
   * and to nothing else; one it does not declare falls back to the
   * candidate module paths.
   */
  static entryUnit(
    graph: SharedDepGraphFile,
    subpath: string,
  ): SharedDepGraphUnit | undefined {
    if (subpath === '') {
      return SharedEntryResolver.mainUnit(graph);
    }
    const declared = graph.entryModulePaths?.[`./${subpath}`];
    if (declared !== undefined) {
      return SharedEntryResolver.unitForModulePath(graph, declared);
    }
    for (const candidate of SharedSpecifierRewriter.subpathModulePathCandidates(
      subpath,
    )) {
      const unit = SharedEntryResolver.unitForModulePath(graph, candidate);
      if (unit !== undefined) {
        return unit;
      }
    }
    return undefined;
  }

  /**
   * The specifiers `unit` answers through the package's entry points: the
   * package name when it is the main unit, and `name/<subpath>` for every
   * `entryModulePaths` subpath whose entry module it owns.
   */
  static entrySpecifiersOf(
    graph: SharedDepGraphFile,
    unit: SharedDepGraphUnit,
  ): string[] {
    const specifiers: string[] = [];
    if (SharedEntryResolver.mainUnit(graph) === unit) {
      specifiers.push(graph.name);
    }
    for (const [key, modulePath] of Object.entries(
      graph.entryModulePaths ?? {},
    )) {
      if (key !== '.' && key.startsWith('./') && unit.modulePaths.includes(modulePath)) {
        specifiers.push(`${graph.name}/${key.slice(2)}`);
      }
    }
    return specifiers;
  }

  /**
   * The bare specifiers a unit imports: its `bareSpecifiers` when the
   * producer recorded them (subpaths included), else its `bareImports`
   * package names.
   */
  static importedSpecifiers(unit: {
    readonly bareImports?: readonly string[];
    readonly bareSpecifiers?: readonly string[];
  }): readonly string[] {
    return unit.bareSpecifiers ?? unit.bareImports ?? [];
  }
}
