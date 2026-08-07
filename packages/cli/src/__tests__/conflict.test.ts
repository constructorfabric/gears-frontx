// @cpt-algo:cpt-frontx-algo-cli-scaffolding-conflict-check:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-conflict-check:p1
import { describe, it, expect } from 'vitest';
import { checkAssemblyConflicts } from '../scaffold/conflict';
import type { ContributionEntry, StagedAssembly } from '../scaffold/types';
import type { OccupiedBoundaryEntry } from '../scaffold/state';
import type { OwnershipBoundary } from '../manifest/types';

function contribution(
  templateName: string,
  boundaries: OwnershipBoundary,
): ContributionEntry {
  return { templateName, files: [], ownershipBoundaries: boundaries };
}

function assemblyOf(...contributions: ContributionEntry[]): StagedAssembly {
  return { contributions };
}

const noSharedFiles: OwnershipBoundary['sharedFiles'] = [];

describe('checkAssemblyConflicts — F12 pre-flight assembly conflict check (cpt-frontx-algo-cli-scaffolding-conflict-check)', () => {
  // (a) A non-conflicting assembly PASSES — inst-cc-return-pass.
  it('(a) passes a non-conflicting assembly — disjoint exclusive subtrees, no already-occupied boundaries', () => {
    const assembly = assemblyOf(
      contribution('template-a', { exclusiveSubtrees: ['template-a/'], sharedFiles: noSharedFiles }),
      contribution('template-b', { exclusiveSubtrees: ['template-b/'], sharedFiles: noSharedFiles }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(true);
  });

  // (e) Overlapping exclusive subtrees are REFUSED pre-write — preserved
  // inst-cc-if-subtree-clash / inst-cc-record-subtree-conflict / inst-cc-return-conflict.
  it('(e) refuses the whole assembly when two templates claim the same exclusive subtree', () => {
    const assembly = assemblyOf(
      contribution('template-a', { exclusiveSubtrees: ['shared-subtree/'], sharedFiles: noSharedFiles }),
      contribution('template-b', { exclusiveSubtrees: ['shared-subtree/'], sharedFiles: noSharedFiles }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'shared-subtree/', contestants: ['template-a', 'template-b'] },
    ]);
  });

  // inst-cc-if-subtree-clash / inst-cc-record-subtree-conflict.
  it('refuses two templates whose exclusive subtrees nest, naming both claims and both templates', () => {
    const assembly = assemblyOf(
      contribution('outer-template', { exclusiveSubtrees: ['src/'], sharedFiles: noSharedFiles }),
      contribution('inner-template', { exclusiveSubtrees: ['src/config/'], sharedFiles: noSharedFiles }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'src/ overlaps src/config/', contestants: ['outer-template', 'inner-template'] },
    ]);
  });

  it('refuses the same directory claimed under two spellings — with and without a trailing slash', () => {
    const assembly = assemblyOf(
      contribution('template-a', { exclusiveSubtrees: ['src/'], sharedFiles: noSharedFiles }),
      contribution('template-b', { exclusiveSubtrees: ['src'], sharedFiles: noSharedFiles }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'src/ overlaps src', contestants: ['template-a', 'template-b'] },
    ]);
  });

  // A degenerate claim reaches this check because the manifest contract admits
  // it (issue #546), and the assembler hands it no file: `src//` matches no
  // content path. Refusing an assembly over it would be a refusal naming ground
  // that no template can occupy and no developer can vacate — the claim is not
  // a near-miss for `src`, it is a claim on nothing.
  it('passes a claim that addresses no location, rather than reading it as a near-miss for the subtree it resembles', () => {
    const assembly = assemblyOf(
      contribution('degenerate-template', { exclusiveSubtrees: ['src//'], sharedFiles: noSharedFiles }),
      contribution('real-template', { exclusiveSubtrees: ['src/'], sharedFiles: noSharedFiles }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(true);
  });

  // The bound on the widened refusal: these assemblies write to no common file.
  it('passes two claims that share a string prefix without sharing a path segment', () => {
    const assembly = assemblyOf(
      contribution('template-a', { exclusiveSubtrees: ['src/', 'lib'], sharedFiles: noSharedFiles }),
      contribution('template-b', { exclusiveSubtrees: ['src-app/', 'library.ts'], sharedFiles: noSharedFiles }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(true);
  });

  // The add flow's whole reason for submitting the occupied set: a new template
  // whose claim swallows an already-applied template's subtree is arbitrated
  // here, before any write, rather than discovered by materialization
  // overwriting the occupant's files.
  it('refuses a staged claim that nests around an exclusive subtree an already-applied template occupies', () => {
    const assembly = assemblyOf(
      contribution('new-template', { exclusiveSubtrees: ['src-app/'], sharedFiles: noSharedFiles }),
    );
    const alreadyOccupied: OccupiedBoundaryEntry[] = [
      {
        templateName: 'existing-template',
        boundary: { exclusiveSubtrees: ['src-app/app/'], sharedFiles: noSharedFiles },
      },
    ];

    const verdict = checkAssemblyConflicts(assembly, alreadyOccupied);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'src-app/ overlaps src-app/app/', contestants: ['new-template', 'existing-template'] },
    ]);
  });

  // (a) Two `exclusive` claims on the same shared-file path are REFUSED —
  // inst-cc-if-exclusive-clash / inst-cc-record-exclusive-conflict.
  it('(a) refuses two exclusive claims on the same shared-file path', () => {
    const assembly = assemblyOf(
      contribution('template-a', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'exclusive', ownedRegions: [] }],
      }),
      contribution('template-b', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'exclusive', ownedRegions: [] }],
      }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'package.json', contestants: ['template-a', 'template-b'] },
    ]);
  });

  // (b) One `exclusive` + one `region-union` claim on the same shared-file
  // path are REFUSED — whole-file ownership cannot be shared —
  // inst-cc-if-exclusive-clash / inst-cc-record-exclusive-conflict.
  it('(b) refuses one exclusive + one region-union claim on the same shared-file path', () => {
    const assembly = assemblyOf(
      contribution('template-a', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] }],
      }),
      contribution('template-b', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'region-union', ownedRegions: ['compilerOptions.paths'] }],
      }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'tsconfig.json', contestants: ['template-a', 'template-b'] },
    ]);
  });

  // (c) Two `region-union` claims on the same path with the SAME declared
  // region key are REFUSED — inst-cc-if-region-key-clash /
  // inst-cc-record-region-conflict; the ground folds path + region key.
  it('(c) refuses two region-union claims on the same path with the same declared region key', () => {
    const assembly = assemblyOf(
      contribution('template-a', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] }],
      }),
      contribution('template-b', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] }],
      }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'package.json#scripts.build', contestants: ['template-a', 'template-b'] },
    ]);
  });

  // (d) Two `region-union` claims on the same path with DISJOINT declared
  // region keys are NOT a clash — inst-cc-return-pass.
  it('(d) accepts two region-union claims on the same path with disjoint declared region keys', () => {
    const assembly = assemblyOf(
      contribution('template-a', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] }],
      }),
      contribution('template-b', {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.test'] }],
      }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);
    expect(verdict.ok).toBe(true);
  });

  // A staged template clashing with an ALREADY-APPLIED template's occupied
  // boundary is refused too — the check compares the staged assembly against
  // what the repository already holds, not just within the staged set.
  it('refuses a staged template that claims an exclusive subtree an already-applied template occupies', () => {
    const assembly = assemblyOf(
      contribution('new-template', { exclusiveSubtrees: ['already-owned/'], sharedFiles: noSharedFiles }),
    );
    const alreadyOccupied: OccupiedBoundaryEntry[] = [
      { templateName: 'existing-template', boundary: { exclusiveSubtrees: ['already-owned/'], sharedFiles: noSharedFiles } },
    ];

    const verdict = checkAssemblyConflicts(assembly, alreadyOccupied);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual([
      { ground: 'already-owned/', contestants: ['new-template', 'existing-template'] },
    ]);
  });

  // The refusal report NAMES each contested ground and its contesting
  // templates for MULTIPLE simultaneous conflicts — never silently merges.
  it('names every contested ground and its contesting templates when multiple conflicts exist', () => {
    const assembly = assemblyOf(
      contribution('template-a', {
        exclusiveSubtrees: ['dup-subtree/'],
        sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] }],
      }),
      contribution('template-b', {
        exclusiveSubtrees: ['dup-subtree/'],
        sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] }],
      }),
    );

    const verdict = checkAssemblyConflicts(assembly, []);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.conflicts).toEqual(
      expect.arrayContaining([
        { ground: 'dup-subtree/', contestants: ['template-a', 'template-b'] },
        { ground: 'tsconfig.json', contestants: ['template-a', 'template-b'] },
      ]),
    );
    expect(verdict.conflicts).toHaveLength(2);
  });

  it('refuses BEFORE any file write — the verdict carries no write side-effect and materialization must gate on it', async () => {
    const assembly = assemblyOf(
      contribution('template-a', { exclusiveSubtrees: ['collide/'], sharedFiles: noSharedFiles }),
      contribution('template-b', { exclusiveSubtrees: ['collide/'], sharedFiles: noSharedFiles }),
    );
    const writes: string[] = [];
    const materializeFn = async () => {
      writes.push('materialized');
    };

    const verdict = checkAssemblyConflicts(assembly, []);
    // Simulates the real gate: runAssemblyOp only calls materializeFn when the
    // verdict is ok — a refused verdict must never be followed by a write.
    if (verdict.ok) {
      await materializeFn();
    }

    expect(verdict.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
});
