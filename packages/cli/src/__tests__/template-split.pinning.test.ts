// TEST-ONLY — this file carries NO `@cpt` marker and traces to NO FEATURE
// instruction, same as `adapters/__tests__/local-fetch.test.ts`.
//
// Issue #470 / phase 3 — pinning tests for two KNOWN, ALREADY-EXISTING
// defects in the CLI's multi-template path, surfaced by the boundary design
// for the template-shell/template-mfe split. SSOT:
// `.omc/plans/issue-470-boundary-design.md` §5 (risks R5/B1), §6 (fixtures 7,
// 9), §7 (deferred fixes — both defects are tracked as SEPARATE issues, out
// of #470's scope; fixing `scaffold/compose-shared-files.ts` or
// `upgrade/apply.ts` is explicitly NOT part of this task).
//
// "Pinning" here means: assert TODAY's (defective) behavior on purpose, so a
// silent regression-in-the-opposite-direction (the defect getting WORSE, or
// disappearing without anyone noticing which fix landed) is caught. When the
// tracked fix for either defect lands, the corresponding test below should
// be rewritten into a real correctness assertion, not deleted.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { seedRepository } from '../commands/seed-repository';
import { addTemplate } from '../commands/add-template';
import { installCommand } from '../commands/install';
import { createLocalFetchFn } from '../adapters/local-fetch';
import { readProvenanceRecords, createFsReadSingleProvenanceFn, createFsProvenanceWriteFn } from '../adapters/provenance-io';
import {
  createFsReadProjectFileFn,
  createFsRemoveProjectFileFn,
  createFsWriteFileFn,
  createFsWriteProjectFileFn,
} from '../adapters/fs-project-io';
import { TemplateInventory } from '../inventory/TemplateInventory';
import { FsInventoryIndex } from '../adapters/fs-inventory-index';
import { FsContentStore } from '../adapters/fs-content-store';
import { createFsReadContentItemsFn } from '../adapters/fs-read-content-items';
import { upgradeChangeSetReviewApproval } from '../upgrade/flow';
import { MANIFEST_FILENAME } from '../manifest/types';
import type { TemplateManifest } from '../manifest/types';
import type { ContentItem, ReadContentItemsFn } from '../scaffold/types';
import type { ReadProvenanceRecordsFn } from '../scaffold/materialize';
import {
  TEMPLATE_SHELL_DIR,
  TEMPLATE_SHELL_IDENTITY,
  TEMPLATE_MFE_IDENTITY,
  EXCLUDED_DIRS,
  makeTmpDir,
  readManifest,
  setupShellAndMfeInventory,
} from './helpers/template-split-fixtures';
import type { ShellMfeHarness } from './helpers/template-split-fixtures';

let tmpDirs: string[] = [];
let harness: ShellMfeHarness | undefined;

function trackedTmpDir(prefix: string): string {
  const dir = makeTmpDir(prefix);
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
  harness?.cleanup();
  harness = undefined;
});

describe('Fixture 7 (F6-pinning) — region-union composition depends on assembly SHAPE, not on what is already on disk', () => {
  const REGION_PATH = 'shared.txt';

  const manifestA: TemplateManifest = {
    schemaVersion: '1.0',
    name: 'region-fixture-a',
    version: '1.0.0',
    ownershipBoundaries: {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: REGION_PATH, mergeStrategy: 'region-union', ownedRegions: ['a'] }],
    },
  };
  const manifestB: TemplateManifest = {
    schemaVersion: '1.0',
    name: 'region-fixture-b',
    version: '1.0.0',
    ownershipBoundaries: {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: REGION_PATH, mergeStrategy: 'region-union', ownedRegions: ['b'] }],
    },
  };
  // Zero-content aggregator whose SOLE purpose is to pull region-fixture-a
  // and region-fixture-b into ONE resolveComposition set, so uniformApply +
  // materializeAssembly run ONCE with BOTH contributions — the "single
  // build" half of this characterization. This mirrors how a real preset
  // would combine templates; #470 defers preset ITSELF (§1.3 of the SSOT),
  // not the underlying `referencedTemplates` composition mechanism this
  // fixture exercises, which is already shipped and covered elsewhere
  // (`composition.test.ts`).
  const manifestBundle: TemplateManifest = {
    schemaVersion: '1.0',
    name: 'region-fixture-bundle',
    version: '1.0.0',
    ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
    referencedTemplates: [
      { ref: 'region-fixture-a', appliedAt: '.' },
      { ref: 'region-fixture-b', appliedAt: '.' },
    ],
  };

  const contentA = 'frontx:region region-fixture-a:a\nContent owned by A.\nfrontx:endregion region-fixture-a:a';
  const contentB = 'frontx:region region-fixture-b:b\nContent owned by B.\nfrontx:endregion region-fixture-b:b';

  it('seeded together in ONE assembly: the composed file contains BOTH disjoint region blocks', async () => {
    const inventoryRoot = trackedTmpDir('frontx-split-f7-single-inv-');
    const targetDir = trackedTmpDir('frontx-split-f7-single-target-');
    const aDir = trackedTmpDir('frontx-split-f7-single-a-');
    const bDir = trackedTmpDir('frontx-split-f7-single-b-');
    const bundleDir = trackedTmpDir('frontx-split-f7-single-bundle-');

    const inventory = new TemplateInventory(new FsInventoryIndex(inventoryRoot), new FsContentStore(inventoryRoot));
    fs.writeFileSync(path.join(aDir, MANIFEST_FILENAME), JSON.stringify(manifestA));
    fs.writeFileSync(path.join(aDir, REGION_PATH), contentA);
    fs.writeFileSync(path.join(bDir, MANIFEST_FILENAME), JSON.stringify(manifestB));
    fs.writeFileSync(path.join(bDir, REGION_PATH), contentB);
    fs.writeFileSync(path.join(bundleDir, MANIFEST_FILENAME), JSON.stringify(manifestBundle));

    for (const [spec, dir] of [
      ['local:frontx-fixture/region-fixture-a@offline', aDir],
      ['local:frontx-fixture/region-fixture-b@offline', bDir],
      ['local:frontx-fixture/region-fixture-bundle@offline', bundleDir],
    ] as const) {
      const install = await installCommand(spec, inventory, createLocalFetchFn(dir));
      expect(install.ok, `installing "${spec}"`).toBe(true);
    }

    const lookupFn = (name: string) => inventory.lookup(name);
    const readContentFn = createFsReadContentItemsFn(inventoryRoot);
    const writeFileFn = createFsWriteFileFn();
    const provenanceWriteFn = createFsProvenanceWriteFn();

    const seedResult = await seedRepository(
      'region-fixture-bundle',
      targetDir,
      lookupFn,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
    );
    expect(seedResult.ok).toBe(true);
    if (!seedResult.ok) return;
    expect(seedResult.appliedTemplates.slice().sort()).toEqual([
      'region-fixture-a',
      'region-fixture-b',
      'region-fixture-bundle',
    ]);

    const composed = fs.readFileSync(path.join(targetDir, REGION_PATH), 'utf-8');
    expect(composed).toContain('frontx:region region-fixture-a:a');
    expect(composed).toContain('frontx:region region-fixture-b:b');
  });

  it('KNOWN DEFECT (tracked separately, see §7 of the SSOT) — seed A, then add B: the file is truncated to ONLY B\'s region; A\'s already-written region-union block is silently discarded', async () => {
    const inventoryRoot = trackedTmpDir('frontx-split-f7-addflow-inv-');
    const targetDir = trackedTmpDir('frontx-split-f7-addflow-target-');
    const aDir = trackedTmpDir('frontx-split-f7-addflow-a-');
    const bDir = trackedTmpDir('frontx-split-f7-addflow-b-');

    const inventory = new TemplateInventory(new FsInventoryIndex(inventoryRoot), new FsContentStore(inventoryRoot));
    fs.writeFileSync(path.join(aDir, MANIFEST_FILENAME), JSON.stringify(manifestA));
    fs.writeFileSync(path.join(aDir, REGION_PATH), contentA);
    fs.writeFileSync(path.join(bDir, MANIFEST_FILENAME), JSON.stringify(manifestB));
    fs.writeFileSync(path.join(bDir, REGION_PATH), contentB);

    const installA = await installCommand(
      'local:frontx-fixture/region-fixture-a@offline',
      inventory,
      createLocalFetchFn(aDir),
    );
    expect(installA.ok).toBe(true);
    const installB = await installCommand(
      'local:frontx-fixture/region-fixture-b@offline',
      inventory,
      createLocalFetchFn(bDir),
    );
    expect(installB.ok).toBe(true);

    const lookupFn = (name: string) => inventory.lookup(name);
    const listInstalledFn = () => inventory.list();
    const readContentFn = createFsReadContentItemsFn(inventoryRoot);
    const writeFileFn = createFsWriteFileFn();
    const provenanceWriteFn = createFsProvenanceWriteFn();
    const readProvenanceRecordsFn: ReadProvenanceRecordsFn = readProvenanceRecords;

    const seedResult = await seedRepository(
      'region-fixture-a',
      targetDir,
      lookupFn,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
    );
    expect(seedResult.ok).toBe(true);
    expect(fs.readFileSync(path.join(targetDir, REGION_PATH), 'utf-8')).toContain('frontx:region region-fixture-a:a');

    // No conflict is expected here — region-fixture-a and region-fixture-b
    // declare DISJOINT region keys ('a' vs. 'b') on the same shared path, so
    // the pre-flight conflict check correctly passes this add. The defect is
    // NOT a false-negative conflict check; it is that materialization, once
    // past that check, only ever looks at what THIS add's own assembly
    // contributes — never at the file `addTemplate` is about to overwrite.
    const addResult = await addTemplate(
      'region-fixture-b',
      targetDir,
      lookupFn,
      listInstalledFn,
      readContentFn,
      writeFileFn,
      readProvenanceRecordsFn,
      provenanceWriteFn,
    );
    expect(addResult.ok).toBe(true);

    const truncated = fs.readFileSync(path.join(targetDir, REGION_PATH), 'utf-8');
    expect(truncated).not.toContain('frontx:region region-fixture-a:a');
    expect(truncated).toContain('frontx:region region-fixture-b:b');
  });
});

describe('Fixture 9 (B1-pinning) — frontx upgrade corrupts multi-record provenance in a shell+mfe repository', () => {
  // The upgrade engine's re-resolved baseline/target entries (via
  // `resolveTemplateAtVersion` -> `resolveToInventory`) are plain in-memory
  // `RESOLVED` entries — unlike `TemplateInventory.install`, they are never
  // written to an installed-content-path on disk, so the disk-backed
  // `createFsReadContentItemsFn` adapter (keyed by that path) cannot serve
  // them. This decodes the SAME `$frontxTemplateFiles` bundle envelope
  // `createLocalFetchFn` returns directly from the entry's in-memory
  // `.content` — the upgrade-engine equivalent of that disk-backed adapter.
  const decodeBundleContentItems: ReadContentItemsFn = async (entry) => {
    const parsed = JSON.parse(entry.content) as { $frontxTemplateFiles: Record<string, string> };
    return Object.entries(parsed.$frontxTemplateFiles).map(([itemPath, content]): ContentItem => ({ path: itemPath, content }));
  };

  /** Seeds shell, adds mfe (2 provenance records), then runs one auto-approved
   * `frontx upgrade` cycle against the shell record — the exact repro sequence
   * B1 names: "seed shell → add mfe → frontx upgrade --yes". Returns the
   * target dir so each `it` can inspect the corrupted result independently
   * (no shared mutable state between tests — order-independent by construction). */
  async function seedAddThenUpgrade(): Promise<{ targetDir: string; shellManifest: TemplateManifest }> {
    harness = await setupShellAndMfeInventory();
    const targetDir = trackedTmpDir('frontx-split-f9-target-');

    const seedResult = await seedRepository(
      TEMPLATE_SHELL_IDENTITY,
      targetDir,
      harness.lookupFn,
      harness.readContentFn,
      harness.writeFileFn,
      harness.provenanceWriteFn,
    );
    expect(seedResult.ok).toBe(true);
    const addResult = await addTemplate(
      TEMPLATE_MFE_IDENTITY,
      targetDir,
      harness.lookupFn,
      harness.listInstalledFn,
      harness.readContentFn,
      harness.writeFileFn,
      harness.readProvenanceRecordsFn,
      harness.provenanceWriteFn,
    );
    expect(addResult.ok).toBe(true);

    const beforeUpgrade = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.frontx', 'provenance.json'), 'utf-8'),
    ) as unknown;
    expect(Array.isArray(beforeUpgrade)).toBe(true);
    expect(beforeUpgrade).toHaveLength(2);

    const shellManifest = readManifest(TEMPLATE_SHELL_DIR);

    // `readProvenance` (F11) only ever resolves `records[0]` — the shell
    // record, since seed always writes first — so this is a same-version,
    // effectively no-op upgrade of the FIRST record. That is deliberate: B1
    // is a defect in HOW the provenance file gets rewritten after ANY
    // upgrade, independent of whether the diff itself is empty.
    const upgradeResult = await upgradeChangeSetReviewApproval(targetDir, shellManifest.version, {
      readProvenance: createFsReadSingleProvenanceFn(),
      fetchFn: createLocalFetchFn(TEMPLATE_SHELL_DIR, { excludedDirs: EXCLUDED_DIRS }),
      readProjectFile: createFsReadProjectFileFn(),
      readContentItems: decodeBundleContentItems,
      writeProjectFile: createFsWriteProjectFileFn(),
      removeProjectFile: createFsRemoveProjectFileFn(),
      writeProvenance: createFsProvenanceWriteFn(),
      presentAndGetApproval: async () => 'approved', // auto-approve, per task
    });
    expect(upgradeResult.status).toBe('applied');

    return { targetDir, shellManifest };
  }

  it("KNOWN DEFECT B1 (ADR-0021(d)/ADR-0019, tracked as a separate issue) — .frontx/provenance.json is overwritten with ONE object; the mfe record is gone", async () => {
    const { targetDir } = await seedAddThenUpgrade();

    const afterRaw = fs.readFileSync(path.join(targetDir, '.frontx', 'provenance.json'), 'utf-8');
    const after = JSON.parse(afterRaw) as unknown;

    expect(Array.isArray(after)).toBe(false);
    expect(after).toMatchObject({ templateIdentity: TEMPLATE_SHELL_IDENTITY });
    // Not just "not equal to the mfe record" — the mfe identity string is
    // entirely absent from the file, i.e. genuinely lost, not merely
    // reordered or renamed.
    expect(afterRaw).not.toContain(TEMPLATE_MFE_IDENTITY);
  });

  it('KNOWN DEFECT B1 follow-on — the corrupted provenance file then crashes the NEXT add-template call (F19: spreading a non-array is not iterable)', async () => {
    const { targetDir } = await seedAddThenUpgrade();
    if (!harness) throw new Error('unreachable: seedAddThenUpgrade always sets `harness`');

    const thirdDir = trackedTmpDir('frontx-split-f9-third-');
    fs.writeFileSync(
      path.join(thirdDir, 'frontx-template.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        name: 'frontx-template-third-fixture',
        version: '1.0.0',
        ownershipBoundaries: { exclusiveSubtrees: ['third-fixture/'], sharedFiles: [] },
      }),
    );
    const thirdInstall = await installCommand(
      'local:frontx-fixture/frontx-template-third-fixture@offline',
      harness.inventory,
      createLocalFetchFn(thirdDir),
    );
    expect(thirdInstall.ok).toBe(true);

    // `readProvenanceRecords` types its return as `ProvenanceRecord[]` but
    // only ever does `JSON.parse(raw) as ProvenanceRecord[]` — an unchecked
    // cast. After the B1 corruption the file holds a plain object, and
    // `occupiedBoundariesFromProvenance`'s `for (const record of records)`
    // throws synchronously on that object, rejecting `addTemplate`'s promise.
    await expect(
      addTemplate(
        'frontx-template-third-fixture',
        targetDir,
        harness.lookupFn,
        harness.listInstalledFn,
        harness.readContentFn,
        harness.writeFileFn,
        readProvenanceRecords,
        harness.provenanceWriteFn,
      ),
    ).rejects.toThrow(/not iterable/);
  });
});
