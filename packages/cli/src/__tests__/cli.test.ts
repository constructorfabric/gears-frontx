import { describe, it, expect, vi } from 'vitest';
import {
  parseInvocation,
  helpOutcome,
  usageText,
  run,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  EXIT_INTERNAL_ERROR,
} from '../cli';
import type { CliDeps } from '../cli';
import { TemplateInventory } from '../inventory/TemplateInventory';
import type { FetchFn } from '../resolver/types';
import type { ContentItem, ReadContentItemsFn, WriteFileFn } from '../scaffold/types';
import type { ProvenanceRecord, ProvenanceWriteFn } from '../provenance/types';
import type { ReadProvenanceRecordsFn } from '../scaffold/materialize';
import type { ListContentOwnedFilesFn, ReadFileFn, TemplateManifest } from '../manifest/types';

// F18: cpt-frontx-flow-cli-invocation-run-command,
// cpt-frontx-flow-cli-invocation-help,
// cpt-frontx-algo-cli-invocation-parse-dispatch,
// cpt-frontx-state-cli-invocation-run

function makeManifest(name: string, version: string, overrides: Partial<TemplateManifest> = {}): TemplateManifest {
  return {
    name,
    version,
    ownershipBoundaries: { exclusiveSubtrees: [`${name}/`], sharedFiles: [] },
    ...overrides,
  };
}

export interface DepsFixture {
  deps: CliDeps;
  registerManifest: (spec: string, manifest: TemplateManifest) => void;
  registerContent: (name: string, items: ContentItem[]) => void;
}

// Builds an isolated set of fakes for one test — no real fs/network, per
// this package's dependency-injection test convention.
function makeDeps(overrides: Partial<CliDeps> = {}): DepsFixture {
  const manifestsByRef = new Map<string, string>();
  const contentByName = new Map<string, ContentItem[]>();

  // The resolver builds a GitHub tarball URL from the parsed source-spec
  // (`resolver/resolve.ts` buildFetchUrl): "https://api.github.com/repos/
  // <owner>/<repo>/tarball/<ref>". Reconstruct the "host:owner/repo@ref"
  // spec key from that URL so tests can register fixtures by spec string.
  const fetchFn: FetchFn = vi.fn(async (url: string) => {
    const match = /\/repos\/([^/]+)\/([^/]+)\/tarball\/(.+)$/.exec(url);
    const key = match ? `github:${match[1]}/${match[2]}@${match[3]}` : url;
    const manifest = manifestsByRef.get(key);
    if (!manifest) throw new Error(`no manifest registered for fetch url "${url}"`);
    return manifest;
  });

  const readContentFn: ReadContentItemsFn = vi.fn(async (entry) => contentByName.get(entry.name) ?? []);
  const writeFileFn: WriteFileFn = vi.fn(async () => undefined);
  const provenanceWriteFn: ProvenanceWriteFn = vi.fn(async () => undefined);
  const readProvenanceRecordsFn: ReadProvenanceRecordsFn = vi.fn(async () => []);
  const readFileFn: ReadFileFn = vi.fn(async () => {
    throw new Error('manifest not found');
  });
  // Default fixture finds no carrier files, so `validate` dispatch tests that
  // don't care about content self-containment exercise only the manifest-
  // contract path (matching this file's existing coverage before #493).
  const listContentOwnedFilesFn: ListContentOwnedFilesFn = vi.fn(async () => []);

  const deps: CliDeps = {
    inventory: new TemplateInventory(),
    fetchFn,
    readContentFn,
    writeFileFn,
    readFileFn,
    listContentOwnedFilesFn,
    provenanceWriteFn,
    readProvenanceRecordsFn,
    readSingleProvenanceFn: vi.fn(async () => null),
    readProjectFile: vi.fn(async () => null),
    writeProjectFile: vi.fn(async () => undefined),
    removeProjectFile: vi.fn(async () => undefined),
    presentAndGetApproval: vi.fn(async (): Promise<'approved' | 'declined'> => 'declined'),
    ...overrides,
  };

  return {
    deps,
    registerManifest: (spec, manifest) => manifestsByRef.set(spec, JSON.stringify(manifest)),
    registerContent: (name, items) => contentByName.set(name, items),
  };
}

describe('parseInvocation (cpt-frontx-algo-cli-invocation-parse-dispatch)', () => {
  it('treats no argv as a help request', () => {
    const parsed = parseInvocation([]);
    expect(parsed.command).toBeUndefined();
    expect(parsed.helpRequested).toBe(true);
    expect(parsed.unrecognized).toBe(false);
  });

  it('treats "help", "-h" and "--help" as a help request', () => {
    for (const token of ['help', '-h', '--help']) {
      const parsed = parseInvocation([token]);
      expect(parsed.helpRequested).toBe(true);
      expect(parsed.unrecognized).toBe(false);
    }
  });

  it('parses a leading command token and its remaining arguments', () => {
    const parsed = parseInvocation(['install', 'github:acme/foo@v1.0.0', '--extra']);
    expect(parsed.command).toBe('install');
    expect(parsed.args).toEqual(['github:acme/foo@v1.0.0', '--extra']);
    expect(parsed.helpRequested).toBe(false);
    expect(parsed.unrecognized).toBe(false);
  });

  it('flags an unrecognized command token', () => {
    const parsed = parseInvocation(['bogus-command']);
    expect(parsed.unrecognized).toBe(true);
    expect(parsed.helpRequested).toBe(false);
  });
});

describe('usage/help (cpt-frontx-flow-cli-invocation-help)', () => {
  it('lists every dispatchable command', () => {
    const text = usageText();
    for (const cmd of ['install', 'list', 'update-local', 'validate', 'seed', 'add', 'upgrade']) {
      expect(text).toContain(cmd);
    }
  });

  it('emits usage and exits success for a help request', () => {
    const outcome = helpOutcome(parseInvocation(['help']));
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toContain('Usage: frontx');
  });

  it('emits usage and exits user-error for an unrecognized command', () => {
    const outcome = helpOutcome(parseInvocation(['bogus-command']));
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    expect(outcome.stderr).toContain('Unrecognized command');
    expect(outcome.stderr).toContain('Usage: frontx');
  });

  it('run() defers to help for no command, dispatching nothing', async () => {
    const { deps } = makeDeps();
    const outcome = await run([], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });

  it('run() defers to help for an unrecognized command with user-error exit', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['bogus-command'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
});

describe('dispatch: install (cpt-frontx-flow-template-resolution-install)', () => {
  it('dispatches to the install behavior exactly once and exits success', async () => {
    const { deps, registerManifest } = makeDeps();
    registerManifest('github:acme/foo@v1.0.0', makeManifest('foo', '1.0.0'));

    const outcome = await run(['install', 'github:acme/foo@v1.0.0'], deps);

    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toContain('Installed foo');
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('exits user-error when the <spec> argument is missing', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['install'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });

  it('exits user-error when the source-spec fails to resolve', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['install', 'not-a-valid-spec'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });

  it('exits internal-error when the dispatched behavior fails unexpectedly', async () => {
    // The shared resolver already turns a fetch failure into an ok:false
    // USER-facing result (resolver/resolve.ts inst-resolve-fetch-fail) — so
    // an unexpected THROW from the dispatched behavior itself (not a
    // reported user/input failure) is what must map to internal-error here.
    const brokenInventory = {
      install: vi.fn(async () => {
        throw new Error('inventory store exploded');
      }),
    } as unknown as TemplateInventory;
    const { deps } = makeDeps({ inventory: brokenInventory });
    const outcome = await run(['install', 'github:acme/foo@v1.0.0'], deps);
    expect(outcome.exitCode).toBe(EXIT_INTERNAL_ERROR);
    expect(outcome.stderr).toContain('inventory store exploded');
  });
});

describe('dispatch: list (cpt-frontx-flow-template-resolution-list)', () => {
  it('exits success with an empty-inventory message when nothing is installed', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['list'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toBe('No templates installed.');
  });

  it('lists a previously installed template', async () => {
    const { deps, registerManifest } = makeDeps();
    registerManifest('github:acme/foo@v1.0.0', makeManifest('foo', '1.0.0'));
    await run(['install', 'github:acme/foo@v1.0.0'], deps);

    const outcome = await run(['list'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toContain('foo@v1.0.0');
  });
});

describe('dispatch: update-local (cpt-frontx-flow-template-resolution-update-local)', () => {
  it('exits user-error when the template is not yet installed', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['update-local', 'foo', 'github:acme/foo@v2.0.0'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });

  it('dispatches once and exits success for an already-installed template', async () => {
    const { deps, registerManifest } = makeDeps();
    registerManifest('github:acme/foo@v1.0.0', makeManifest('foo', '1.0.0'));
    registerManifest('github:acme/foo@v2.0.0', makeManifest('foo', '2.0.0'));
    await run(['install', 'github:acme/foo@v1.0.0'], deps);

    const outcome = await run(['update-local', 'foo', 'github:acme/foo@v2.0.0'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toContain('Updated foo');
    expect(deps.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('exits user-error when required arguments are missing', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['update-local', 'foo'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });
});

describe('dispatch: validate (cpt-frontx-flow-template-manifest-validate-for-publication)', () => {
  it('exits success when the manifest passes validation', async () => {
    const manifest = makeManifest('foo', '1.0.0');
    const readFileFn: ReadFileFn = vi.fn(async () => JSON.stringify(manifest));
    const { deps } = makeDeps({ readFileFn });

    const outcome = await run(['validate', '/tmp/some-template'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toContain('PASS');
    expect(readFileFn).toHaveBeenCalledTimes(1);
  });

  it('exits user-error when the manifest is missing', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['validate', '/tmp/absent-template'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    expect(outcome.stderr).toContain('manifest not found');
  });

  it('exits user-error when the <templateDir> argument is missing', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['validate'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });
});

describe('dispatch: seed (cpt-frontx-flow-cli-scaffolding-seed-repository)', () => {
  it('exits user-error when the template is not installed', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['seed', 'foo', '/tmp/target-repo'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });

  it('dispatches once and exits success for an installed template', async () => {
    const { deps, registerManifest, registerContent } = makeDeps();
    registerManifest('github:acme/foo@v1.0.0', makeManifest('foo', '1.0.0'));
    registerContent('foo', [{ path: 'foo/src/App.tsx', content: 'hello' }]);
    await run(['install', 'github:acme/foo@v1.0.0'], deps);

    const outcome = await run(['seed', 'foo', '/tmp/target-repo'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(deps.writeFileFn).toHaveBeenCalledTimes(1);
    expect(deps.provenanceWriteFn).toHaveBeenCalledTimes(1);
  });

  it('exits user-error when required arguments are missing', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['seed', 'foo'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });

  // F-3 (issue #470 phase 4.5): ADR-0032 requires the refusal to name each
  // contested ground and its contesting templates. `seedRepository` already
  // returns `result.conflicts`; this locks in that `run()` actually prints
  // it instead of dropping it and printing only the generic abort message.
  it('prints the contested ground and its contesting templates to stderr on a boundary conflict', async () => {
    const { deps, registerManifest, registerContent } = makeDeps();
    registerManifest(
      'github:acme/clash-a@v1.0.0',
      makeManifest('clash-a', '1.0.0', {
        ownershipBoundaries: { exclusiveSubtrees: ['shared/'], sharedFiles: [] },
        referencedTemplates: [{ ref: 'clash-b', appliedAt: 'clash-b/' }],
      }),
    );
    registerManifest(
      'github:acme/clash-b@v1.0.0',
      makeManifest('clash-b', '1.0.0', {
        ownershipBoundaries: { exclusiveSubtrees: ['shared/'], sharedFiles: [] },
      }),
    );
    registerContent('clash-a', [{ path: 'clash-a/index.ts', content: 'a' }]);
    registerContent('clash-b', [{ path: 'clash-b/index.ts', content: 'b' }]);
    await run(['install', 'github:acme/clash-a@v1.0.0'], deps);
    await run(['install', 'github:acme/clash-b@v1.0.0'], deps);

    const outcome = await run(['seed', 'clash-a', '/tmp/target-repo'], deps);

    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    expect(outcome.stderr).toContain('shared/');
    expect(outcome.stderr).toContain('clash-a');
    expect(outcome.stderr).toContain('clash-b');
  });
});

describe('dispatch: add (cpt-frontx-flow-cli-scaffolding-add-template)', () => {
  it('dispatches once and exits success into an existing repository', async () => {
    const { deps, registerManifest, registerContent } = makeDeps();
    registerManifest('github:acme/bar@v1.0.0', makeManifest('bar', '1.0.0'));
    registerContent('bar', [{ path: 'bar/src/Bar.tsx', content: 'hello bar' }]);
    await run(['install', 'github:acme/bar@v1.0.0'], deps);

    const outcome = await run(['add', 'bar', '/tmp/existing-repo'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(deps.readProvenanceRecordsFn).toHaveBeenCalledTimes(1);
  });

  it('exits user-error when the template is not installed', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['add', 'bar', '/tmp/existing-repo'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });

  // F-3 (issue #470 phase 4.5): symmetric with the `seed` case above —
  // `addTemplate` returns `result.conflicts` when the staged assembly claims
  // ground already occupied per provenance; `run()` must print it, not just
  // the generic abort message.
  it('prints the contested ground and its contesting templates to stderr on a boundary conflict', async () => {
    const provenanceRecord: ProvenanceRecord = {
      templateIdentity: 'bar',
      scaffoldedFromVersion: '1.0.0',
      sourceSpec: 'github:acme/bar@v1.0.0',
      occupiedOwnershipBoundary: 'bar/',
    };
    const { deps, registerManifest, registerContent } = makeDeps({
      readProvenanceRecordsFn: vi.fn(async () => [provenanceRecord]),
    });
    registerManifest('github:acme/bar@v1.0.0', makeManifest('bar', '1.0.0'));
    registerContent('bar', [{ path: 'bar/src/Bar.tsx', content: 'hello bar' }]);
    await run(['install', 'github:acme/bar@v1.0.0'], deps);

    // Re-adding the same already-applied template re-claims its own ground.
    const outcome = await run(['add', 'bar', '/tmp/existing-repo'], deps);

    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    expect(outcome.stderr).toContain('bar/');
    expect(outcome.stderr).toContain('bar');
  });
});

describe('dispatch: upgrade (cpt-frontx-flow-upgrade-changeset-review-approval)', () => {
  const provenance: ProvenanceRecord = {
    templateIdentity: 'foo',
    scaffoldedFromVersion: '1.0.0',
    sourceSpec: 'github:acme/foo@v1.0.0',
  };

  it('exits success and emits the change set as JSON when auto-approved via --yes', async () => {
    const fetchFn: FetchFn = vi.fn(async (url: string) => {
      const match = /\/tarball\/(.+)$/.exec(url);
      const version = match ? match[1] : url.slice(url.lastIndexOf('@') + 1);
      return JSON.stringify(makeManifest('foo', version));
    });
    const { deps } = makeDeps({
      fetchFn,
      readSingleProvenanceFn: vi.fn(async () => provenance),
      // The provenance file on disk is always the full SET (ADR-0019) — one
      // record per applied template, even when there is only one — never
      // the bare record `readSingleProvenanceFn` bridges it down to.
      readProjectFile: vi.fn(async (p: string) =>
        p === '/proj/.frontx/provenance.json' ? JSON.stringify([provenance]) : null,
      ),
    });

    const outcome = await run(['upgrade', '/proj', '2.0.0', '--yes'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(outcome.stdout).toBeDefined();
    expect(JSON.parse(outcome.stdout as string).targetVersion).toBe('2.0.0');
    expect(deps.presentAndGetApproval).not.toHaveBeenCalled();
  });

  it('exits success (declined) without approval when not auto-approved', async () => {
    const fetchFn: FetchFn = vi.fn(async (url: string) => {
      const match = /\/tarball\/(.+)$/.exec(url);
      const version = match ? match[1] : url.slice(url.lastIndexOf('@') + 1);
      return JSON.stringify(makeManifest('foo', version));
    });
    const { deps } = makeDeps({
      fetchFn,
      readSingleProvenanceFn: vi.fn(async () => provenance),
      presentAndGetApproval: vi.fn(async (): Promise<'approved' | 'declined'> => 'declined'),
    });

    const outcome = await run(['upgrade', '/proj', '2.0.0'], deps);
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect(deps.presentAndGetApproval).toHaveBeenCalledTimes(1);
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
  });

  it('exits user-error when the baseline cannot be resolved', async () => {
    const { deps } = makeDeps({ readSingleProvenanceFn: vi.fn(async () => null) });
    const outcome = await run(['upgrade', '/proj', '2.0.0'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });

  it('exits internal-error when applying the approved change set fails unexpectedly', async () => {
    const fetchFn: FetchFn = vi.fn(async (url: string) => {
      const match = /\/tarball\/(.+)$/.exec(url);
      const version = match ? match[1] : url.slice(url.lastIndexOf('@') + 1);
      return JSON.stringify(makeManifest('foo', version));
    });
    // Content differs between the baseline (1.0.0) and target (2.0.0)
    // versions so the diff produces a non-empty clean change (a whole-file
    // 'modify'), which the apply step must actually write — the write is
    // what is forced to throw below.
    const readContentItems: ReadContentItemsFn = vi.fn(async (entry) => [
      { path: 'foo/App.tsx', content: `content @ ${entry.ref}` },
    ]);
    const { deps } = makeDeps({
      fetchFn,
      readContentFn: readContentItems,
      readSingleProvenanceFn: vi.fn(async () => provenance),
      readProjectFile: vi.fn(async () => 'content @ 1.0.0'),
      writeProjectFile: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });

    const outcome = await run(['upgrade', '/proj', '2.0.0', '--yes'], deps);
    expect(outcome.exitCode).toBe(EXIT_INTERNAL_ERROR);
  });

  it('exits user-error when required arguments are missing', async () => {
    const { deps } = makeDeps();
    const outcome = await run(['upgrade', '/proj'], deps);
    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
  });
});
