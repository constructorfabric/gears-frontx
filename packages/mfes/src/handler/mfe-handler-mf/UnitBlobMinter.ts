/**
 * Unit blob minter: mints per-load blob URLs for shared-dependency unit
 * and pack source records in leaves-first order, and produces the
 * specifier→blob map the expose chain and sibling units rewrite against.
 *
 * Ported from the salvage leaves-first minting block
 * (`salvage/issue-718-impl-20261105`, `MfeHandlerMF.ts` ~lines 2565-3338),
 * reduced to a reviewable unit in the collaborator-class pattern
 * (`runtime_rebuild_approach`).
 *
 * Ordering is derived from the records' own dependency edges — a unit's
 * `relativeImports` (resolved against every member module path, F-016),
 * the record answering each bare specifier it imports (a subpath such as
 * `react/jsx-runtime`, or its own package's name from a CommonJS subpath
 * entry delivered beside its pack), plus the packages whose bare
 * specifiers appear in its source — never from `manifest.shared[]`
 * enumeration order. A cycle admits no minting
 * order and fails the load deterministically. A pack that imports a
 * package no root reached is not a false circular: readiness only ever
 * waits on packages present in this build's record set (F-018).
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import { DynamicModuleOps } from './mf-dynamic-module-ops';
import { SharedSpecifierRewriter } from './SharedSpecifierRewriter';
import { UnitDynamicImportRewriter } from './UnitDynamicImportRewriter';
import type { SharedDepSourceRecord } from './SharedUnitGraphLoader';

/**
 * How the minter handles a literal dynamic `import('<specifier>')` in a
 * unit's source: `tokenFor` resolves the specifier against the load's
 * verified graph files to the resolver token the rewritten call passes
 * to `__frontx_lazy` (or `undefined` to leave the call untouched), and
 * `loaderUrl` mints the per-load loader-stub blob URL on first use.
 */
export interface UnitDynamicImportRewrites {
  readonly loaderUrl: () => string;
  readonly tokenFor: (
    record: SharedDepSourceRecord,
    specifier: string,
  ) => string | undefined;
}

export class UnitBlobMinter {
  protected constructor() {}

  /**
   * The bare specifiers `record` answers once minted: its entry
   * specifiers (`pkg` for the package's main record or pack,
   * `pkg/<subpath>` for every `exports`-mapped subpath whose entry module
   * it owns) and `pkg/<modulePath>` (with and without `.js`) for each
   * member module path, so a `react/jsx-runtime` specifier resolves to
   * the unit that owns `jsx-runtime.js` (F-017) and
   * `@base-ui/react/button` to the unit owning `esm/button/index.js`.
   */
  static specifiersOf(record: SharedDepSourceRecord): string[] {
    const specifiers = new Set(record.entrySpecifiers);
    if (record.isPackageMain || record.modulePaths.includes('<pack>')) {
      specifiers.add(record.packageName);
    }
    for (const m of record.modulePaths) {
      if (m === '<pack>') continue;
      specifiers.add(`${record.packageName}/${m}`);
      specifiers.add(`${record.packageName}/${m.endsWith('.js') ? m.slice(0, -3) : m}`);
      // `dir/index.js` is reached by the `pkg/dir` candidate path too,
      // so the unit must claim that specifier or it survives unrewritten.
      if (m.endsWith('/index.js')) {
        specifiers.add(
          `${record.packageName}/${m.slice(0, -'/index.js'.length)}`,
        );
      }
    }
    return [...specifiers];
  }

  /**
   * Mint one blob URL per record, leaves first, and return the
   * specifier→blob-URL map covering every minted unit — the specifiers
   * `specifiersOf` lists for each record — which the expose chain and
   * sibling units rewrite against.
   *
   * `unitBlobs` is the per-load `packageName/modulePath` → blob map:
   * relative imports are resolved and dependency edges are taken against
   * EVERY unit minted for the load, so a lazily added batch can import a
   * unit the entry mint already delivered — that unit's blob answers the
   * import and adds no ordering edge. Every record minted here is
   * published into the map for later batches.
   *
   * `dynamicImports`, when given, rewrites each literal
   * `import('<specifier>')` whose specifier resolves to a unit into a
   * `__frontx_lazy('<token>')` call the per-load unit resolver answers
   * on demand; non-literal calls and unresolvable specifiers pass
   * through untouched.
   */
  static mint(
    records: readonly SharedDepSourceRecord[],
    entryId: string,
    preexisting?: ReadonlyMap<string, string>,
    unitBlobs?: Map<string, string>,
    dynamicImports?: UnitDynamicImportRewrites,
  ): Map<string, string> {
    const recordByKey = new Map(records.map((r) => [r.key, r]));
    // modulePath -> record, per package.
    const modulePathToRecord = new Map<string, SharedDepSourceRecord>();
    const packages = new Map<string, SharedDepSourceRecord[]>();
    for (const record of records) {
      const list = packages.get(record.packageName) ?? [];
      list.push(record);
      packages.set(record.packageName, list);
      for (const m of record.modulePaths) {
        modulePathToRecord.set(`${record.packageName}/${m}`, record);
      }
    }
    const recordBlob = new Map<string, string>();
    // Specifiers an earlier mint of this load already answered stay
    // answered by it — a lazily added unit never replaces an existing
    // entry (inst-lai-lazy-roots).
    const specifierToBlob = new Map(preexisting ?? []);
    const pending = new Map(recordByKey);
    // specifier -> record answering it; the first record claiming a
    // specifier keeps it, so one specifier never maps to two blobs.
    const specifierToRecord = new Map<string, SharedDepSourceRecord>();
    for (const record of records) {
      for (const specifier of UnitBlobMinter.specifiersOf(record)) {
        if (!specifierToRecord.has(specifier)) {
          specifierToRecord.set(specifier, record);
        }
      }
    }

    const depsOf = (record: SharedDepSourceRecord): Set<string> => {
      const deps = new Set<string>();
      for (const rel of record.relativeImports) {
        for (const member of record.modulePaths) {
          const resolved = SharedSpecifierRewriter.resolveRelativeModulePath(
            member,
            rel,
          );
          const pathKey = `${record.packageName}/${resolved}`;
          const target = modulePathToRecord.get(pathKey);
          if (target !== undefined && target.key !== record.key) {
            deps.add(target.key);
            break;
          }
          // A relative import resolved to a unit an earlier mint of this
          // load already delivered (entry units a lazy batch re-imports)
          // is satisfied by that blob — it adds no ordering edge.
          if (unitBlobs?.has(pathKey)) {
            break;
          }
        }
      }
      // Specifier edges: the record answering each bare specifier the
      // record imports — another package's subpath, or its own package's
      // name from a subpath entry delivered beside the pack.
      for (const specifier of record.bareSpecifiers) {
        const target = specifierToRecord.get(specifier);
        if (target !== undefined && target.key !== record.key) {
          deps.add(target.key);
        }
      }
      // Bare-dependency edges: only packages present in this build's
      // record set block readiness — a pack (or unit) importing an
      // unreached package is not a circular error (F-018).
      for (const name of packages.keys()) {
        if (name === record.packageName) continue;
        if (
          record.bareImports.includes(name) ||
          DynamicModuleOps.sourceImports(record.text, name)
        ) {
          for (const dep of packages.get(name) ?? []) {
            deps.add(dep.key);
          }
        }
      }
      return deps;
    };

    const publish = (record: SharedDepSourceRecord, blob: string): void => {
      recordBlob.set(record.key, blob);
      if (unitBlobs !== undefined) {
        for (const m of record.modulePaths) {
          if (m !== '<pack>') {
            unitBlobs.set(`${record.packageName}/${m}`, blob);
          }
        }
      }
      for (const specifier of UnitBlobMinter.specifiersOf(record)) {
        if (
          specifierToRecord.get(specifier) === record &&
          !specifierToBlob.has(specifier)
        ) {
          specifierToBlob.set(specifier, blob);
        }
      }
    };

    const relativeToBlob = (
      record: SharedDepSourceRecord,
    ): ((resolvedModulePath: string) => string | undefined) =>
      (resolved) => {
        const pathKey = `${record.packageName}/${resolved}`;
        return (
          recordBlob.get(modulePathToRecord.get(pathKey)?.key ?? '') ??
          unitBlobs?.get(pathKey)
        );
      };

    while (pending.size > 0) {
      const before = pending.size;
      for (const [key, record] of pending) {
        const deps = depsOf(record);
        if (![...deps].every((d) => recordBlob.has(d))) continue;
        let rewritten = SharedSpecifierRewriter.rewriteUnitSource(
          record.text,
          record.modulePaths,
          specifierToBlob,
          relativeToBlob(record),
        );
        if (dynamicImports !== undefined) {
          rewritten = UnitDynamicImportRewriter.rewrite(
            rewritten,
            dynamicImports.loaderUrl,
            (specifier) => dynamicImports.tokenFor(record, specifier),
          );
        }
        publish(
          record,
          URL.createObjectURL(
            new Blob([rewritten], { type: 'text/javascript' }),
          ),
        );
        pending.delete(key);
      }
      if (pending.size === before) {
        const names = [...pending.values()]
          .map((r) => `'${r.packageName}' (${r.key})`)
          .join(', ');
        throw new MfeLoadError(
          'circular shared-dependency units: no minting order exists over ' +
            `${names}.`,
          entryId,
        );
      }
    }
    return specifierToBlob;
  }
}
