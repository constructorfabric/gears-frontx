import { describe, it, expect } from 'vitest';
// cpt-frontx-algo-upgrade-changeset-compute (inst-cmp-diff-files,
// inst-cmp-scope-to-boundaries): the engine diffs the content each version's
// re-resolution fetched, scoped to the declared boundaries (#700).
import { computeChangeSet } from '../upgrade/compute';
import { readResolvedContentItems } from '../upgrade/resolved-content-items';
import { BUNDLE_MARKER } from '../bundle/envelope';
import { InventoryState } from '../inventory/types';
import type { InventoryEntry } from '../inventory/types';
import type { OwnershipBoundary } from '../manifest/types';
import type { FetchFn } from '../resolver/types';

const PROJ_ROOT = '/proj';

function bundleOf(files: Record<string, unknown>): string {
  return JSON.stringify({ [BUNDLE_MARKER]: files });
}

function entryWith(content: string): InventoryEntry {
  return { name: 'my-template', source: 'local:acme/my-template@1.0.0', ref: '1.0.0', status: InventoryState.RESOLVED, content };
}

describe('readResolvedContentItems', () => {
  it('reads every file of the bundle envelope the entry carries', async () => {
    const items = await readResolvedContentItems(
      entryWith(bundleOf({ 'frontx-template.json': '{}', 'src/App.tsx': 'app', 'src/lib/util.ts': 'util' })),
    );

    expect(items).toEqual([
      { path: 'frontx-template.json', content: '{}' },
      { path: 'src/App.tsx', content: 'app' },
      { path: 'src/lib/util.ts', content: 'util' },
    ]);
  });

  it('reads content that is not an envelope as the manifest file alone, as the content store does', async () => {
    const manifest = JSON.stringify({ name: 'my-template', version: '1.0.0' });

    expect(await readResolvedContentItems(entryWith(manifest))).toEqual([
      { path: 'frontx-template.json', content: manifest },
    ]);
  });

  it('skips an envelope value that is not file text', async () => {
    const items = await readResolvedContentItems(entryWith(bundleOf({ 'src/App.tsx': 'app', 'src/bad.ts': 42 })));

    expect(items).toEqual([{ path: 'src/App.tsx', content: 'app' }]);
  });
});

describe('computeChangeSet with the content each version fetched', () => {
  const SRC_ONLY: OwnershipBoundary = { exclusiveSubtrees: ['src'], sharedFiles: [] };

  // Serves each version as the bundle envelope a fetch adapter returns: the
  // manifest declaring `boundaries`, plus `files`. The requested version is
  // the URL's trailing "@ref" segment for the `local` host.
  function fetchServing(
    versions: Record<string, { boundaries: OwnershipBoundary; files: Record<string, string> }>,
  ): FetchFn {
    return async (url) => {
      const version = url.slice(url.lastIndexOf('@') + 1);
      const served = versions[version];
      if (!served) throw new Error(`no template at version "${version}"`);
      const manifest = JSON.stringify({ name: 'my-template', version, ownershipBoundaries: served.boundaries });
      return bundleOf({ 'frontx-template.json': manifest, ...served.files });
    };
  }

  async function compute(fetchFn: FetchFn, projectFiles: Record<string, string> = {}) {
    return computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => ({
        templateIdentity: 'my-template',
        scaffoldedFromVersion: '1.0.0',
        sourceSpec: 'local:acme/my-template@1.0.0',
      }),
      fetchFn,
      readProjectFile: async (p) => projectFiles[p] ?? null,
      readContentItems: readResolvedContentItems,
    });
  }

  it('diffs the baseline and target versions it fetched', async () => {
    const result = await compute(
      fetchServing({
        '1.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'v1 content', 'src/old.ts': 'old file' } },
        '2.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'v2 content', 'src/new.ts': 'new file' } },
      }),
      { '/proj/src/App.tsx': 'v1 content', '/proj/src/old.ts': 'old file' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean).toEqual([
      { kind: 'modify', path: 'src/App.tsx', content: 'v2 content' },
      { kind: 'remove', path: 'src/old.ts' },
      { kind: 'add', path: 'src/new.ts', content: 'new file' },
    ]);
    expect(result.changeSet.conflicts).toEqual([]);
  });

  it('leaves out every file outside the declared boundaries: the manifest, a README and .git/', async () => {
    const result = await compute(
      fetchServing({
        '1.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'app', 'README.md': 'v1 readme' } },
        '2.0.0': {
          boundaries: SRC_ONLY,
          files: { 'src/App.tsx': 'app', 'README.md': 'v2 readme', '.git/config': '[core]\n\tfsmonitor = evil' },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The manifest differs between the versions (its `version` field), and so
    // does README.md, and .git/config is new: none is declared, so none appears.
    expect(result.changeSet.clean).toEqual([]);
    expect(result.changeSet.conflicts).toEqual([]);
  });

  it('leaves out a fetched path that climbs out of its subtree, so it never reaches the project', async () => {
    const readPaths: string[] = [];
    const result = await computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => ({
        templateIdentity: 'my-template',
        scaffoldedFromVersion: '1.0.0',
        sourceSpec: 'local:acme/my-template@1.0.0',
      }),
      fetchFn: fetchServing({
        '1.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'app' } },
        // Starts with `src/`, so a prefix comparison alone would place it
        // inside the `src` claim.
        '2.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'app', 'src/../../outside.txt': 'escaped' } },
      }),
      readProjectFile: async (p) => {
        readPaths.push(p);
        return null;
      },
      readContentItems: readResolvedContentItems,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean).toEqual([]);
    expect(result.changeSet.conflicts).toEqual([]);
    expect(readPaths).toEqual([]);
  });

  it('leaves a file the target version stops declaring in place instead of removing it', async () => {
    const result = await compute(
      fetchServing({
        '1.0.0': {
          boundaries: { exclusiveSubtrees: ['src', 'lib'], sharedFiles: [] },
          files: { 'src/App.tsx': 'app', 'lib/util.ts': 'util' },
        },
        '2.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'app' } },
      }),
      { '/proj/lib/util.ts': 'util' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean).toEqual([]);
  });

  // The baseline's content carries docs/guide.md, but the baseline does not
  // declare docs, so seeding never wrote it: the project does not have it.
  const SRC_AND_DOCS: OwnershipBoundary = { exclusiveSubtrees: ['src', 'docs'], sharedFiles: [] };

  it('adds an unchanged file the baseline carried but only the target declares', async () => {
    const result = await compute(
      fetchServing({
        '1.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'app', 'docs/guide.md': 'guide' } },
        '2.0.0': {
          boundaries: SRC_AND_DOCS,
          files: { 'src/App.tsx': 'app', 'docs/guide.md': 'guide', 'docs/new.md': 'new' },
        },
      }),
      { '/proj/src/App.tsx': 'app' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean).toEqual([
      { kind: 'add', path: 'docs/guide.md', content: 'guide' },
      { kind: 'add', path: 'docs/new.md', content: 'new' },
    ]);
    expect(result.changeSet.conflicts).toEqual([]);
  });

  it('proposes no removal of a file the baseline carried but did not declare', async () => {
    const result = await compute(
      fetchServing({
        '1.0.0': { boundaries: SRC_ONLY, files: { 'src/App.tsx': 'app', 'docs/guide.md': 'guide' } },
        '2.0.0': { boundaries: SRC_AND_DOCS, files: { 'src/App.tsx': 'app', 'docs/new.md': 'new' } },
      }),
      { '/proj/src/App.tsx': 'app' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean).toEqual([{ kind: 'add', path: 'docs/new.md', content: 'new' }]);
    expect(result.changeSet.conflicts).toEqual([]);
  });
});
