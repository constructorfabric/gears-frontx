// @cpt-flow:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1
// @cpt-state:cpt-frontx-state-composed-provenance-composition-resolution:p1
// @cpt-algo:cpt-frontx-algo-composed-provenance-provenance-write:p1
import { describe, it, expect, vi } from 'vitest';
import { scaffoldComposedProject } from '../scaffold/composed';
import type { InventoryEntry } from '../inventory/types';
import { InventoryState } from '../inventory/types';
import type { ContentItem, ReadContentItemsFn, ReadProjectFileFn } from '../scaffold/types';
import type { OwnershipBoundary } from '../manifest/types';

// Content items live SEPARATELY from the manifest, in a registry keyed by
// template name, and are read via the injected `readContentFn` seam directly
// from the "installed content path" — never from the manifest.
const contentRegistry = new Map<string, ContentItem[]>();
const readContentFn: ReadContentItemsFn = async (entry) => contentRegistry.get(entry.name) ?? [];

// Every fixture below scaffolds a fresh target directory with nothing
// on it yet, so the seam that reads a shared file already on disk
// (`cpt-frontx-algo-cli-scaffolding-compose-shared-files` inst-cs-read-existing-blocks)
// always sees "absent" here.
const readProjectFileFn: ReadProjectFileFn = async () => null;

const NO_BOUNDARY: OwnershipBoundary = { exclusiveSubtrees: [], sharedFiles: [] };

// Helper: build a minimal inventory entry with a serialized manifest (no `files`).
// `boundary` declares the real ownership boundary the uniform-apply staging
// path (`cpt-frontx-algo-cli-scaffolding-uniform-apply`) scopes content reads
// to — every fixture that contributes files below declares one matching its
// own content paths, per `cpt-frontx-dod-cli-scaffolding-boundary-declared-assembly`.
function makeEntry(
  name: string,
  version: string,
  files: Array<{ path: string; content: string }>,
  compositions: Array<{ ref: string }> = [],
  boundary: OwnershipBoundary = NO_BOUNDARY,
): InventoryEntry {
  const manifest = {
    name,
    version,
    ownershipBoundaries: boundary,
    referencedTemplates: compositions.map((c) => ({ ref: c.ref, appliedAt: '.' })),
  };
  contentRegistry.set(name, files);
  return {
    name,
    source: `local:${name}`,
    ref: version,
    status: InventoryState.INSTALLED,
    content: JSON.stringify(manifest),
  };
}

// (a) Single scaffold operation delivers all manifest-declared MFEs
describe('scaffoldComposedProject', () => {
  it('(a) delivers all files from composed MFE templates', async () => {
    const registry = new Map<string, InventoryEntry>([
      ['root-project', makeEntry('root-project', '1.0.0', [], [{ ref: 'mfe-a' }, { ref: 'mfe-b' }])],
      [
        'mfe-a',
        makeEntry('mfe-a', '1.0.0', [{ path: 'src/a.ts', content: 'export const a = 1;' }], [], {
          exclusiveSubtrees: ['src/a.ts'],
          sharedFiles: [],
        }),
      ],
      [
        'mfe-b',
        makeEntry('mfe-b', '1.0.0', [{ path: 'src/b.ts', content: 'export const b = 2;' }], [], {
          exclusiveSubtrees: ['src/b.ts'],
          sharedFiles: [],
        }),
      ],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    const result = await scaffoldComposedProject(
      'root-project',
      '/target',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(true);
    const writtenPaths = writeFileFn.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(writtenPaths.some((p) => p.includes('src/a.ts'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('src/b.ts'))).toBe(true);
  });

  // (b) Transitive multi-level composition resolves all files at all depths
  it('(b) resolves transitive multi-level composition (depth=2 file)', async () => {
    const registry = new Map<string, InventoryEntry>([
      ['root', makeEntry('root', '1.0.0', [], [{ ref: 'template-a' }])],
      ['template-a', makeEntry('template-a', '1.0.0', [], [{ ref: 'template-b' }])],
      [
        'template-b',
        makeEntry('template-b', '1.0.0', [{ path: 'src/deep.ts', content: 'deep' }], [], {
          exclusiveSubtrees: ['src/deep.ts'],
          sharedFiles: [],
        }),
      ],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    const result = await scaffoldComposedProject(
      'root',
      '/target',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(true);
    const writtenPaths = writeFileFn.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(writtenPaths.some((p) => p.includes('src/deep.ts'))).toBe(true);
  });

  // (c) Same-target-path claims from two independently-declared templates are
  // NOT arbitrated by resolution itself (cpt-frontx-algo-composed-provenance-recursive-resolution
  // hands over an unarbitrated per-template set) — but under the Option-C
  // ordering, the pre-flight ownership-boundary conflict check IS submitted
  // that unarbitrated set and DOES refuse it: the flow aborts, reporting the
  // contested target path and both contesting template identities, and
  // writes NO files (cpt-frontx-algo-cli-scaffolding-conflict-check,
  // inst-abort-boundary-conflict).
  it('(c) same-path claims from two templates trigger the pre-flight conflict check — abort, no files written', async () => {
    const registry = new Map<string, InventoryEntry>([
      [
        'root',
        makeEntry(
          'root',
          '1.0.0',
          [{ path: 'shared.ts', content: 'root-content' }],
          [{ ref: 'template-a' }],
          { exclusiveSubtrees: ['shared.ts'], sharedFiles: [] },
        ),
      ],
      [
        'template-a',
        makeEntry('template-a', '1.0.0', [{ path: 'shared.ts', content: 'a-content' }], [], {
          exclusiveSubtrees: ['shared.ts'],
          sharedFiles: [],
        }),
      ],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    const result = await scaffoldComposedProject(
      'root',
      '/target',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('conflict');
    if (result.reason === 'conflict') {
      expect(result.conflicts).toEqual([{ ground: 'shared.ts', contestants: ['root', 'template-a'] }]);
      expect(result.message).toContain('shared.ts');
      expect(result.message).toContain('root');
      expect(result.message).toContain('template-a');
    }
    expect(writeFileFn).not.toHaveBeenCalled();
    expect(provenanceWriteFn).not.toHaveBeenCalled();
  });

  // (d) Diamond reference (not a collision at this layer): tpl-x is referenced
  // via both tpl-a and tpl-b, but is deduplicated once per distinct template
  // identity in the accumulated per-template set — resolution neither detects
  // nor aborts on this, since same-target-path arbitration is not its concern.
  it('(d) diamond reference dedups by template identity — resolves, no collision at this layer', async () => {
    const registry = new Map<string, InventoryEntry>([
      ['root', makeEntry('root', '1.0.0', [], [{ ref: 'tpl-a' }, { ref: 'tpl-b' }])],
      ['tpl-a', makeEntry('tpl-a', '1.0.0', [], [{ ref: 'tpl-x' }])],
      ['tpl-b', makeEntry('tpl-b', '1.0.0', [], [{ ref: 'tpl-x' }])],
      [
        'tpl-x',
        makeEntry('tpl-x', '1.0.0', [{ path: 'conflict.ts', content: 'x' }], [], {
          exclusiveSubtrees: ['conflict.ts'],
          sharedFiles: [],
        }),
      ],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    const result = await scaffoldComposedProject(
      'root',
      '/target',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(true);
    const conflictCalls = writeFileFn.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('conflict.ts'),
    );
    // tpl-x is one distinct template identity, so its content is written once,
    // regardless of being reachable via two different reference paths.
    expect(conflictCalls).toHaveLength(1);
  });

  // (e) Cycle detection: A composes B, B composes A → abort, no files written
  it('(e) cycle in composition graph → abort with cycle reason, no files written', async () => {
    const registry = new Map<string, InventoryEntry>([
      ['template-a', makeEntry('template-a', '1.0.0', [], [{ ref: 'template-b' }])],
      ['template-b', makeEntry('template-b', '1.0.0', [], [{ ref: 'template-a' }])],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    const result = await scaffoldComposedProject(
      'template-a',
      '/target',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('cycle');
    }
    expect(writeFileFn).not.toHaveBeenCalled();
  });

  // (f) Provenance record written at scaffold with required fields — a SET
  // with exactly one record for the sole applied template, no single
  // whole-repository origin record.
  it('(f) provenance record written as a per-applied-template set, no whole-repository origin record', async () => {
    const registry = new Map<string, InventoryEntry>([
      [
        'simple-project',
        makeEntry('simple-project', '2.1.0', [{ path: 'index.ts', content: 'x' }], [], {
          exclusiveSubtrees: ['index.ts'],
          sharedFiles: [],
        }),
      ],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    await scaffoldComposedProject(
      'simple-project',
      '/my-project',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(provenanceWriteFn).toHaveBeenCalledOnce();
    const [provenancePath, provenanceContent] = provenanceWriteFn.mock.calls[0] as [string, string];
    expect(provenancePath).toBe('/my-project/.frontx/provenance.json');

    // The written provenance store is a SET (array) of per-applied-template
    // records — never a single flat whole-repository origin record.
    const parsed = JSON.parse(provenanceContent) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    const records = parsed as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);

    const [record] = records;
    expect(record).toHaveProperty('templateIdentity');
    expect(record).toHaveProperty('scaffoldedFromVersion');
    expect(record).toHaveProperty('sourceSpec');
    expect(record).toHaveProperty('occupiedOwnershipBoundary');
    expect(record['templateIdentity']).toBe('simple-project');
    expect(record['scaffoldedFromVersion']).toBe('2.1.0');
  });

  // (g) A multi-template composition (no boundary clash) writes the FULL
  // per-applied-template provenance SET — one record PER applied template,
  // not a single record for the root alone.
  it('(g) multi-template composition writes one provenance record per applied template', async () => {
    const registry = new Map<string, InventoryEntry>([
      [
        'root-project',
        makeEntry(
          'root-project',
          '1.0.0',
          [{ path: 'root/index.ts', content: 'root' }],
          [{ ref: 'mfe-a' }],
          { exclusiveSubtrees: ['root/index.ts'], sharedFiles: [] },
        ),
      ],
      [
        'mfe-a',
        makeEntry('mfe-a', '1.0.0', [{ path: 'src/a.ts', content: 'export const a = 1;' }], [], {
          exclusiveSubtrees: ['src/a.ts'],
          sharedFiles: [],
        }),
      ],
    ]);

    const lookupFn = (name: string) => registry.get(name);
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const provenanceWriteFn = vi.fn().mockResolvedValue(undefined);

    const result = await scaffoldComposedProject(
      'root-project',
      '/target',
      lookupFn,
      writeFileFn,
      provenanceWriteFn,
      readContentFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(true);
    const provenanceContent = provenanceWriteFn.mock.calls.at(-1)?.[1] as string;
    const records = JSON.parse(provenanceContent) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    expect(records.map((r) => r['templateIdentity']).sort()).toEqual(['mfe-a', 'root-project']);
  });
});
