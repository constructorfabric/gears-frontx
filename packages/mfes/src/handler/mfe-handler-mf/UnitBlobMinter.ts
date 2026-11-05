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
 * `relativeImports` (resolved against every member module path, F-016)
 * plus the packages whose bare specifiers appear in its source — never
 * from `manifest.shared[]` enumeration order. A cycle admits no minting
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
import type { SharedDepSourceRecord } from './SharedUnitGraphLoader';

export class UnitBlobMinter {
  protected constructor() {}

  /**
   * Mint one blob URL per record, leaves first, and return the
   * specifier→blob-URL map covering every minted unit: `pkg` for the
   * package's main record, `pkg/<modulePath>` (with and without `.js`)
   * for each member module path, so a `react/jsx-runtime` specifier in
   * an expose chunk or sibling unit resolves to the unit that owns
   * `jsx-runtime.js` (F-017).
   */
  static mint(
    records: readonly SharedDepSourceRecord[],
    entryId: string,
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
    const specifierToBlob = new Map<string, string>();
    const pending = new Map(recordByKey);

    const depsOf = (record: SharedDepSourceRecord): Set<string> => {
      const deps = new Set<string>();
      for (const rel of record.relativeImports) {
        for (const member of record.modulePaths) {
          const resolved = SharedSpecifierRewriter.resolveRelativeModulePath(
            member,
            rel,
          );
          const target = modulePathToRecord.get(
            `${record.packageName}/${resolved}`,
          );
          if (target !== undefined && target.key !== record.key) {
            deps.add(target.key);
            break;
          }
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
      if (record.isPackageMain || record.modulePaths.includes('<pack>')) {
        specifierToBlob.set(record.packageName, blob);
      }
      for (const m of record.modulePaths) {
        if (m === '<pack>') continue;
        const bare = m.endsWith('.js') ? m.slice(0, -3) : m;
        specifierToBlob.set(`${record.packageName}/${m}`, blob);
        specifierToBlob.set(`${record.packageName}/${bare}`, blob);
      }
    };

    const relativeToBlob = (
      record: SharedDepSourceRecord,
    ): ((resolvedModulePath: string) => string | undefined) =>
      (resolved) =>
        recordBlob.get(
          modulePathToRecord.get(`${record.packageName}/${resolved}`)?.key ??
            '',
        );

    while (pending.size > 0) {
      const before = pending.size;
      for (const [key, record] of pending) {
        const deps = depsOf(record);
        if (![...deps].every((d) => recordBlob.has(d))) continue;
        const rewritten = SharedSpecifierRewriter.rewriteUnitSource(
          record.text,
          record.modulePaths,
          specifierToBlob,
          relativeToBlob(record),
        );
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
