// @cpt-algo:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1
// @cpt-state:cpt-frontx-state-cli-scaffolding-assembly-op:p2
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-uniform-apply:p1
import { describe, it, expect, vi } from 'vitest';
import { uniformApply } from '../scaffold/assembler';
import { AssemblyOpState, runAssemblyOp } from '../scaffold/state';
import type { ConflictVerdict } from '../scaffold/state';
import type { InventoryEntry } from '../inventory/types';
import { InventoryState } from '../inventory/types';
import type { TemplateManifest } from '../manifest/types';
import type { ContentItem, ReadContentItemsFn } from '../scaffold/types';

// Helpers — the manifest carries ONLY its declared categories (identity,
// version, ownership boundaries, referenced templates, description); content items live
// SEPARATELY, in a content registry keyed by template name, and are read via
// the injected `readContentFn` seam directly from the "installed content
// path" — never from the manifest (inst-ua-read-content).
const contentRegistry = new Map<string, ContentItem[]>();

function makeEntry(name: string, manifestOverrides: Partial<TemplateManifest> = {}): InventoryEntry {
  const manifest: TemplateManifest = {
    name,
    version: '1.0.0',
    ownershipBoundaries: { exclusiveSubtrees: [`${name}/`], sharedFiles: [] },
    ...manifestOverrides,
  };
  contentRegistry.set(name, [
    { path: `${name}/index.ts`, content: `export const ${name.replace(/[^a-zA-Z0-9]/g, '_')} = true;` },
  ]);
  return {
    name,
    source: `github:acme/${name}@v1.0.0`,
    ref: 'v1.0.0',
    status: InventoryState.INSTALLED,
    content: JSON.stringify(manifest),
  };
}

const readContentFn: ReadContentItemsFn = async (entry) => contentRegistry.get(entry.name) ?? [];

const noConflict: ConflictVerdict = { ok: true };

describe('uniformApply — the ONE apply path (cpt-frontx-algo-cli-scaffolding-uniform-apply)', () => {
  // (a) seed vs add route through ONE apply path, differing only in
  // `targetHoldsAppliedTemplates` — same function, same resolver.
  it('seed (targetHoldsAppliedTemplates=false) and add (=true) call the exact same function', async () => {
    const entry = makeEntry('template-a');
    const lookupFn = vi.fn((n: string) => (n === 'template-a' ? entry : undefined));

    const seedResult = await uniformApply(['template-a'], false, lookupFn, readContentFn);
    const addResult = await uniformApply(['template-a'], true, lookupFn, readContentFn);

    expect(seedResult.ok).toBe(true);
    expect(addResult.ok).toBe(true);
    if (seedResult.ok && addResult.ok) {
      // Identical staged contribution regardless of the flag — no per-category dispatch.
      expect(seedResult.assembly).toEqual(addResult.assembly);
    }
    expect(lookupFn).toHaveBeenCalledWith('template-a');
  });

  // (b) resolved set staged with per-template contributions + declared boundaries.
  it('stages a per-template contribution carrying content items read from the installed content path + declared ownership boundaries', async () => {
    const entry = makeEntry('template-a', {
      ownershipBoundaries: {
        exclusiveSubtrees: ['template-a/'],
        sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] }],
      },
    });
    const lookupFn = vi.fn(() => entry);

    const result = await uniformApply(['template-a'], false, lookupFn, readContentFn);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assembly.contributions).toHaveLength(1);
    const [contribution] = result.assembly.contributions;
    expect(contribution.templateName).toBe('template-a');
    expect(contribution.files).toEqual([{ path: 'template-a/index.ts', content: 'export const template_a = true;' }]);
    expect(contribution.ownershipBoundaries.exclusiveSubtrees).toEqual(['template-a/']);
    expect(contribution.ownershipBoundaries.sharedFiles).toEqual([
      { path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] },
    ]);
  });

  // inst-ua-compute-contribution: content items outside the declared boundaries are excluded.
  it('scopes the content read from the installed content path to the declared boundaries', async () => {
    const entry = makeEntry('template-a');
    contentRegistry.set('template-a', [
      { path: 'template-a/index.ts', content: 'in-bounds' },
      { path: 'unrelated/outside.ts', content: 'out-of-bounds' },
    ]);
    const lookupFn = vi.fn(() => entry);

    const result = await uniformApply(['template-a'], false, lookupFn, readContentFn);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [contribution] = result.assembly.contributions;
    expect(contribution.files).toEqual([{ path: 'template-a/index.ts', content: 'in-bounds' }]);
  });

  // Multiple templates in one resolved set are each staged with their own identity.
  it('stages one contribution per template in the resolved set, tagged with identity', async () => {
    const entries: Record<string, InventoryEntry> = {
      'template-a': makeEntry('template-a'),
      'template-b': makeEntry('template-b'),
    };
    const lookupFn = vi.fn((n: string) => entries[n]);

    const result = await uniformApply(['template-a', 'template-b'], false, lookupFn, readContentFn);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assembly.contributions.map((c) => c.templateName)).toEqual(['template-a', 'template-b']);
  });

  // inst-ua-receive: unresolved reference aborts before staging anything.
  it('aborts with unresolved when a template reference is not in the local inventory', async () => {
    const lookupFn = vi.fn(() => undefined);

    const result = await uniformApply(['missing'], false, lookupFn, readContentFn);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unresolved');
    expect(result.templateRef).toBe('missing');
    expect(result.message).toMatch(/not found in local inventory/i);
  });

  it('routes template resolution exclusively through the injected lookupFn — no second resolution path', async () => {
    const entry = makeEntry('template-a');
    const lookupFn = vi.fn(() => entry);

    await uniformApply(['template-a'], false, lookupFn, readContentFn);

    expect(lookupFn).toHaveBeenCalledTimes(1);
    expect(lookupFn).toHaveBeenCalledWith('template-a');
  });

  it('reads content items directly from the installed content path via the injected readContentFn seam', async () => {
    const entry = makeEntry('template-a');
    const lookupFn = vi.fn(() => entry);
    const spy = vi.fn(readContentFn);

    await uniformApply(['template-a'], false, lookupFn, spy);

    expect(spy).toHaveBeenCalledWith(entry);
  });
});

describe('AssemblyOpState — assembly-op state machine (cpt-frontx-state-cli-scaffolding-assembly-op)', () => {
  it('defines REQUESTED, RESOLVED, CONFLICT_CHECKED, ASSEMBLED, ABORTED states', () => {
    expect(AssemblyOpState.REQUESTED).toBe('REQUESTED');
    expect(AssemblyOpState.RESOLVED).toBe('RESOLVED');
    expect(AssemblyOpState.CONFLICT_CHECKED).toBe('CONFLICT_CHECKED');
    expect(AssemblyOpState.ASSEMBLED).toBe('ASSEMBLED');
    expect(AssemblyOpState.ABORTED).toBe('ABORTED');
  });
});

describe('runAssemblyOp — driving the assembly-op transitions', () => {
  // inst-as-req-resolved / inst-as-resolved-checked / inst-as-checked-assembled
  it('REQUESTED → RESOLVED → CONFLICT_CHECKED → ASSEMBLED on a clean apply', async () => {
    const entry = makeEntry('template-a');
    const materializeFn = vi.fn(async () => undefined);
    const conflictVerdictFn = vi.fn(async (): Promise<ConflictVerdict> => noConflict);

    const result = await runAssemblyOp({
      templateRefs: ['template-a'],
      targetHoldsAppliedTemplates: false,
      lookupFn: () => entry,
      readContentFn,
      alreadyOccupiedBoundaries: [],
      conflictVerdictFn,
      materializeFn,
    });

    expect(result.state).toBe(AssemblyOpState.ASSEMBLED);
    expect(conflictVerdictFn).toHaveBeenCalledTimes(1);
    expect(materializeFn).toHaveBeenCalledTimes(1);
    if (result.state === AssemblyOpState.ASSEMBLED) {
      expect(result.assembly.contributions).toHaveLength(1);
    }
  });

  // inst-as-req-aborted-unresolved
  it('REQUESTED → ABORTED when a template reference cannot be resolved', async () => {
    const materializeFn = vi.fn(async () => undefined);
    const conflictVerdictFn = vi.fn(async (): Promise<ConflictVerdict> => noConflict);

    const result = await runAssemblyOp({
      templateRefs: ['missing'],
      targetHoldsAppliedTemplates: false,
      lookupFn: () => undefined,
      readContentFn,
      alreadyOccupiedBoundaries: [],
      conflictVerdictFn,
      materializeFn,
    });

    expect(result.state).toBe(AssemblyOpState.ABORTED);
    if (result.state === AssemblyOpState.ABORTED) {
      expect(result.abort.reason).toBe('unresolved');
    }
    // Aborted before the conflict check and before any materialization.
    expect(conflictVerdictFn).not.toHaveBeenCalled();
    expect(materializeFn).not.toHaveBeenCalled();
  });

  // inst-as-resolved-aborted-conflict — the verdict SEAM reports a conflict.
  it('RESOLVED → ABORTED when the conflict-verdict seam reports an intersecting claim', async () => {
    const entry = makeEntry('template-a');
    const materializeFn = vi.fn(async () => undefined);
    const conflictVerdictFn = vi.fn(
      async (): Promise<ConflictVerdict> => ({
        ok: false,
        conflicts: [{ ground: 'template-a/', contestants: ['template-a', 'template-b'] }],
      }),
    );

    const result = await runAssemblyOp({
      templateRefs: ['template-a'],
      targetHoldsAppliedTemplates: true,
      lookupFn: () => entry,
      readContentFn,
      alreadyOccupiedBoundaries: [
        { templateName: 'already-applied', boundary: { exclusiveSubtrees: ['template-a/'], sharedFiles: [] } },
      ],
      conflictVerdictFn,
      materializeFn,
    });

    expect(result.state).toBe(AssemblyOpState.ABORTED);
    if (result.state === AssemblyOpState.ABORTED) {
      expect(result.abort.reason).toBe('conflict');
      if (result.abort.reason === 'conflict') {
        expect(result.abort.conflicts).toEqual([{ ground: 'template-a/', contestants: ['template-a', 'template-b'] }]);
      }
    }
    // No file materialized once a conflict is reported — refused before any write.
    expect(materializeFn).not.toHaveBeenCalled();
  });

  it('passes the staged assembly and already-occupied boundaries to the verdict seam', async () => {
    const entry = makeEntry('template-a');
    const alreadyOccupied = [
      { templateName: 'already-applied', boundary: { exclusiveSubtrees: ['template-b/'], sharedFiles: [] } },
    ];
    const conflictVerdictFn = vi.fn(async (): Promise<ConflictVerdict> => noConflict);

    await runAssemblyOp({
      templateRefs: ['template-a'],
      targetHoldsAppliedTemplates: true,
      lookupFn: () => entry,
      readContentFn,
      alreadyOccupiedBoundaries: alreadyOccupied,
      conflictVerdictFn,
      materializeFn: async () => undefined,
    });

    expect(conflictVerdictFn).toHaveBeenCalledWith(
      expect.objectContaining({ contributions: expect.any(Array) }),
      alreadyOccupied,
    );
  });
});
