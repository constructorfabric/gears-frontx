import { describe, it, expect, vi } from 'vitest';
// cpt-frontx-dod-upgrade-changeset-single-engine
// This test proves the frontx upgrade command/invocation surface drives the
// SAME change-set engine as the library path (upgradeChangeSetReviewApproval /
// computeChangeSet), so an external artifact (F17 AI orchestration) can invoke
// the engine through commands/upgrade.ts WITHOUT importing the engine modules
// directly.
import { upgradeCommand } from '../commands/upgrade';
import { computeChangeSet } from '../upgrade/compute';
import type { ContentItem, ReadContentItemsFn } from '../scaffold/types';
import type { FetchFn } from '../resolver/types';

// Content items live SEPARATELY from the manifest, in a registry keyed by
// "name@version", and are read via the injected `readContentItems` seam
// directly from the "installed content path" — never from the manifest.
const contentRegistry = new Map<string, ContentItem[]>();
const readContentItems: ReadContentItemsFn = async (entry) =>
  contentRegistry.get(`${entry.name}@${entry.ref}`) ?? [];

// Manifests, keyed by "name@version" — the shared resolver's fetchable
// content (never a single-entry local inventory).
const manifestByVersion = new Map<string, string>();

function registerVersion(
  name: string,
  version: string,
  files: Array<{ path: string; content: string }>,
): void {
  const manifest = { name, version, ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] } };
  contentRegistry.set(`${name}@${version}`, files);
  manifestByVersion.set(`${name}@${version}`, JSON.stringify(manifest));
}

// The shared resolver's fetch primitive — resolves purely from the URL's
// trailing "@ref" segment (see resolver/resolve.ts buildFetchUrl).
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
]);

describe('upgradeCommand (F14 command/invocation surface)', () => {
  it('emits the same change set as the library computeChangeSet path, as JSON', async () => {
    const readProjectFile = async (p: string) =>
      p === `${PROJ_ROOT}/src/App.tsx` ? 'v1 content' : null;

    // Library path
    const libraryResult = await computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile,
      readContentItems,
    });
    expect(libraryResult.ok).toBe(true);
    const expectedChangeSet = (libraryResult as Extract<typeof libraryResult, { ok: true }>).changeSet;

    // Command surface path — no import of compute.js/apply.js/flow.js required by the caller
    const commandResult = await upgradeCommand(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile,
      readContentItems,
      writeProjectFile: vi.fn(),
      removeProjectFile: vi.fn(),
      writeProvenance: vi.fn(),
      presentAndGetApproval: async () => 'declined',
    });

    expect(commandResult.status).toBe('declined');
    expect(commandResult.changeSetJson).toBeDefined();
    expect(JSON.parse(commandResult.changeSetJson!)).toEqual(expectedChangeSet);
  });

  it('does not write any project file until approval, driven through the command surface', async () => {
    const writeFn = vi.fn();
    const removeFn = vi.fn();

    const result = await upgradeCommand(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
      writeProjectFile: writeFn,
      removeProjectFile: removeFn,
      writeProvenance: writeFn,
      presentAndGetApproval: async () => 'declined',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('declined');
    expect(writeFn).not.toHaveBeenCalled();
    expect(removeFn).not.toHaveBeenCalled();
  });

  it('reports resolution failure via the command surface without a change set', async () => {
    const result = await upgradeCommand(PROJ_ROOT, '99.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async () => null,
      readContentItems,
      writeProjectFile: vi.fn(),
      removeProjectFile: vi.fn(),
      writeProvenance: vi.fn(),
      presentAndGetApproval: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('resolution-failed');
    expect(result.changeSetJson).toBeUndefined();
    expect(result.message).toBeDefined();
  });

  it('reports the files a failed apply could not restore via the command surface', async () => {
    const provPath = `${PROJ_ROOT}/.frontx/provenance.json`;
    const appPath = `${PROJ_ROOT}/src/App.tsx`;
    const files = new Map<string, string>([
      [provPath, JSON.stringify([BASE_PROVENANCE], null, 2)],
      [appPath, 'v1 content'],
    ]);
    let restoring = false;

    const result = await upgradeCommand(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => BASE_PROVENANCE,
      fetchFn,
      readProjectFile: async (p) => files.get(p) ?? null,
      readContentItems,
      writeProjectFile: async (p, c) => {
        if (restoring && p === appPath) throw new Error('EACCES: permission denied');
        files.set(p, c);
      },
      removeProjectFile: async (p) => { files.delete(p); },
      writeProvenance: async () => {
        restoring = true;
        throw new Error('disk full');
      },
      presentAndGetApproval: async () => 'approved',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('apply-failed');
    expect(result.unrestoredPaths).toEqual([appPath]);
    expect(result.message).toMatch(/^Apply failed: disk full; /);
    expect(result.changeSetJson).toBeDefined();
  });
});
