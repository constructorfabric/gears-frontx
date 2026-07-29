// TEST-ONLY — this file carries NO `@cpt` marker and traces to NO FEATURE
// instruction, same as `adapters/__tests__/local-fetch.test.ts` (the pattern
// it extends to two real, split templates instead of one).
//
// Issue #470 / phase 3 — first real multi-template run of the offline
// install/seed/add pipeline against the REAL on-disk `template-shell/` +
// `template-mfe/` (phase 2's split, already accepted). SSOT:
// `.omc/plans/issue-470-boundary-design.md` §0 (facts F1-F18), §5 (risks),
// §6 (fixture definitions 1, 2, 3, 4, 5, 6 — this file). Fixtures 7 and 9
// (known-defect pinning) live in `template-split.pinning.test.ts`; fixture 8
// (a CI job) is explicitly out of phase 3's scope.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { seedRepository } from '../commands/seed-repository';
import { addTemplate } from '../commands/add-template';
import { installCommand } from '../commands/install';
import { createLocalFetchFn } from '../adapters/local-fetch';
import { checkAssemblyConflicts } from '../scaffold/conflict';
import type { ContributionEntry, StagedAssembly } from '../scaffold/types';
import type { ProvenanceRecord } from '../provenance/types';
import {
  TEMPLATE_MFE_DIR,
  TEMPLATE_MFE_IDENTITY,
  TEMPLATE_SHELL_DIR,
  TEMPLATE_SHELL_IDENTITY,
  isPathWithinExclusiveSubtrees,
  listRealFiles,
  makeTmpDir,
  readManifest,
  setupShellAndMfeInventory,
  sha256,
} from './helpers/template-split-fixtures';
import type { ShellMfeHarness } from './helpers/template-split-fixtures';

// Tracks every tmp dir created by the current test so `afterEach` can sweep
// them regardless of which `it` ran or how it exited — keeps the fixtures
// independent of execution order (no test relies on another's leftovers,
// and none leaks a tmp dir into the next one).
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

describe('Fixture 1 — union fidelity: seed frontx-template-shell + add frontx-template-mfe materializes byte-identical to template-shell/ + template-mfe/, nothing extra', () => {
  it('every declared file lands byte-for-byte; no extra files besides .frontx/provenance.json; 2 provenance records with the right identities', async () => {
    const shellManifest = readManifest(TEMPLATE_SHELL_DIR);
    const mfeManifest = readManifest(TEMPLATE_MFE_DIR);
    const shellSourceFiles = listRealFiles(TEMPLATE_SHELL_DIR);
    const mfeSourceFiles = listRealFiles(TEMPLATE_MFE_DIR);
    const shellDeclared = shellSourceFiles.filter((p) =>
      isPathWithinExclusiveSubtrees(p, shellManifest.ownershipBoundaries.exclusiveSubtrees),
    );
    const mfeDeclared = mfeSourceFiles.filter((p) =>
      isPathWithinExclusiveSubtrees(p, mfeManifest.ownershipBoundaries.exclusiveSubtrees),
    );

    // Sanity precondition (§1.5's audited "0 intersections" claim, re-checked
    // live rather than trusted from the doc): "union fidelity" is only a
    // well-formed question if the two declarations never double-claim the
    // same target path.
    expect(shellDeclared.filter((p) => mfeDeclared.includes(p))).toEqual([]);

    harness = await setupShellAndMfeInventory();
    const targetDir = trackedTmpDir('frontx-split-f1-target-');

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

    const targetFiles = listRealFiles(targetDir).filter((p) => p !== path.join('.frontx', 'provenance.json'));
    const expectedFiles = [...shellDeclared, ...mfeDeclared].sort();
    expect(targetFiles.sort()).toEqual(expectedFiles);

    for (const relPath of shellDeclared) {
      expect(fs.readFileSync(path.join(targetDir, relPath), 'utf-8'), `shell file "${relPath}"`).toBe(
        fs.readFileSync(path.join(TEMPLATE_SHELL_DIR, relPath), 'utf-8'),
      );
    }
    for (const relPath of mfeDeclared) {
      expect(fs.readFileSync(path.join(targetDir, relPath), 'utf-8'), `mfe file "${relPath}"`).toBe(
        fs.readFileSync(path.join(TEMPLATE_MFE_DIR, relPath), 'utf-8'),
      );
    }

    const provenance = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.frontx', 'provenance.json'), 'utf-8'),
    ) as ProvenanceRecord[];
    expect(provenance).toHaveLength(2);
    expect(provenance.map((r) => r.templateIdentity)).toEqual([TEMPLATE_SHELL_IDENTITY, TEMPLATE_MFE_IDENTITY]);
  });
});

describe('Fixture 2 (CLI part) — seed frontx-template-shell alone into an empty target', () => {
  it('completes ok, touches zero mfe-territory files, writes exactly one provenance record (npm install/type-check is phase 4 scope, not run here)', async () => {
    harness = await setupShellAndMfeInventory();
    const targetDir = trackedTmpDir('frontx-split-f2-target-');

    const seedResult = await seedRepository(
      TEMPLATE_SHELL_IDENTITY,
      targetDir,
      harness.lookupFn,
      harness.readContentFn,
      harness.writeFileFn,
      harness.provenanceWriteFn,
    );

    expect(seedResult.ok).toBe(true);
    if (!seedResult.ok) return;
    expect(seedResult.appliedTemplates).toEqual([TEMPLATE_SHELL_IDENTITY]);

    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src-app', 'mfe_packages'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, '.frontx', 'ai', '@gears-frontx', 'frontx-template-mfe'))).toBe(false);

    const provenance = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.frontx', 'provenance.json'), 'utf-8'),
    ) as ProvenanceRecord[];
    expect(provenance).toHaveLength(1);
    expect(provenance[0].templateIdentity).toBe(TEMPLATE_SHELL_IDENTITY);
  });
});

describe('Fixture 3 — add-only integrity: seed shell, hash every file, add mfe, no shell file changed byte-for-byte', () => {
  it('shell files are untouched by the add; mfe content lands; provenance grows to 2 records', async () => {
    harness = await setupShellAndMfeInventory();
    const targetDir = trackedTmpDir('frontx-split-f3-target-');

    const seedResult = await seedRepository(
      TEMPLATE_SHELL_IDENTITY,
      targetDir,
      harness.lookupFn,
      harness.readContentFn,
      harness.writeFileFn,
      harness.provenanceWriteFn,
    );
    expect(seedResult.ok).toBe(true);

    // Snapshot every file the seed wrote, EXCLUDING the CLI's own provenance
    // bookkeeping file — going from 1 record to 2 on `add` is the correct,
    // intended behavior (cpt-frontx-dod-composed-provenance-provenance-at-scaffold),
    // not a "shell file changed" regression.
    const provenancePath = path.join('.frontx', 'provenance.json');
    const preAddFiles = listRealFiles(targetDir).filter((p) => p !== provenancePath);
    const preAddHashes = new Map(
      preAddFiles.map((p) => [p, sha256(fs.readFileSync(path.join(targetDir, p), 'utf-8'))]),
    );

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

    for (const relPath of preAddFiles) {
      const postHash = sha256(fs.readFileSync(path.join(targetDir, relPath), 'utf-8'));
      expect(postHash, `shell file "${relPath}" must be byte-unchanged after add-mfe`).toBe(preAddHashes.get(relPath));
    }

    expect(fs.existsSync(path.join(targetDir, 'src-app', 'mfe_packages', 'demo-mfe', 'mfe.json'))).toBe(true);

    const provenance = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.frontx', 'provenance.json'), 'utf-8'),
    ) as ProvenanceRecord[];
    expect(provenance).toHaveLength(2);
    expect(provenance.map((r) => r.templateIdentity)).toEqual([TEMPLATE_SHELL_IDENTITY, TEMPLATE_MFE_IDENTITY]);
  });
});

describe("Fixture 4 — conflict-check on REAL templates: a synthetic 'mfe-dup' contests mfe's already-occupied ground", () => {
  it('REFUSES the add with zero new files, naming the contested ground and both real contestants', async () => {
    harness = await setupShellAndMfeInventory();
    const targetDir = trackedTmpDir('frontx-split-f4-target-');
    const dupSourceDir = trackedTmpDir('frontx-split-f4-dup-src-');

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

    // Synthetic contestant: a distinct template identity that claims the
    // SAME exclusive subtree mfe already occupies — a REAL conflict against
    // a REAL applied template, not two hand-rolled unit-test manifests.
    fs.writeFileSync(
      path.join(dupSourceDir, 'frontx-template.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        name: 'frontx-template-mfe-dup',
        version: '0.1.0-alpha.0',
        ownershipBoundaries: { exclusiveSubtrees: ['src-app/mfe_packages/'], sharedFiles: [] },
      }),
    );
    const dupInstall = await installCommand(
      'local:gears-frontx/frontx-template-mfe-dup@offline',
      harness.inventory,
      createLocalFetchFn(dupSourceDir),
    );
    expect(dupInstall.ok).toBe(true);

    const filesBefore = listRealFiles(targetDir).sort();

    const dupAddResult = await addTemplate(
      'frontx-template-mfe-dup',
      targetDir,
      harness.lookupFn,
      harness.listInstalledFn,
      harness.readContentFn,
      harness.writeFileFn,
      harness.readProvenanceRecordsFn,
      harness.provenanceWriteFn,
    );

    expect(dupAddResult.ok).toBe(false);
    if (dupAddResult.ok) return;
    expect(dupAddResult.reason).toBe('conflict');
    if (dupAddResult.reason === 'conflict') {
      expect(dupAddResult.conflicts).toEqual([
        { ground: 'src-app/mfe_packages/', contestants: ['frontx-template-mfe-dup', TEMPLATE_MFE_IDENTITY] },
      ]);
    }

    expect(listRealFiles(targetDir).sort()).toEqual(filesBefore);
  });
});

describe('Fixture 5 — characterizing R3(б): the exact-string conflict check has a nesting/spelling blind spot on the REAL shell declaration', () => {
  // Both cases are read directly from the real, on-disk template-shell
  // manifest (not a hand-copied literal) so the characterization tracks that
  // manifest's actual declared boundary rather than a stale assumption
  // about it. checkAssemblyConflicts compares exclusiveSubtrees by strict
  // string equality only (`subtreeA !== subtreeB → continue`,
  // scaffold/conflict.ts) — it has no notion of "path A nests inside path B"
  // or "same path, different trailing slash".
  const shellManifest = readManifest(TEMPLATE_SHELL_DIR);
  const shellContribution: ContributionEntry = {
    templateName: 'frontx-template-shell',
    files: [],
    ownershipBoundaries: shellManifest.ownershipBoundaries,
  };

  it('KNOWN BLIND SPOT — a nested claim ("src-app/", which contains the real shell-owned "src-app/app/") is NOT detected as a conflict today', () => {
    expect(shellManifest.ownershipBoundaries.exclusiveSubtrees).toContain('src-app/app/');

    const nestedClaim: ContributionEntry = {
      templateName: 'nested-claim-fixture',
      files: [],
      ownershipBoundaries: { exclusiveSubtrees: ['src-app/'], sharedFiles: [] },
    };
    const assembly: StagedAssembly = { contributions: [shellContribution, nestedClaim] };

    // Characterizes TODAY's behavior, not the desired one: §7 defers a
    // segment-aware comparison (`p === s || p.startsWith(s + '/')`) to a
    // later phase (R3(б) in the SSOT). This assertion is expected to flip to
    // `ok: false` once that lands — at which point this test should be
    // updated into a real conflict-detection assertion, not deleted.
    const verdict = checkAssemblyConflicts(assembly, []);
    expect(verdict.ok).toBe(true);
  });

  it('KNOWN BLIND SPOT — the same ground under a different spelling ("src" vs. the real shell-owned "src/") is NOT detected as a conflict today', () => {
    expect(shellManifest.ownershipBoundaries.exclusiveSubtrees).toContain('src/');

    const misspelledClaim: ContributionEntry = {
      templateName: 'slash-mismatch-fixture',
      files: [],
      ownershipBoundaries: { exclusiveSubtrees: ['src'], sharedFiles: [] },
    };
    const assembly: StagedAssembly = { contributions: [shellContribution, misspelledClaim] };

    // Same characterization as above, same expected-to-flip note.
    const verdict = checkAssemblyConflicts(assembly, []);
    expect(verdict.ok).toBe(true);
  });
});

describe('Fixture 6 — declaration coverage: every real file in template-shell/ and template-mfe/ is declared or explicitly allow-listed', () => {
  it('template-shell/: zero files outside the declared boundary and the {frontx-template.json} allow-list', () => {
    const manifest = readManifest(TEMPLATE_SHELL_DIR);
    const allowList = new Set(['frontx-template.json']);
    const uncovered = listRealFiles(TEMPLATE_SHELL_DIR).filter(
      (p) => !allowList.has(p) && !isPathWithinExclusiveSubtrees(p, manifest.ownershipBoundaries.exclusiveSubtrees),
    );
    expect(uncovered).toEqual([]);
  });

  it('template-mfe/: zero files outside the declared boundary and the {frontx-template.json, README.md} allow-list', () => {
    const manifest = readManifest(TEMPLATE_MFE_DIR);
    const allowList = new Set(['frontx-template.json', 'README.md']);
    const uncovered = listRealFiles(TEMPLATE_MFE_DIR).filter(
      (p) => !allowList.has(p) && !isPathWithinExclusiveSubtrees(p, manifest.ownershipBoundaries.exclusiveSubtrees),
    );
    expect(uncovered).toEqual([]);
  });
});
