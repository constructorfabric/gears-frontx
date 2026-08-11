import { describe, it, expect, vi } from 'vitest';
// cpt-frontx-dod-upgrade-changeset-computation cpt-frontx-dod-upgrade-changeset-apply
// cpt-frontx-dod-upgrade-changeset-rollback cpt-frontx-dod-upgrade-changeset-single-engine
import {
  upgradeChangeSetReviewApproval,
  type UpgradeFlowDeps,
} from '../upgrade/flow';
import { computeChangeSet } from '../upgrade/compute';
import { applyChangeSet } from '../upgrade/apply';
import { rollbackChangeSet } from '../upgrade/rollback';
import { formatOccupiedBoundary } from '../provenance/boundary';
import type { ChangeSet, ConflictEntry } from '../upgrade/types';
import type { ContentItem, ReadContentItemsFn } from '../scaffold/types';
import type { FetchFn } from '../resolver/types';
import type { OwnershipBoundary } from '../manifest/types';

// Content items live SEPARATELY from the manifest, in a registry keyed by
// "name@version", and are read via the injected `readContentItems` seam
// directly from the "installed content path" — never from the manifest.
const contentRegistry = new Map<string, ContentItem[]>();
const readContentItems: ReadContentItemsFn = async (entry) =>
  contentRegistry.get(`${entry.name}@${entry.ref}`) ?? [];

// Manifests, keyed by "name@version" — this is the shared resolver's
// fetchable content, DISTINCT from any single-entry local inventory. The
// upgrade engine must reach this registry through fetchFn (re-resolving via
// the provenance source-spec at a specific version) for BOTH the baseline
// and the target — never through a local-inventory lookup that only ever
// retains one version per entry.
const manifestByVersion = new Map<string, string>();

function registerVersion(
  name: string,
  version: string,
  files: Array<{ path: string; content: string }>,
  ownershipBoundaries: OwnershipBoundary = { exclusiveSubtrees: [], sharedFiles: [] },
): void {
  const manifest = { name, version, ownershipBoundaries };
  contentRegistry.set(`${name}@${version}`, files);
  manifestByVersion.set(`${name}@${version}`, JSON.stringify(manifest));
}

// The shared resolver's fetch primitive (cpt-frontx-feature-template-resolution).
// The requested version always arrives as the URL's trailing "@ref" segment
// (see resolver/resolve.ts buildFetchUrl) — this fake resolves purely from
// that, with NO access to any local inventory.
const fetchFn: FetchFn = async (url) => {
  const version = url.slice(url.lastIndexOf('@') + 1);
  const manifest = manifestByVersion.get(`my-template@${version}`);
  if (!manifest) {
    throw new Error(`Template "my-template" not found at version "${version}" via shared resolver.`);
  }
  return manifest;
};

const PROJ_ROOT = '/proj';

const BASE_PROVENANCE = {
  templateIdentity: 'my-template',
  scaffoldedFromVersion: '1.0.0',
  sourceSpec: 'local:acme/my-template@1.0.0',
};

registerVersion('my-template', '1.0.0', [
  { path: 'src/App.tsx', content: 'v1 content' },
  { path: 'src/old.ts', content: 'old file' },
]);

registerVersion('my-template', '2.0.0', [
  { path: 'src/App.tsx', content: 'v2 content' },
  { path: 'src/new.ts', content: 'new file' },
  // 'src/old.ts' intentionally removed in target version
]);

describe('upgradeChangeSetReviewApproval (F14 change-set engine flow)', () => {
  // (a) Produces reviewable change set, writes NO project files until developer approves
  it('(a) computes change set and writes no files until approved', async () => {
    const writeFn = vi.fn();
    const removeFn = vi.fn();
    const presentFn = vi
      .fn<(changeSet: ChangeSet) => Promise<'approved' | 'declined'>>()
      .mockResolvedValue('declined');

    const result = await upgradeChangeSetReviewApproval(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async (p) =>
        p === `${PROJ_ROOT}/src/App.tsx` ? 'v1 content' : null,
      readContentItems,
      writeProjectFile: writeFn,
      removeProjectFile: removeFn,
      writeProvenance: writeFn,
      presentAndGetApproval: presentFn,
    });

    // Change set was presented to developer
    expect(presentFn).toHaveBeenCalledOnce();
    const presented = presentFn.mock.calls[0][0];
    expect(presented.clean.length + presented.conflicts.length).toBeGreaterThan(0);

    // Result is declined — no files touched
    expect(result.status).toBe('declined');
    expect(writeFn).not.toHaveBeenCalled();
    expect(removeFn).not.toHaveBeenCalled();
  });

  // (b) Approving writes ONLY the approved entries and updates provenance to the newer version
  it('(b) approving writes only approved entries and updates provenance to target version', async () => {
    const written = new Map<string, string>();
    const removed = new Set<string>();

    const result = await upgradeChangeSetReviewApproval(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async (p) => {
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'v1 content';
        if (p === `${PROJ_ROOT}/src/old.ts`) return 'old file';
        // The provenance file on disk is always the full SET (ADR-0019) —
        // one record per applied template, even for a single-template
        // project — never the bare record `readProvenance` resolves it to.
        if (p === `${PROJ_ROOT}/.frontx/provenance.json`) return JSON.stringify([BASE_PROVENANCE]);
        return null;
      },
      readContentItems,
      writeProjectFile: async (p, c) => { written.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { written.set(p, c); },
      presentAndGetApproval: async () => 'approved',
    });

    expect(result.status).toBe('applied');

    // App.tsx modified from v1→v2
    expect(written.get(`${PROJ_ROOT}/src/App.tsx`)).toBe('v2 content');
    // new.ts added
    expect(written.get(`${PROJ_ROOT}/src/new.ts`)).toBe('new file');
    // old.ts removed
    expect(removed.has(`${PROJ_ROOT}/src/old.ts`)).toBe(true);
    // Provenance updated to 2.0.0 — written back as a SET (one entry here),
    // never as a single bare object.
    const provContent = written.get(`${PROJ_ROOT}/.frontx/provenance.json`);
    expect(provContent).toBeDefined();
    const provRecords = JSON.parse(provContent!) as unknown;
    expect(Array.isArray(provRecords)).toBe(true);
    expect((provRecords as Array<{ scaffoldedFromVersion: string }>)[0].scaffoldedFromVersion).toBe('2.0.0');
  });

  // (c) Declining leaves the project byte-for-byte unchanged — no file created, modified, or deleted
  it('(c) declining leaves project byte-for-byte unchanged', async () => {
    const writeFn = vi.fn();
    const removeFn = vi.fn();

    const result = await upgradeChangeSetReviewApproval(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
      writeProjectFile: writeFn,
      removeProjectFile: removeFn,
      writeProvenance: writeFn,
      presentAndGetApproval: async () => 'declined',
    });

    expect(result.status).toBe('declined');
    expect(writeFn).not.toHaveBeenCalled();
    expect(removeFn).not.toHaveBeenCalled();
  });

  // (d) Applying then rolling back restores exact pre-upgrade state including provenance
  it('(d) rollback after apply restores exact pre-upgrade state including provenance', async () => {
    const files = new Map<string, string>([
      [`${PROJ_ROOT}/src/App.tsx`, 'v1 content'],
      [`${PROJ_ROOT}/src/old.ts`, 'old file'],
      // The provenance file on disk is always the full SET (ADR-0019) — one
      // record per applied template, even for a single-template project.
      [`${PROJ_ROOT}/.frontx/provenance.json`, JSON.stringify([BASE_PROVENANCE], null, 2)],
    ]);

    const deps: UpgradeFlowDeps = {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async (p) => files.get(p) ?? null,
      readContentItems,
      writeProjectFile: async (p, c) => { files.set(p, c); },
      removeProjectFile: async (p) => { files.delete(p); },
      writeProvenance: async (p, c) => { files.set(p, c); },
      presentAndGetApproval: async () => 'approved',
    };

    const applyResult = await upgradeChangeSetReviewApproval(PROJ_ROOT, '2.0.0', deps);
    expect(applyResult.status).toBe('applied');

    // After apply: provenance at 2.0.0 — still a one-entry SET, not a bare object.
    const afterApply = JSON.parse(files.get(`${PROJ_ROOT}/.frontx/provenance.json`)!) as Array<{
      scaffoldedFromVersion: string;
    }>;
    expect(Array.isArray(afterApply)).toBe(true);
    expect(afterApply[0].scaffoldedFromVersion).toBe('2.0.0');

    // Rollback
    const snapshot = (applyResult as Extract<typeof applyResult, { status: 'applied' }>).snapshot;
    const rollbackResult = await rollbackChangeSet(snapshot, PROJ_ROOT, {
      writeProjectFile: async (p, c) => { files.set(p, c); },
      removeProjectFile: async (p) => { files.delete(p); },
    });

    expect(rollbackResult.ok).toBe(true);
    // Provenance restored to 1.0.0, still the one-entry SET shape
    const afterRollback = JSON.parse(files.get(`${PROJ_ROOT}/.frontx/provenance.json`)!) as Array<{
      scaffoldedFromVersion: string;
    }>;
    expect(Array.isArray(afterRollback)).toBe(true);
    expect(afterRollback[0].scaffoldedFromVersion).toBe('1.0.0');
    // old.ts restored
    expect(files.get(`${PROJ_ROOT}/src/old.ts`)).toBe('old file');
    // new.ts removed (it was null pre-upgrade → rollback removes it)
    expect(files.has(`${PROJ_ROOT}/src/new.ts`)).toBe(false);
    // App.tsx restored to v1
    expect(files.get(`${PROJ_ROOT}/src/App.tsx`)).toBe('v1 content');
  });

  // (e) Single engine — computeChangeSet, applyChangeSet, rollbackChangeSet all from canonical modules
  it('(e) single shared engine: all functions exported from canonical upgrade modules', () => {
    // Both direct CLI (via upgradeChangeSetReviewApproval) and F17 AI orchestration
    // import from the same canonical modules — no second diff/apply implementation exists.
    expect(typeof upgradeChangeSetReviewApproval).toBe('function');
    expect(typeof computeChangeSet).toBe('function');
    expect(typeof applyChangeSet).toBe('function');
    expect(typeof rollbackChangeSet).toBe('function');
  });

  // (f) Target version that cannot be resolved → report failure and abort before writing any file
  it('(f) unresolvable target version aborts before writing any project file', async () => {
    const writeFn = vi.fn();
    const removeFn = vi.fn();
    const presentFn = vi.fn();

    const result = await upgradeChangeSetReviewApproval(PROJ_ROOT, '99.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
      writeProjectFile: writeFn,
      removeProjectFile: removeFn,
      writeProvenance: writeFn,
      presentAndGetApproval: presentFn,
    });

    expect(result.status).toBe('resolution-failed');
    expect(presentFn).not.toHaveBeenCalled();
    expect(writeFn).not.toHaveBeenCalled();
    expect(removeFn).not.toHaveBeenCalled();
  });

  // (g) Conflict — file affected by both template diff and local modification surfaced before approval
  it('(g) locally modified file conflicting with template diff is surfaced as a conflict', async () => {
    let capturedChangeSet: ChangeSet | undefined;

    await upgradeChangeSetReviewApproval(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async (p) => {
        // App.tsx has been locally modified (differs from baseline 'v1 content')
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'locally modified content';
        return null;
      },
      readContentItems,
      writeProjectFile: vi.fn(),
      removeProjectFile: vi.fn(),
      writeProvenance: vi.fn(),
      presentAndGetApproval: async (cs) => {
        capturedChangeSet = cs;
        return 'declined';
      },
    });

    expect(capturedChangeSet).toBeDefined();
    expect(capturedChangeSet!.conflicts.length).toBeGreaterThan(0);
    const conflict = capturedChangeSet!.conflicts.find((c: ConflictEntry) => c.path === 'src/App.tsx');
    expect(conflict).toBeDefined();
    expect(conflict!.localContent).toBe('locally modified content');
  });

  // (h) Baseline is RE-RESOLVED via the shared resolver from the provenance
  // source-spec at the baseline version — never from a single-entry local
  // inventory. This fixture's "inventory" (manifestByVersion) holds BOTH
  // versions precisely because it IS the shared resolver's fetchable
  // content, not a local, single-entry inventory — a spy on fetchFn proves
  // the engine actually requests the baseline version, not just the target.
  it('(h) baseline is re-resolved through the shared resolver at the baseline version, not the local inventory', async () => {
    const requestedVersions: string[] = [];
    const spyFetchFn: FetchFn = async (url) => {
      requestedVersions.push(url.slice(url.lastIndexOf('@') + 1));
      return fetchFn(url);
    };

    const result = await computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn: spyFetchFn,
      readProjectFile: async () => null,
      readContentItems,
    });

    expect(result.ok).toBe(true);
    // Both the baseline version (from provenance.scaffoldedFromVersion) and
    // the target version were independently re-resolved via the resolver.
    expect(requestedVersions).toContain('1.0.0');
    expect(requestedVersions).toContain('2.0.0');
  });

  // (i) region-union shared file: diff/apply touches ONLY this template's
  // own marker-delimited region, leaving a co-owning template's region
  // byte-for-byte untouched, both in the computed diff and after apply.
  it('(i) region-union shared file: diff and apply are scoped to this template\'s own owned region only', async () => {
    const SHARED_PATH = 'shared.txt';
    const baselineSharedBoundary: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: SHARED_PATH, mergeStrategy: 'region-union', ownedRegions: ['setup'] }],
    };
    const targetSharedBoundary: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: SHARED_PATH, mergeStrategy: 'region-union', ownedRegions: ['setup', 'teardown'] }],
    };
    // Distinct versions from the top-level fixture — this test registers its
    // own baseline/target so it cannot clobber the shared '1.0.0'/'2.0.0'
    // entries other tests in this file rely on.
    const REGION_PROVENANCE = {
      templateIdentity: 'my-template',
      scaffoldedFromVersion: '1.1.0',
      sourceSpec: 'local:acme/my-template@1.1.0',
      occupiedOwnershipBoundary: formatOccupiedBoundary(baselineSharedBoundary),
    };

    registerVersion(
      'my-template',
      '1.1.0',
      [
        {
          path: SHARED_PATH,
          content: [
            '// frontx:region my-template:setup',
            'const setupV1 = true;',
            '// frontx:endregion my-template:setup',
            '// frontx:region other-template:extra',
            'const otherStaysPut = true;',
            '// frontx:endregion other-template:extra',
          ].join('\n'),
        },
      ],
      baselineSharedBoundary,
    );
    registerVersion(
      'my-template',
      '2.1.0',
      [
        {
          path: SHARED_PATH,
          content: [
            '// frontx:region my-template:setup',
            'const setupV2 = true;',
            '// frontx:endregion my-template:setup',
            '// frontx:region my-template:teardown',
            'const teardownV2 = true;',
            '// frontx:endregion my-template:teardown',
          ].join('\n'),
        },
      ],
      targetSharedBoundary,
    );

    // The current project file — this template's region at the v1.1.0
    // baseline (unmodified locally) plus a co-owning template's region.
    const projectFileContent = [
      '// frontx:region my-template:setup',
      'const setupV1 = true;',
      '// frontx:endregion my-template:setup',
      '// frontx:region other-template:extra',
      'const otherStaysPut = true;',
      '// frontx:endregion other-template:extra',
    ].join('\n');

    const computeResult = await computeChangeSet(PROJ_ROOT, '2.1.0', {
      readProvenance: async () => REGION_PROVENANCE,
      fetchFn,
      readProjectFile: async (p) => (p === `${PROJ_ROOT}/${SHARED_PATH}` ? projectFileContent : null),
      readContentItems,
    });

    expect(computeResult.ok).toBe(true);
    const changeSet = (computeResult as Extract<typeof computeResult, { ok: true }>).changeSet;
    const regionEntry = changeSet.clean.find((e) => e.path === SHARED_PATH);
    expect(regionEntry).toBeDefined();
    expect(regionEntry!.regionKey).toBe('setup');
    // Only the owned region's NEW content is carried — not the whole file.
    expect(regionEntry!.content).toContain('setupV2');
    expect(regionEntry!.content).not.toContain('otherStaysPut');
    expect(changeSet.targetOccupiedOwnershipBoundary).toBe(
      '{"exclusiveSubtrees":[],"sharedFiles":[{"path":"shared.txt","mergeStrategy":"region-union","ownedRegions":["setup","teardown"]}]}',
    );

    // Apply: only this template's region is rewritten in the shared file;
    // the co-owning template's region is left byte-for-byte untouched.
    const files = new Map<string, string>([
      [`${PROJ_ROOT}/${SHARED_PATH}`, projectFileContent],
      // The provenance file on disk is always the full SET (ADR-0019).
      [`${PROJ_ROOT}/.frontx/provenance.json`, JSON.stringify([REGION_PROVENANCE], null, 2)],
    ]);

    const applyResult = await applyChangeSet(changeSet, PROJ_ROOT, REGION_PROVENANCE, {
      readProjectFile: async (p) => files.get(p) ?? null,
      writeProjectFile: async (p, c) => { files.set(p, c); },
      removeProjectFile: async (p) => { files.delete(p); },
      writeProvenance: async (p, c) => { files.set(p, c); },
    });

    expect(applyResult.ok).toBe(true);
    const appliedContent = files.get(`${PROJ_ROOT}/${SHARED_PATH}`)!;
    expect(appliedContent).toContain('setupV2');
    expect(appliedContent).not.toContain('setupV1');
    // Co-owning template's region is byte-for-byte unchanged.
    expect(appliedContent).toContain('// frontx:region other-template:extra');
    expect(appliedContent).toContain('const otherStaysPut = true;');
    expect(appliedContent).toContain('// frontx:endregion other-template:extra');

    const updatedProvenance = JSON.parse(files.get(`${PROJ_ROOT}/.frontx/provenance.json`)!) as Array<
      Record<string, unknown>
    >;
    expect(updatedProvenance).toHaveLength(1);
    expect(updatedProvenance[0]['scaffoldedFromVersion']).toBe('2.1.0');
    expect(updatedProvenance[0]['occupiedOwnershipBoundary']).toBe(changeSet.targetOccupiedOwnershipBoundary);
  });

  it('(i2) region-union upgrade refuses duplicate owned marker blocks instead of diffing the first match', async () => {
    const SHARED_PATH = 'shared.txt';
    const sharedBoundary: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: SHARED_PATH, mergeStrategy: 'region-union', ownedRegions: ['setup'] }],
    };
    const REGION_PROVENANCE = {
      templateIdentity: 'my-template',
      scaffoldedFromVersion: '1.2.0',
      sourceSpec: 'local:acme/my-template@1.2.0',
      occupiedOwnershipBoundary: formatOccupiedBoundary(sharedBoundary),
    };

    registerVersion(
      'my-template',
      '1.2.0',
      [
        {
          path: SHARED_PATH,
          content: [
            'frontx:region my-template:setup',
            'const setupV1 = true;',
            'frontx:endregion my-template:setup',
          ].join('\n'),
        },
      ],
      sharedBoundary,
    );
    registerVersion(
      'my-template',
      '2.2.0',
      [
        {
          path: SHARED_PATH,
          content: [
            'frontx:region my-template:setup',
            'first target block',
            'frontx:endregion my-template:setup',
            'frontx:region my-template:setup',
            'second target block',
            'frontx:endregion my-template:setup',
          ].join('\n'),
        },
      ],
      sharedBoundary,
    );

    const result = await computeChangeSet(PROJ_ROOT, '2.2.0', {
      readProvenance: async () => REGION_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('region-error');
    expect(result.message).toMatch(/duplicate/);
  });

  it('(i3) region-union upgrade refuses a target manifest declared region missing from target content', async () => {
    const SHARED_PATH = 'shared-missing-body.txt';
    const sharedBoundary: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: SHARED_PATH, mergeStrategy: 'region-union', ownedRegions: ['setup'] }],
    };
    const REGION_PROVENANCE = {
      templateIdentity: 'my-template',
      scaffoldedFromVersion: '1.3.0',
      sourceSpec: 'local:acme/my-template@1.3.0',
      occupiedOwnershipBoundary: formatOccupiedBoundary(sharedBoundary),
    };

    registerVersion(
      'my-template',
      '1.3.0',
      [
        {
          path: SHARED_PATH,
          content: [
            'frontx:region my-template:setup',
            'const setupV1 = true;',
            'frontx:endregion my-template:setup',
          ].join('\n'),
        },
      ],
      sharedBoundary,
    );
    registerVersion(
      'my-template',
      '2.3.0',
      [
        {
          path: SHARED_PATH,
          content: 'target accidentally dropped the declared marker block',
        },
      ],
      sharedBoundary,
    );

    const result = await computeChangeSet(PROJ_ROOT, '2.3.0', {
      readProvenance: async () => REGION_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('region-error');
    expect(result.message).toMatch(/missing|declared region "setup"/);
  });

  it('(i4) region-union upgrade refuses a target manifest declared shared file missing from target inventory', async () => {
    const SHARED_PATH = 'shared-missing-file.txt';
    const sharedBoundary: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: SHARED_PATH, mergeStrategy: 'region-union', ownedRegions: ['setup'] }],
    };
    const REGION_PROVENANCE = {
      templateIdentity: 'my-template',
      scaffoldedFromVersion: '1.4.0',
      sourceSpec: 'local:acme/my-template@1.4.0',
      occupiedOwnershipBoundary: formatOccupiedBoundary(sharedBoundary),
    };

    registerVersion(
      'my-template',
      '1.4.0',
      [
        {
          path: SHARED_PATH,
          content: [
            'frontx:region my-template:setup',
            'const setupV1 = true;',
            'frontx:endregion my-template:setup',
          ].join('\n'),
        },
      ],
      sharedBoundary,
    );
    registerVersion('my-template', '2.4.0', [], sharedBoundary);

    const result = await computeChangeSet(PROJ_ROOT, '2.4.0', {
      readProvenance: async () => REGION_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('region-error');
    expect(result.message).toMatch(/target content.*missing declared region "setup"/);
  });

  it('(i5) legacy provenance does not upgrade target region-union shared files it cannot prove it owns', async () => {
    const SHARED_PATH = 'legacy-shared.txt';
    const sharedBoundary: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: SHARED_PATH, mergeStrategy: 'region-union', ownedRegions: ['setup'] }],
    };
    const LEGACY_PROVENANCE = {
      templateIdentity: 'legacy-repository-name',
      scaffoldedFromVersion: '1.5.0',
      sourceSpec: 'local:acme/my-template@1.5.0',
    };

    registerVersion(
      'my-template',
      '1.5.0',
      [{ path: SHARED_PATH, content: 'legacy unmarked shared content' }],
      sharedBoundary,
    );
    registerVersion(
      'my-template',
      '2.5.0',
      [
        {
          path: SHARED_PATH,
          content: [
            'frontx:region my-template:setup',
            'const setupV2 = true;',
            'frontx:endregion my-template:setup',
          ].join('\n'),
        },
      ],
      sharedBoundary,
    );

    const result = await computeChangeSet(PROJ_ROOT, '2.5.0', {
      readProvenance: async () => LEGACY_PROVENANCE,
      fetchFn,
      readProjectFile: async () => 'developer-owned file content',
      readContentItems,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean.some((entry) => entry.path === SHARED_PATH)).toBe(false);
    expect(result.changeSet.conflicts.some((entry) => entry.path === SHARED_PATH)).toBe(false);
    expect(result.changeSet.targetOccupiedOwnershipBoundary).toBe('.');
  });

  // (j)/(k) #488 follow-up: a bad provenance precondition — either the file
  // isn't the JSON array the SET schema requires, or it IS an array but
  // holds no record for the template being upgraded — must abort BEFORE any
  // project file is written, returning `{ok:false}` per `ApplyResult`'s
  // contract (ADR-0019 / ADR-0021 Confirmation (d)). A thrown exception at
  // that point would escape past `inst-app-catch`'s restore-on-error, since
  // that block only wraps the for-each-entry loop — by the time such an
  // error surfaced, entries could already be on disk with no way back. Both
  // cases are asserted BEFORE the loop ever runs: zero writes, zero removes.
  const trivialChangeSet: ChangeSet = {
    templateIdentity: 'my-template',
    baselineVersion: '1.0.0',
    targetVersion: '2.0.0',
    targetOccupiedOwnershipBoundary: '.',
    clean: [{ kind: 'modify', path: 'src/App.tsx', content: 'v2 content' }],
    conflicts: [],
  };

  it('(j) a malformed (non-array) provenance file aborts before any project file is written', async () => {
    const writes = new Map<string, string>();
    const removed = new Set<string>();

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => {
        if (p === `${PROJ_ROOT}/.frontx/provenance.json`) return JSON.stringify(BASE_PROVENANCE);
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'v1 content';
        return null;
      },
      writeProjectFile: async (p, c) => { writes.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { writes.set(p, c); },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toMatch(/provenance/i);
    // The project is byte-for-byte unchanged — no write or removal was ever
    // attempted, not merely rolled back after the fact.
    expect(writes.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  it('(k) a valid provenance SET missing the target template\'s record aborts before any project file is written', async () => {
    const writes = new Map<string, string>();
    const removed = new Set<string>();
    const unrelatedRecord = {
      templateIdentity: 'someone-else-template',
      scaffoldedFromVersion: '9.9.9',
      sourceSpec: 'local:acme/someone-else-template@9.9.9',
    };

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => {
        if (p === `${PROJ_ROOT}/.frontx/provenance.json`) return JSON.stringify([unrelatedRecord]);
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'v1 content';
        return null;
      },
      writeProjectFile: async (p, c) => { writes.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { writes.set(p, c); },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toMatch(/my-template/);
    expect(writes.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  it('(k2) duplicate provenance records for one template identity abort before any project file is written', async () => {
    const writes = new Map<string, string>();
    const removed = new Set<string>();
    const duplicateRecord = {
      ...BASE_PROVENANCE,
      scaffoldedFromVersion: '0.9.0',
    };

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => {
        if (p === PROJ_ROOT + '/.frontx/provenance.json') return JSON.stringify([BASE_PROVENANCE, duplicateRecord]);
        if (p === PROJ_ROOT + '/src/App.tsx') return 'v1 content';
        return null;
      },
      writeProjectFile: async (p, c) => { writes.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { writes.set(p, c); },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toMatch(/more than one record/);
    expect(applyResult.message).toMatch(/my-template/);
    expect(writes.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  // (l)/(m) review #500 round 2 (P2-1): the SET shape was checked
  // (`Array.isArray`) but individual elements were not, so a malformed
  // element (e.g. `[null]`) reached `existingRecords.findIndex(record =>
  // record.templateIdentity === ...)` and threw a raw TypeError that escaped
  // `ApplyResult`'s `{ok:true}|{ok:false}` contract entirely — bypassing the
  // restore-on-error path (which only wraps the for-each-entry loop) even
  // though nothing had been written yet. Both cases must abort as
  // `{ok:false}`, before any write, with a message naming the file and which
  // element/field was invalid.
  it('(l) a provenance array element that is null aborts before any project file is written, without throwing', async () => {
    const writes = new Map<string, string>();
    const removed = new Set<string>();

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => {
        if (p === `${PROJ_ROOT}/.frontx/provenance.json`) return JSON.stringify([null]);
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'v1 content';
        return null;
      },
      writeProjectFile: async (p, c) => { writes.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { writes.set(p, c); },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toContain(`${PROJ_ROOT}/.frontx/provenance.json`);
    expect(applyResult.message).toMatch(/index 0/);
    expect(writes.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  it('(m) a provenance array element missing templateIdentity aborts before any project file is written, without throwing', async () => {
    const writes = new Map<string, string>();
    const removed = new Set<string>();
    const malformedRecord = { scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:acme/my-template@1.0.0' };

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => {
        if (p === `${PROJ_ROOT}/.frontx/provenance.json`) return JSON.stringify([malformedRecord]);
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'v1 content';
        return null;
      },
      writeProjectFile: async (p, c) => { writes.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { writes.set(p, c); },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toMatch(/templateIdentity/);
    expect(applyResult.message).toMatch(/index 0/);
    expect(writes.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  // review #500 round 3: mirrors provenance-io.test.ts (f) for this pure-logic
  // engine's duplicate guard. `occupiedOwnershipBoundary` is optional, so its
  // absence must stay valid — but a non-string value present on the record
  // (e.g. a number) must not pass through this check unnoticed, since a
  // subsequent provenance write would then carry that malformed value forward.
  it('(n) a provenance array element with a non-string occupiedOwnershipBoundary aborts before any project file is written, without throwing', async () => {
    const writes = new Map<string, string>();
    const removed = new Set<string>();
    const malformedRecord = {
      templateIdentity: 'my-template',
      scaffoldedFromVersion: '1.0.0',
      sourceSpec: 'local:acme/my-template@1.0.0',
      occupiedOwnershipBoundary: 42,
    };

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => {
        if (p === `${PROJ_ROOT}/.frontx/provenance.json`) return JSON.stringify([malformedRecord]);
        if (p === `${PROJ_ROOT}/src/App.tsx`) return 'v1 content';
        return null;
      },
      writeProjectFile: async (p, c) => { writes.set(p, c); },
      removeProjectFile: async (p) => { removed.add(p); },
      writeProvenance: async (p, c) => { writes.set(p, c); },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toMatch(/occupiedOwnershipBoundary/);
    expect(applyResult.message).toMatch(/index 0/);
    expect(writes.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  // issue #506 — the final `deps.writeProvenance` used to run AFTER the
  // for-each-entry loop's try/catch closed, so a write failure there threw
  // past `ApplyResult`'s `{ok:false}` contract with the loop's project-file
  // mutations already on disk and no rollback. Moved inside the same try —
  // a throwing `writeProvenance` is now caught by the existing restore-on-
  // error loop, which already covers `provPath` (snapshotted at the top of
  // `applyChangeSet`), so both the mutated project file AND the provenance
  // file land back at their exact pre-upgrade bytes.
  it('(o) a throwing writeProvenance is restored: the mutated project file and provenance.json are returned to pre-upgrade bytes, and ApplyResult reports failure instead of throwing', async () => {
    const files = new Map<string, string>([
      [`${PROJ_ROOT}/src/App.tsx`, 'v1 content'],
      [`${PROJ_ROOT}/.frontx/provenance.json`, JSON.stringify([BASE_PROVENANCE], null, 2)],
    ]);

    const applyResult = await applyChangeSet(trivialChangeSet, PROJ_ROOT, BASE_PROVENANCE, {
      readProjectFile: async (p) => files.get(p) ?? null,
      writeProjectFile: async (p, c) => { files.set(p, c); },
      removeProjectFile: async (p) => { files.delete(p); },
      writeProvenance: async (p, c) => {
        files.set(p, c);
        throw new Error('disk full');
      },
    });

    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.message).toMatch(/disk full/);
    // The for-each-entry loop's mutation to App.tsx was rolled back...
    expect(files.get(`${PROJ_ROOT}/src/App.tsx`)).toBe('v1 content');
    // ...and provenance.json was never left holding a version bump with no
    // matching project-file changes applied — restored byte-for-byte.
    expect(files.get(`${PROJ_ROOT}/.frontx/provenance.json`)).toBe(JSON.stringify([BASE_PROVENANCE], null, 2));
  });
});
