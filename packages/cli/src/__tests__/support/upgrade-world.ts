import { createFsReadFolderFileBinaryFn } from '../../adapters/fs-project-io';
// Shared real-filesystem world for the upgrade crash-convergence suites: a real
// temporary project, `path:` origins written as real template folders, and the
// REAL upgrade engine wiring (real adapters, real project-state store). Only
// the plan presenter and the two post-commit steps are stubs. Used both by the
// in-process fault-injection tests and by the child process that is killed
// with SIGKILL (`upgrade-crash-child.ts`), so both drive identical wiring.
import path from 'node:path';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { requiredFormatVersion } from '../../project-state/io';
import type { ProjectStateDocument } from '../../project-state/types';
import type { UpgradeEngineDeps } from '../../upgrade/flow';
import { createResolvePayloadFn } from '../../upgrade/payload';
import {
  createFsCanonicalizeTargetFn,
  createFsPathExistsFn,
  createFsReadFileFn,
  createFsReadProjectStateFn,
  createFsWriteProjectStateFn,
} from '../../adapters/fs-project-io';
import {
  createFsListDiskFilesFn,
  createFsReadDiskEntryFn,
  createFsRenameDiskFileFn,
  createFsUnlinkDiskFileFn,
  createFsWriteDiskFileFn,
} from '../../adapters/fs-upgrade-io';

export interface WorldSpec {
  /** origin folder (project-relative) -> its manifest and payload files */
  origins: Record<string, { name: string; version: string; excluded?: string[]; files: Record<string, string> }>;
  /** project-relative files that exist on disk before the upgrade */
  disk: Record<string, string>;
  /** project-relative directories that exist (possibly empty) before the upgrade */
  dirs?: string[];
  /** `.frontx/project.json` templates map */
  templates: ProjectStateDocument['templates'];
}

export async function buildWorld(root: string, spec: WorldSpec): Promise<void> {
  await mkdir(path.join(root, '.frontx'), { recursive: true });
  for (const [folder, o] of Object.entries(spec.origins)) {
    await mkdir(path.join(root, folder), { recursive: true });
    for (const [relative, content] of Object.entries(o.files)) {
      await mkdir(path.dirname(path.join(root, folder, relative)), { recursive: true });
      await writeFile(path.join(root, folder, relative), content, 'utf-8');
    }
    await writeFile(
      path.join(root, folder, 'frontx-template.json'),
      JSON.stringify({ name: o.name, version: o.version, excludedSubtrees: o.excluded ?? [], description: 'f' }),
      'utf-8',
    );
  }
  for (const [relative, content] of Object.entries(spec.disk)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content, 'utf-8');
  }
  for (const dir of spec.dirs ?? []) await mkdir(path.join(root, dir), { recursive: true });
  const document: ProjectStateDocument = { formatVersion: 1, templates: spec.templates, projectOwnedRoots: [] };
  await writeFile(
    path.join(root, '.frontx', 'project.json'),
    JSON.stringify({ ...document, formatVersion: requiredFormatVersion(document) } satisfies ProjectStateDocument),
    'utf-8',
  );
}

export interface Hooks {
  onWriteDisk?: (absolutePath: string) => void | Promise<void>;
  onRename?: (from: string, to: string) => void | Promise<void>;
  onUnlink?: (absolutePath: string) => void | Promise<void>;
  onStateWrite?: (absolutePath: string) => void | Promise<void>;
}

/** The REAL engine wiring, with optional observation/fault hooks that run BEFORE the real seam. */
export function realDeps(repoRoot: string, hooks: Hooks = {}): UpgradeEngineDeps {
  const write = createFsWriteDiskFileFn(repoRoot);
  const rename = createFsRenameDiskFileFn(repoRoot);
  const unlink = createFsUnlinkDiskFileFn(repoRoot);
  const writeState = createFsWriteProjectStateFn();
  return {
    repoRoot,
    readProjectStateFn: createFsReadProjectStateFn(),
    writeProjectStateFn: async (p, content) => {
      await hooks.onStateWrite?.(p);
      return writeState(p, content);
    },
    resolvePayload: createResolvePayloadFn({
      repoRoot,
      fetchFn: async () => '',
      readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
      readFileFn: createFsReadFileFn(),
      listDiskFiles: createFsListDiskFilesFn(),
      existsFn: createFsPathExistsFn(),
      canonicalizeFn: createFsCanonicalizeTargetFn(repoRoot),
    }),
    resolveRegisteredExclusions: async () => [],
    readDiskEntry: createFsReadDiskEntryFn(repoRoot),
    writeDiskFile: async (p, content) => {
      await hooks.onWriteDisk?.(p);
      return write(p, content);
    },
    renameDiskFile: async (from, to) => {
      await hooks.onRename?.(from, to);
      return rename(from, to);
    },
    unlinkDiskFile: async (p) => {
      await hooks.onUnlink?.(p);
      return unlink(p);
    },
    listDiskFiles: createFsListDiskFilesFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(repoRoot),
    presentPlan: async () => 'approved' as never,
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };
}

/** Every file under `root` (project-relative POSIX path -> content), temp litter included, `.frontx/project.json` excluded. */
export async function snapshotTree(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(absolute);
      else if (relative !== '.frontx/project.json') out[relative] = await readFile(absolute, 'utf-8');
    }
  }
  await walk(root);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export async function readStateDocument(root: string): Promise<ProjectStateDocument> {
  return JSON.parse(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;
}
