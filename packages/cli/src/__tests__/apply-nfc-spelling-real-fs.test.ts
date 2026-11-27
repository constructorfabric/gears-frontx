import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runApplyPipeline } from '../commands/apply';
import type { ApplyPipelineDeps } from '../commands/apply';
import { validateProject } from '../commands/validate-project';
import type { ValidateProjectDeps } from '../commands/validate-project';
import type { ProjectStateDocument } from '../project-state/types';
import {
  createFsAssertPathWithinRootFn,
  createFsCanonicalizeTargetFn,
  createFsPathExistsFn,
  createFsReadFileFn,
  createFsReadProjectStateFn,
  createFsRemoveProjectFileFn,
  createFsWriteFileFn,
  createFsWriteProjectStateFn,
} from '../adapters/fs-project-io';
import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
import { createFsListDiskFilesFn } from '../adapters/fs-upgrade-io';
import { createFsReadExistingContentFn, createFsReadInstalledContentFn } from '../adapters/fs-existing-content';
import { createFsBundleExistsFn, createFsCopyBundleFn, createFsRemoveBundleFn } from '../adapters/fs-ai-bundle';

const unicodeNormalizingFs = (() => {
  const nfc = path.join(tmpdir(), `_frontx_nfc_spelling_probe_${Date.now()}_é`);
  const nfd = path.join(tmpdir(), `_frontx_nfc_spelling_probe_${Date.now()}_é`);
  try {
    writeFileSync(nfc, '');
    return existsSync(nfd);
  } finally {
    try { unlinkSync(nfc); } catch { /* probe cleanup */ }
  }
})();

function isCaseInsensitiveDirectory(dir: string): boolean {
  const lower = path.join(dir, `_frontx_case_probe_${Date.now()}_a`);
  const upper = lower.toUpperCase();
  try {
    writeFileSync(lower, '');
    const a = statSync(lower);
    const b = statSync(upper);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  } finally {
    try { unlinkSync(lower); } catch { /* probe cleanup */ }
  }
}

let sandbox: string | undefined;

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

async function makeProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-nfc-spelling-'));
  const project = path.join(sandbox, 'project');
  const vendor = path.join(project, 'vendor-a');
  await mkdir(path.join(vendor, '.frontx', 'ai', '@x', 'a'), { recursive: true });
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  await writeFile(path.join(vendor, 'frontx-template.json'), JSON.stringify({
    name: '@x/a', version: '1.0.0', excludedSubtrees: [], description: 'NFC spelling fixture',
  }), 'utf-8');
  await writeFile(path.join(vendor, 'payload.txt'), 'template bytes\n', 'utf-8');
  await writeFile(path.join(vendor, '.frontx', 'ai', '@x', 'a', 'SKILL.md'), 'bundle bytes\n', 'utf-8');
  await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify({
    formatVersion: 1,
    templates: { '@x/a': { origin: 'path:vendor-a', version: '1.0.0', targets: [], excludedSubtrees: [] } },
    projectOwnedRoots: [],
  } satisfies ProjectStateDocument), 'utf-8');
  return project;
}

function deps(project: string): ApplyPipelineDeps {
  const inventory = {
    lookup: () => undefined,
    install: vi.fn(async () => ({ ok: false as const, error: { code: 'ORIGIN_UNAVAILABLE' as const, message: 'not used' } })),
  };
  return {
    inventory,
    fetchFn: vi.fn(async () => ''),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
    readFileFn: createFsReadFileFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(project),
    existsFn: createFsPathExistsFn(),
    listFolderFilesFn: createFsListDiskFilesFn(),
    resolveInstalledContentPathFn: (name: string) => name,
    readInstalledContentFn: createFsReadInstalledContentFn(project),
    readExistingContentFn: createFsReadExistingContentFn(project),
    writeFileFn: createFsWriteFileFn(),
    readProjectStateFn: createFsReadProjectStateFn(),
    writeProjectStateFn: createFsWriteProjectStateFn(),
    bundleExistsFn: createFsBundleExistsFn(),
    copyBundleFn: createFsCopyBundleFn(),
    removeBundleFn: createFsRemoveBundleFn(),
    assertPathWithinRootFn: createFsAssertPathWithinRootFn(project),
    removeProjectFileFn: createFsRemoveProjectFileFn(),
    removeEmptyDirFn: async () => {},
  };
}

async function validate(project: string) {
  const validationDeps: ValidateProjectDeps = {
    readProjectStateFn: createFsReadProjectStateFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(project),
    existsFn: createFsPathExistsFn(),
    listFolderFilesFn: createFsListDiskFilesFn(),
    readFileFn: createFsReadFileFn(),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
    fetchFn: vi.fn(async () => ''),
  };
  return validateProject(project, validationDeps);
}

describe('apply records canonical filesystem spelling for Unicode-equivalent targets', () => {
  it.skipIf(!unicodeNormalizingFs)('refuses an existing NFD spelling that aliases an NFC payload and preserves user bytes', async () => {
    const project = await makeProject();
    const target = path.join(project, 'app');
    await mkdir(target);
    await writeFile(path.join(project, 'vendor-a', 'café.txt'), 'template bytes\n', 'utf-8');
    await writeFile(path.join(target, 'café.txt'), 'user bytes\n', 'utf-8');

    const result = await runApplyPipeline({ templates: { '@x/a': ['app'] } }, project, true, deps(project));

    expect(result).toMatchObject({ ok: false, code: 'CONTENT_CONFLICT' });
    expect(await readFile(path.join(target, 'café.txt'), 'utf-8')).toBe('user bytes\n');
  });

  it('refuses case-only existing-file aliases on folding volumes and preserves user bytes', async () => {
    const project = await makeProject();
    const target = path.join(project, 'app');
    await mkdir(target);
    await writeFile(path.join(target, 'PAYLOAD.TXT'), 'user bytes\n', 'utf-8');
    const caseInsensitive = isCaseInsensitiveDirectory(target);

    const result = await runApplyPipeline({ templates: { '@x/a': ['app'] } }, project, true, deps(project));

    if (caseInsensitive) {
      expect(result).toMatchObject({ ok: false, code: 'CONTENT_CONFLICT' });
      expect(await readFile(path.join(target, 'PAYLOAD.TXT'), 'utf-8')).toBe('user bytes\n');
    } else {
      expect(result).toMatchObject({ ok: true });
      expect(await readFile(path.join(target, 'PAYLOAD.TXT'), 'utf-8')).toBe('user bytes\n');
      expect(await readFile(path.join(target, 'payload.txt'), 'utf-8')).toBe('template bytes\n');
    }
  });

  it.skipIf(!unicodeNormalizingFs)('adopting an existing NFD target preserves its spelling and bytes', async () => {
    const project = await makeProject();
    const nfc = 'café';
    const nfd = 'café';
    await mkdir(path.join(project, nfd));
    await writeFile(path.join(project, nfd, 'local.txt'), 'keep these bytes\n', 'utf-8');

    const result = await runApplyPipeline({ templates: { '@x/a': [nfc] } }, project, true, deps(project));
    expect(result).toMatchObject({ ok: true });
    const state = JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;
    expect(state.templates['@x/a']?.targets).toEqual([nfd]);
    expect(await readFile(path.join(project, nfd, 'local.txt'), 'utf-8')).toBe('keep these bytes\n');
    expect(await validate(project)).toEqual({ ok: true });
  });

  it('deduplicates NFC/NFD aliases in one template batch while retaining the canonical spelling', async () => {
    const project = await makeProject();
    const nfc = 'café';
    const nfd = 'café';
    await mkdir(path.join(project, nfd));
    await writeFile(path.join(project, nfd, 'local.txt'), 'keep these bytes\n', 'utf-8');
    const canonical = createFsCanonicalizeTargetFn(project);
    const expected = canonical(nfc);

    const result = await runApplyPipeline({ templates: { '@x/a': [nfc, nfd] } }, project, true, deps(project));
    expect(result).toMatchObject({ ok: true });
    const state = JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;
    expect(state.templates['@x/a']?.targets).toEqual([expected]);
    expect(state.templates['@x/a']?.targets).toHaveLength(1);
    expect(await readFile(path.join(project, nfd, 'local.txt'), 'utf-8')).toBe('keep these bytes\n');
    expect(await validate(project)).toEqual({ ok: true });
  });
});
