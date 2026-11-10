import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideAiReplacements, withCapturedCandidates } from '../cli';
import type { ApplyPipelineDeps } from '../commands/apply';
import { createFsListDiskFilesFn } from '../adapters/fs-upgrade-io';
import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
import type { CliDeps } from '../cli';
import { BUNDLE_MARKER } from '../bundle/envelope';
import type { FetchFn } from '../resolver/types';
import type { TemplateInventory } from '../inventory/TemplateInventory';
import type { ProjectStateDocument } from '../project-state/types';

// Explicit, non-recursive cleanup of exactly what each test builds.
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    for (const file of ['.frontx/ai/demo/guide.md', '.frontx/ai/demo/notes.md', '.frontx/ai/demo/extra.md', 'tpl/frontx-template.json', 'tpl/src.ts', 'tpl/..runtime.json', 'tpl/.frontx/ai/demo/guide.md', 'slot/frontx-template.json', 'slot/.frontx/ai/demo/guide.md']) {
      try { fs.unlinkSync(path.join(root, file)); } catch { /* already absent */ }
    }
    for (const dir of ['.frontx/ai/demo', '.frontx/ai', '.frontx', 'tpl/.frontx/ai/demo', 'tpl/.frontx/ai', 'tpl/.frontx', 'tpl', 'slot/.frontx/ai/demo', 'slot/.frontx/ai', 'slot/.frontx', 'slot']) {
      try { fs.rmdirSync(path.join(root, dir)); } catch { /* absent or not empty: left for inspection */ }
    }
    fs.rmdirSync(root);
  }
});

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-ai-decision-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.frontx/ai/demo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'my local edit');
  return root;
}

const manifest = JSON.stringify({ name: 'demo', version: '2.0.0', excludedSubtrees: [], description: 'Fixture.' });
const candidate = JSON.stringify({ [BUNDLE_MARKER]: { 'frontx-template.json': manifest, '.frontx/ai/demo/guide.md': 'guide v2', '.frontx/ai/demo/extra.md': 'extra' } });

function harness(root: string) {
  const fetchFn = vi.fn(async () => candidate) as unknown as FetchFn & ReturnType<typeof vi.fn>;
  const confirm = vi.fn(async () => true);
  const deps = {
    inventory: { lookup: () => undefined } as unknown as TemplateInventory,
    resolveInstalledContentPathFn: () => { throw new Error('not installed: the slot is never read'); },
    confirmAiReplacement: confirm,
    listFolderFilesFn: createFsListDiskFilesFn(),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
  } as unknown as Pick<CliDeps, 'inventory' | 'resolveInstalledContentPathFn' | 'confirmAiReplacement' | 'listFolderFilesFn' | 'readFolderFileBinaryFn'>;
  const document: ProjectStateDocument = {
    formatVersion: 1,
    templates: { demo: { origin: 'github:acme/demo@v2.0.0', version: '2.0.0', targets: [] } },
    projectOwnedRoots: [],
  };
  const decide = (extra: { jsonMode?: boolean; yes?: boolean; digest?: string; scope?: unknown; command?: 'apply' | 'seed'; origin?: string }) =>
    decideAiReplacements({
      command: extra.command ?? 'apply',
      names: ['demo'],
      projectRoot: root,
      document,
      originOf: (name) => extra.origin ?? document.templates[name]?.origin,
      jsonMode: extra.jsonMode ?? true,
      yes: extra.yes ?? false,
      expectedPlanDigest: extra.digest,
      deps,
      fetchFn,
      canonicalizeFn: (raw) => raw,
      scope: extra.scope ?? { batch: { templates: { demo: ['app'] } } },
    });
  return { fetchFn, confirm, decide };
}

const envelope = (outcome: { stdout?: string }) =>
  JSON.parse(outcome.stdout ?? '') as { ok: boolean; error: { code: string; details: { planDigest: string; aiReplacements: unknown[] } } };

describe('AI replacement decision before any apply/seed effect (plan-ai-recovery r9 §5)', () => {
  it('acquires an uninstalled remote candidate in memory, reviews it, and approves only the reviewed digest of this command', async () => {
    const root = project();
    const h = harness(root);
    const review = await h.decide({});
    if (review.ok) throw new Error('expected a review');
    const { error } = envelope(review.outcome);
    expect(error.code).toBe('CONFIRMATION_REQUIRED');
    expect(error.details.aiReplacements).toEqual([
      expect.objectContaining({ name: 'demo', changes: [{ path: 'extra.md', kind: 'add' }, { path: 'guide.md', kind: 'replace' }] }),
    ]);
    // Nothing installed, nothing written: the destination still holds the local edit.
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('my local edit');

    // A digest from another command scope does not approve this one.
    const other = await h.decide({ yes: true, digest: error.details.planDigest, scope: { batch: { templates: { demo: ['elsewhere'] } } } });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(envelope(other.outcome).error.code).toBe('CONFIRMATION_REQUIRED');

    const approved = await h.decide({ yes: true, digest: error.details.planDigest });
    if (!approved.ok) throw new Error('expected approval');
    approved.replacements.get('demo')!();
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('guide v2');
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/extra.md'), 'utf8')).toBe('extra');
  });

  it('a destination edited after the review invalidates the digest', async () => {
    const root = project();
    const h = harness(root);
    const first = await h.decide({});
    if (first.ok) throw new Error('expected a review');
    fs.writeFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'edited after review');
    const stale = await h.decide({ yes: true, digest: envelope(first.outcome).error.details.planDigest });
    expect(stale.ok).toBe(false);
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('edited after review');
  });

  it('interactive mode asks, and a decline writes nothing', async () => {
    const root = project();
    const h = harness(root);
    h.confirm.mockResolvedValueOnce(false);
    const declined = await h.decide({ jsonMode: false });
    expect(declined).toMatchObject({ ok: false, outcome: { exitCode: 0 } });
    expect(h.confirm).toHaveBeenCalledWith(expect.stringContaining('guide.md'));
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('my local edit');
  });

  it('names the deletion of files present only in the local bundle, in JSON and interactive text', async () => {
    const root = project();
    fs.writeFileSync(path.join(root, '.frontx/ai/demo/notes.md'), 'developer notes');
    const h = harness(root);
    const review = await h.decide({});
    if (review.ok) throw new Error('expected a review');
    const parsed = JSON.parse(review.outcome.stdout ?? '') as { error: { message: string; details: { aiReplacements: { changes: unknown[] }[] } } };
    expect(parsed.error.details.aiReplacements[0]!.changes).toContainEqual({ path: 'notes.md', kind: 'local-only' });
    expect(parsed.error.message).toContain('delete 1 file(s)/folder(s) present only in the local bundle');
    h.confirm.mockResolvedValueOnce(false);
    await h.decide({ jsonMode: false });
    expect(h.confirm).toHaveBeenCalledWith(expect.stringMatching(/local-only\s+notes\.md {2}\(will be deleted\)/));
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/notes.md'), 'utf8')).toBe('developer notes');
  });

  it.each(['seed', 'apply'] as const)('%s fails closed on a link blocking the destination, installing nothing', async (command) => {
    const root = project();
    fs.unlinkSync(path.join(root, '.frontx/ai/demo/guide.md'));
    fs.rmdirSync(path.join(root, '.frontx/ai/demo'));
    fs.symlinkSync(os.tmpdir(), path.join(root, '.frontx/ai/demo'), 'dir');
    const h = harness(root);
    try {
      const refused = await h.decide({ command });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(envelope(refused.outcome).error.code).toBe('CONTENT_CONFLICT');
      // At most the in-memory acquisition that tells whether the candidate ships a bundle; nothing adopted.
      expect(h.fetchFn.mock.calls.length).toBeLessThanOrEqual(1);
      expect(fs.lstatSync(path.join(root, '.frontx/ai/demo')).isSymbolicLink()).toBe(true);
    } finally {
      fs.unlinkSync(path.join(root, '.frontx/ai/demo'));
    }
  });

  it('a mutable remote whose non-AI bytes changed between review and confirmation is not approved', async () => {
    const root = project();
    const h = harness(root);
    const first = await h.decide({});
    if (first.ok) throw new Error('expected a review');
    const changed = JSON.stringify({ [BUNDLE_MARKER]: {
      'frontx-template.json': manifest, 'src/payload.ts': 'changed outside the AI tree',
      '.frontx/ai/demo/guide.md': 'guide v2', '.frontx/ai/demo/extra.md': 'extra',
    } });
    h.fetchFn.mockResolvedValue(changed);
    const confirm = await h.decide({ yes: true, digest: envelope(first.outcome).error.details.planDigest });
    expect(confirm.ok).toBe(false);
    if (!confirm.ok) expect(envelope(confirm.outcome).error.code).toBe('CONFIRMATION_REQUIRED');
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('my local edit');
  });

  it('a local candidate is captured once: review, payload/manifest reads and the AI effect all use those bytes', async () => {
    const root = project();
    fs.mkdirSync(path.join(root, 'tpl/.frontx/ai/demo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tpl/frontx-template.json'), manifest);
    fs.writeFileSync(path.join(root, 'tpl/src.ts'), 'payload A');
    fs.writeFileSync(path.join(root, 'tpl/..runtime.json'), 'runtime A'); // a valid name that merely starts with `..`
    fs.writeFileSync(path.join(root, 'tpl/.frontx/ai/demo/guide.md'), 'guide A');
    const h = harness(root);
    const review = await h.decide({ origin: 'path:tpl' });
    if (review.ok) throw new Error('expected a review');
    const approved = await h.decide({ origin: 'path:tpl', yes: true, digest: envelope(review.outcome).error.details.planDigest });
    if (!approved.ok) throw new Error('expected approval');
    // The folder changes after approval (an A -> B edit the hashes alone could miss if reverted).
    fs.writeFileSync(path.join(root, 'tpl/src.ts'), 'payload B');
    fs.writeFileSync(path.join(root, 'tpl/..runtime.json'), 'runtime B');
    fs.writeFileSync(path.join(root, 'tpl/.frontx/ai/demo/guide.md'), 'guide B');
    const never = async () => { throw new Error('the disk must not be read for a captured candidate'); };
    const deps = withCapturedCandidates(
      { listFolderFilesFn: never, readFolderFileBinaryFn: never, readInstalledContentFn: never } as unknown as ApplyPipelineDeps,
      approved.captured,
    );
    const items = await deps.readInstalledContentFn(path.join(root, 'tpl'));
    expect(items.find((i) => i.path === 'src.ts')?.content.toString()).toBe('payload A');
    expect((await deps.readFolderFileBinaryFn(path.join(root, 'tpl/src.ts'))).toString()).toBe('payload A');
    expect((await deps.readFolderFileBinaryFn(path.join(root, 'tpl/..runtime.json'))).toString()).toBe('runtime A');
    expect((await deps.listFolderFilesFn(path.join(root, 'tpl'))).sort()).toEqual(['..runtime.json', '.frontx/ai/demo/guide.md', 'frontx-template.json', 'src.ts']);
    await expect(deps.readFolderFileBinaryFn(path.join(root, 'tpl/added-later.ts'))).rejects.toThrow(/not part of the reviewed candidate/);
    approved.replacements.get('demo')!();
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('guide A');
  });

  it.each([
    ['refuses', 'a different manifest', JSON.stringify({ name: 'demo', version: '9.9.9', excludedSubtrees: [], description: 'Index says otherwise.' })],
    ['reviews', 'the same manifest', manifest],
  ])('%s an installed slot whose index entry carries %s', async (verdict, _label, indexedManifest) => {
    const root = project();
    fs.mkdirSync(path.join(root, 'slot/.frontx/ai/demo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'slot/frontx-template.json'), manifest);
    fs.writeFileSync(path.join(root, 'slot/.frontx/ai/demo/guide.md'), 'guide from slot');
    const indexContent = JSON.stringify({ [BUNDLE_MARKER]: { 'frontx-template.json': indexedManifest } });
    const fetchFn = vi.fn() as unknown as FetchFn;
    const result = await decideAiReplacements({
      command: 'apply', names: ['demo'], projectRoot: root,
      document: { formatVersion: 1, templates: { demo: { origin: 'github:acme/demo@v2.0.0', version: '2.0.0', targets: [] } }, projectOwnedRoots: [] },
      originOf: () => 'github:acme/demo@v2.0.0', jsonMode: true, yes: false, expectedPlanDigest: undefined,
      deps: {
        inventory: { lookup: () => ({ name: 'demo', source: 'github:acme/demo@v2.0.0', ref: 'v2.0.0', status: 'INSTALLED', content: indexContent }) },
        resolveInstalledContentPathFn: () => path.join(root, 'slot'),
        confirmAiReplacement: vi.fn(),
        listFolderFilesFn: createFsListDiskFilesFn(),
        readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
      } as unknown as Parameters<typeof decideAiReplacements>[0]['deps'],
      fetchFn, canonicalizeFn: (raw) => raw, scope: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(envelope(result.outcome).error.code).toBe(verdict === 'refuses' ? 'CONTENT_CONFLICT' : 'CONFIRMATION_REQUIRED');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(root, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('my local edit');
  });
});
