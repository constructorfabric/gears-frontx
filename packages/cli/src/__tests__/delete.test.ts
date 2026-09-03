// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-state:cpt-frontx-state-cli-scaffolding-delete-op:p1
import { describe, expect, it, vi } from 'vitest';
import { deleteTarget } from '../commands/delete';
import type { ConfirmDeletionFn } from '../commands/delete';
import type { DeletePlanInventoryPort, ListTargetFilesFn } from '../scaffold/delete-plan';
import { InventoryState } from '../inventory/types';
import type { InventoryEntry } from '../inventory/types';
import type { CanonicalizeTargetFn } from '../scaffold/conflict-check';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn, TemplateEntry } from '../project-state/types';
import type { ReadFileFn } from '../manifest/types';

const identityCanonicalize: CanonicalizeTargetFn = (rawTarget) => rawTarget;

function fakeProjectState(initial: ProjectStateDocument): {
  read: ReadProjectStateFn;
  write: WriteProjectStateFn;
  written: () => ProjectStateDocument;
} {
  let stored = JSON.stringify(initial);
  const write: WriteProjectStateFn = vi.fn(async (_absolutePath, content) => {
    stored = content;
  });
  return {
    read: async () => stored,
    write,
    written: () => JSON.parse(stored) as ProjectStateDocument,
  };
}

function fakeInventory(manifestsByName: Record<string, { excludedSubtrees: string[] }> = {}): DeletePlanInventoryPort {
  return {
    lookup: (name: string): InventoryEntry | undefined => {
      const manifest = manifestsByName[name];
      if (!manifest) return undefined;
      return {
        name,
        source: `github:acme/${name}@v1.0.0`,
        ref: 'v1.0.0',
        status: InventoryState.INSTALLED,
        content: JSON.stringify({
          name,
          version: '1.0.0',
          excludedSubtrees: manifest.excludedSubtrees,
          description: 'A template.',
        }),
      };
    },
  };
}

function fakeListTargetFiles(filesByAbsoluteDir: Record<string, string[]>): ListTargetFilesFn {
  return async (absoluteDir: string) => filesByAbsoluteDir[absoluteDir] ?? [];
}

// None of the fixtures below register a `path:` (local) origin, so this
// fake is never actually invoked — kept failing rather than a harmless
// stub so a fixture that starts using a local origin without also wiring a
// real `readFileFn` fails loudly instead of silently re-introducing the
// exact `inventory.lookup`-only bug this checkpoint fixed
// (`scaffold/delete-plan.ts`'s own `inst-dp-compute-ownership` step).
const neverCalledReadFileFn: ReadFileFn = async () => {
  throw new Error('readFileFn should not be called for a remote-origin fixture');
};

function fakeRemoveFile(): { remove: (absolutePath: string) => Promise<void>; removed: () => string[] } {
  const removedPaths: string[] = [];
  return {
    remove: async (absolutePath: string) => {
      removedPaths.push(absolutePath);
    },
    removed: () => removedPaths,
  };
}

function neverConfirm(): ConfirmDeletionFn {
  return async () => {
    throw new Error('confirmDeletionFn must not be called in this mode');
  };
}

function fixedConfirm(decision: 'confirmed' | 'declined'): ConfirmDeletionFn {
  return async () => decision;
}

function entry(targets: string[], overrides: Partial<TemplateEntry> = {}): TemplateEntry {
  return { origin: 'github:acme/tmpl@v1', version: '1.0.0', targets, ...overrides };
}

describe('deleteTarget (cpt-frontx-flow-cli-scaffolding-delete-target)', () => {
  it('refuses TARGET_NOT_APPLIED and deletes/reads nothing', async () => {
    const { read, write } = fakeProjectState({ formatVersion: 1, templates: {}, projectOwnedRoots: [] });
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: false, dryRun: false, yes: false },
      fakeInventory(),
      identityCanonicalize,
      fakeListTargetFiles({}),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
    );

    expect(result).toMatchObject({ ok: false, code: 'TARGET_NOT_APPLIED' });
    expect(removed()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('--dry-run reports the plan without deleting or requiring confirmation', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app']) },
      projectOwnedRoots: [],
    };
    const { read, write } = fakeProjectState(initialDocument);
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: false, dryRun: true, yes: false },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': ['src/index.ts'] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
    );

    expect(result).toMatchObject({ ok: true, outcome: 'dry-run', toDelete: ['packages/app/src/index.ts'] });
    expect(removed()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('--json without --yes returns CONFIRMATION_REQUIRED and never reads stdin or deletes', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app']) },
      projectOwnedRoots: [],
    };
    const { read, write } = fakeProjectState(initialDocument);
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: true, dryRun: false, yes: false },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': ['src/index.ts'] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'CONFIRMATION_REQUIRED',
      details: { target: 'packages/app', toDelete: ['packages/app/src/index.ts'], toPreserve: [] },
    });
    expect(removed()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('--json --yes recomputes the plan and deletes, removing the target from targets[]', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app', 'packages/other']) },
      projectOwnedRoots: [],
    };
    const { read, write, written } = fakeProjectState(initialDocument);
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: true, dryRun: false, yes: true },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': ['src/index.ts'] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
    );

    expect(result).toMatchObject({
      ok: true,
      outcome: 'deleted',
      templateName: 'appTemplate',
      wasLastTarget: false,
      toDelete: ['packages/app/src/index.ts'],
    });
    expect(removed()).toEqual(['/repo/packages/app/src/index.ts']);
    expect(written().templates.appTemplate.targets).toEqual(['packages/other']);
  });

  it('detects wasLastTarget when the deleted target was the template\'s only one', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app']) },
      projectOwnedRoots: [],
    };
    const { read, write, written } = fakeProjectState(initialDocument);
    const { remove } = fakeRemoveFile();
    const removeAiBundle = vi.fn(async () => {});

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: true, dryRun: false, yes: true },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': [] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
      removeAiBundle,
    );

    expect(result).toMatchObject({ ok: true, outcome: 'deleted', wasLastTarget: true });
    expect(written().templates.appTemplate.targets).toEqual([]);
    expect(removeAiBundle).toHaveBeenCalledWith('appTemplate');
  });

  it('does not call the optional AI-bundle seam when this was not the last target', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app', 'packages/other']) },
      projectOwnedRoots: [],
    };
    const { read, write } = fakeProjectState(initialDocument);
    const { remove } = fakeRemoveFile();
    const removeAiBundle = vi.fn(async () => {});

    await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: true, dryRun: false, yes: true },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': [] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
      removeAiBundle,
    );

    expect(removeAiBundle).not.toHaveBeenCalled();
  });

  it('interactive confirmation deletes on "confirmed"', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app']) },
      projectOwnedRoots: [],
    };
    const { read, write, written } = fakeProjectState(initialDocument);
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: false, dryRun: false, yes: false },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': ['src/index.ts'] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      fixedConfirm('confirmed'),
    );

    expect(result).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(removed()).toEqual(['/repo/packages/app/src/index.ts']);
    expect(written().templates.appTemplate.targets).toEqual([]);
  });

  it('interactive decline (the default) deletes nothing and leaves project state unchanged', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: { appTemplate: entry(['packages/app']) },
      projectOwnedRoots: [],
    };
    const { read, write, written } = fakeProjectState(initialDocument);
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      'packages/app',
      '/repo',
      { jsonMode: false, dryRun: false, yes: false },
      fakeInventory({ appTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({ '/repo/packages/app': ['src/index.ts'] }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      fixedConfirm('declined'),
    );

    expect(result).toMatchObject({ ok: true, outcome: 'declined' });
    expect(removed()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    expect(written().templates.appTemplate.targets).toEqual(['packages/app']);
  });

  it('the target `.` (project root) case: a nested other template\'s target and a projectOwnedRoots entry are preserved, never deleted', async () => {
    const initialDocument: ProjectStateDocument = {
      formatVersion: 1,
      templates: {
        appTemplate: entry(['.']),
        adminTemplate: entry(['admin']),
      },
      projectOwnedRoots: ['docs'],
    };
    const { read, write, written } = fakeProjectState(initialDocument);
    const { remove, removed } = fakeRemoveFile();

    const result = await deleteTarget(
      '.',
      '/repo',
      { jsonMode: true, dryRun: false, yes: true },
      fakeInventory({ appTemplate: { excludedSubtrees: [] }, adminTemplate: { excludedSubtrees: [] } }),
      identityCanonicalize,
      fakeListTargetFiles({
        '/repo': ['src/index.ts', '.git/config', '.DS_Store', 'Thumbs.db', 'admin/index.ts', 'docs/readme.md'],
      }),
      neverCalledReadFileFn,
      remove,
      read,
      write,
      neverConfirm(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome !== 'deleted') throw new Error('expected a deleted outcome');
    expect(result.toDelete).toEqual(['src/index.ts']);
    expect(removed()).toEqual(['/repo/src/index.ts']);
    expect(written().templates.appTemplate.targets).toEqual([]);
    expect(written().templates.adminTemplate.targets).toEqual(['admin']);
  });
});
