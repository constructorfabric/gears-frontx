import fs from 'node:fs';
import path from 'node:path';
import { UnindexedSlotResidueError } from '../adapters/fs-content-store';
import { decodeBundleValue, isBinaryBundleValue, readBundleFiles } from '../bundle/envelope';
import type { TemplateInventory } from '../inventory/TemplateInventory';
import { InventoryState } from '../inventory/types';
import type { InventoryEntry } from '../inventory/types';
import { MANIFEST_FILENAME } from '../manifest/types';
import { resolveToInventory } from '../resolver/resolve';
import type { FetchFn } from '../resolver/types';
import type { ContentItem } from '../scaffold/types';
import type { ReadInstalledContentFn } from '../scaffold/existing-content';
import type { UniformApplyInventoryPort } from '../scaffold/assembler';
import { parseSourceSpec } from '../spec-parser/parse';
import type { ErrorCode } from '../envelope';
import { payloadFromStoredContent } from '../upgrade/payload';
import { candidateHash } from './upgrade-transition';

/**
 * Batch auto-install without an early effect (plan-ai-recovery r9 §4/§203): an
 * `apply`/`seed` batch resolves every missing remote candidate IN MEMORY (no
 * inventory write) while all of its checks run; the staged candidates are
 * served to those checks as if installed. Only `commit()` — called by the
 * pipeline immediately before its first project write, after every item passed
 * — installs them, replaying the same fetched bytes, and reads each slot back
 * against what was checked. A refusal anywhere earlier leaves the inventory
 * untouched.
 */
/** Whether anything (file, directory, link) stands at `p`; unreadable counts as occupied. */
function pathOccupied(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

export function createStagedInventory(real: TemplateInventory, resolveInstalledContentPathFn: (name: string) => string) {
  const staged = new Map<string, { spec: string; fetchFn: FetchFn; entry: InventoryEntry }>();

  const inventory: UniformApplyInventoryPort = {
    lookup: (name) => real.lookup(name) ?? staged.get(name)?.entry,
    install: async (spec, fetchFn) => {
      const parsed = parseSourceSpec(spec);
      if (!parsed.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } };
      const resolved = await resolveToInventory({ kind: 'remote', ref: parsed.value }, { fetchFn });
      if (!resolved.ok) return { ok: false, error: { message: resolved.error.message, ...(resolved.error.code ? { code: resolved.error.code } : {}) } };
      const record = resolved.value;
      staged.set(record.name, {
        spec,
        fetchFn,
        entry: { name: record.name, source: record.source, ref: record.ref, status: InventoryState.INSTALLED, content: record.content },
      });
      return { ok: true, value: { name: record.name, ref: record.ref } };
    },
  };

  /** The files a staged slot will hold, exactly as the fs reader reports an installed slot. */
  const itemsOf = (content: string): ContentItem[] => {
    const files = readBundleFiles(content);
    if (files === undefined || files === null) return [{ path: MANIFEST_FILENAME, content: Buffer.from(content, 'utf-8') }];
    const items: ContentItem[] = [];
    for (const [key, value] of Object.entries(files)) {
      if (key.split('/').includes('node_modules')) continue; // mirrors the installed-content reader's skip
      const bytes = typeof value === 'string' ? Buffer.from(value, 'utf-8') : isBinaryBundleValue(value) ? decodeBundleValue(value) : null;
      if (bytes === null) throw new Error(`Staged content entry "${key}" could not be decoded.`);
      items.push({ path: key, content: bytes });
    }
    return items;
  };

  const readInstalledContent = (base: ReadInstalledContentFn): ReadInstalledContentFn => async (installedContentPath) => {
    for (const [name, { entry }] of staged) {
      if (real.lookup(name) !== undefined) continue;
      if (path.resolve(installedContentPath) === path.resolve(resolveInstalledContentPathFn(name))) return itemsOf(entry.content);
    }
    return base(installedContentPath);
  };

  const sameCandidate = (a: string, b: string, origin: string): boolean => {
    const left = payloadFromStoredContent(a, origin);
    const right = payloadFromStoredContent(b, origin);
    return left.ok && right.ok && candidateHash(left.payload) === candidateHash(right.payload);
  };

  /**
   * Installs the staged candidates one by one. The inventory has no transactional
   * multi-slot write and this CLI deliberately has no slot-removal path, so a
   * failure part-way is NOT rolled back. The result accounts for every PHYSICAL
   * effect it can know about, and says where it cannot:
   * - `installedInventorySlots`: slots this commit installed and read back as the
   *   checked candidate (left in place; nothing in the project refers to them yet);
   * - `slot` of the failed name: `not-installed` (a structured refusal, raised
   *   before any write), `unverified` (indexed, but the read-back did not match or
   *   failed: the slot may hold unexpected bytes), or `unknown` (the install threw:
   *   content may have been written partly, with or without an index entry);
   * - `contentPath`: where to inspect. A first install never overlays anything
   *   already at that path (`FsContentStore.write`), so residue cannot be mixed
   *   into a later install; it stays until a person removes it.
   * Before installing anything, a slot path already occupied without an index
   * entry refuses the whole commit, so that case installs nothing at all.
   */
  const commit = async (): Promise<
    { ok: true } | { ok: false; code: ErrorCode; message: string; details: Record<string, unknown> }
  > => {
    const pending = [...staged].filter(([name]) => real.lookup(name) === undefined);
    for (const [name] of pending) {
      const contentPath = resolveInstalledContentPathFn(name);
      if (pathOccupied(contentPath)) {
        return {
          ok: false,
          code: 'CONTENT_CONFLICT',
          message:
            `"${name}" cannot be installed: something already exists at "${contentPath}" although the inventory index ` +
            'records no template there (likely left by an interrupted install). Inspect it and move it aside, then retry. ' +
            'No inventory slot was installed by this command.',
          details: { failed: name, slot: 'residue', contentPath, installedInventorySlots: [] },
        };
      }
    }
    const installedNow: string[] = [];
    const report = (code: ErrorCode, name: string, slot: 'not-installed' | 'residue' | 'unverified' | 'unknown', cause: string, indexed?: boolean | 'unknown') => {
      const contentPath = resolveInstalledContentPathFn(name);
      const state =
        slot === 'not-installed'
          ? 'could not be installed (nothing was written for it)'
          : slot === 'residue'
            ? `could not be installed: something already stands at "${contentPath}" without an index entry (left untouched; inspect and move it aside)`
          : slot === 'unverified'
            ? `was installed but its slot at "${contentPath}" could not be verified and may hold unexpected bytes; inspect it before relying on or replacing it`
            : `failed while installing: content may have been written partly at "${contentPath}" ` +
              `(${indexed === 'unknown' ? 'whether an index entry exists is unknown' : indexed ? 'an index entry exists' : 'no index entry'}); ` +
              'a later install will not overwrite it — inspect it and move it aside by hand';
      return {
        ok: false as const,
        code,
        message:
          `"${name}" ${state}; cause: ${cause}.` +
          (installedNow.length > 0
            ? ` Installed and verified by this command, left in place: ${installedNow.join(', ')}.`
            : ' No other inventory slot was installed by this command.'),
        details: { failed: name, slot, contentPath, ...(indexed !== undefined ? { indexed } : {}), installedInventorySlots: [...installedNow] },
      };
    };
    for (const [name, { spec, fetchFn, entry }] of pending) {
      let installed: Awaited<ReturnType<TemplateInventory['install']>>;
      try {
        installed = await real.install(spec, fetchFn);
      } catch (error) {
        // The store's typed pre-write refusal: residue appeared after the
        // pre-check; nothing was written for this name.
        if (error instanceof UnindexedSlotResidueError) {
          return report('CONTENT_CONFLICT', name, 'residue', error.message);
        }
        let indexed: boolean | 'unknown' = 'unknown';
        try {
          indexed = real.lookup(name) !== undefined;
        } catch {
          /* index visibility itself is unknown */
        }
        return report('INTERNAL', name, 'unknown', error instanceof Error ? error.message : String(error), indexed);
      }
      if (!installed.ok) return report(installed.error.code ?? 'ORIGIN_UNAVAILABLE', name, 'not-installed', installed.error.message);
      let verified: boolean;
      let cause = 'its slot does not hold the candidate the checks ran against';
      try {
        const now = real.lookup(name);
        const stored = real.readInstalled(name);
        verified = now?.source === entry.source && stored !== undefined && sameCandidate(stored, entry.content, entry.source);
      } catch (error) {
        verified = false;
        cause = `its slot could not be read back: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (!verified) return report('CONTENT_CONFLICT', name, 'unverified', cause);
      installedNow.push(name);
    }
    return { ok: true };
  };

  return { inventory, readInstalledContent, commit, stagedNames: () => [...staged.keys()] };
}
