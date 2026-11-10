// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1
//
// Supported boundary: no released CLI wrote `.frontx/project.json`, so only a
// document written by this build is supported. Another build run on the same
// project, and a state an intermediate build of this branch left behind, are
// outside it; the stamp below is hardening for the first and a refusal of a
// version-1 document carrying a field is the answer to the second (nothing is
// migrated, and no concurrent or interrupted operation is covered).
//
// Downgrade boundary (review R25-1). `relinquishedGround`,
// `provenExcludedSubtrees` and `exclusionsBackfilled` are fields a build that
// predates them ignores and DROPS on its next rewrite, and its `delete` plan
// does not know the protection they record. Optional-and-additive alone is
// therefore no safe downgrade; the one guard exercised here is a reader that
// accepts only `formatVersion` 1 and rejects a version-2 document when it
// reads it (no ordering of side effects is claimed). So the document is
// stamped `2` exactly when an entry carries one of those fields, and `1`
// otherwise, derived on every write. A document carrying `pendingPostCommit`
// is stamped `3` and never lowered; this build reads `1`, `2` and `3`.
//
// "The previous generation" is built here from THIS source with its one
// difference put back: the accepted `formatVersion` set is `{1}` again
// (`parsed.formatVersion !== 1`). This is a test of that guard on the current
// code, not a historical release: it does not show that every earlier build
// or every command (apply/register/unregister/ownership, concurrent or
// interrupted runs) refuses before a side effect.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withReviewedDigest } from './support/confirm-upgrade';

const packageRoot = path.resolve(__dirname, '..', '..');
let currentBuild: string;
let previousBuild: string;
let previousSource: string;
let sandbox: string | undefined;

const CURRENT_GUARD = 'if (parsed.formatVersion !== 1 && parsed.formatVersion !== 2 && parsed.formatVersion !== 3) {';

function build(entry: string, outDir: string): void {
  execFileSync('npx', ['tsup', '--no-config', entry, '--format', 'esm', '--out-dir', outDir, '--silent'], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
}

beforeAll(async () => {
  currentBuild = await mkdtemp(path.join(tmpdir(), 'frontx-cli-current-'));
  build('src/cli.ts', currentBuild);

  previousSource = await mkdtemp(path.join(tmpdir(), 'frontx-cli-previous-src-'));
  previousBuild = await mkdtemp(path.join(tmpdir(), 'frontx-cli-previous-'));
  await cp(path.join(packageRoot, 'src'), path.join(previousSource, 'src'), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}__tests__`),
  });
  const ioFile = path.join(previousSource, 'src', 'project-state', 'io.ts');
  const source = await readFile(ioFile, 'utf-8');
  // Fails loudly if the guard is reworded, rather than silently building a
  // "previous" CLI that is the current one.
  expect(source).toContain(CURRENT_GUARD);
  await writeFile(ioFile, source.replace(CURRENT_GUARD, 'if (parsed.formatVersion !== 1) {'), 'utf-8');
  build(path.join(previousSource, 'src', 'cli.ts'), previousBuild);
}, 180_000);

afterAll(async () => {
  for (const dir of [currentBuild, previousBuild, previousSource]) await rm(dir, { recursive: true, force: true });
});

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

type Envelope = { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };

function run(build: string, project: string, ...args: string[]): { status: number | null; envelope: Envelope } {
  const result = spawnSync(process.execPath, [path.join(build, 'cli.js'), ...args, '--json'], {
    cwd: project,
    encoding: 'utf-8',
    timeout: 60_000,
  });
  return { status: result.status, envelope: JSON.parse(result.stdout) as Envelope };
}
const cli = (project: string, ...args: string[]) => withReviewedDigest(args, (a) => run(currentBuild, project, ...a));
const previous = (project: string, ...args: string[]) => run(previousBuild, project, ...args);

async function template(project: string, folder: string, name: string, version: string, excluded: string[], files: Record<string, string>) {
  await mkdir(path.join(project, folder), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project, folder, relative)), { recursive: true });
    await writeFile(path.join(project, folder, relative), content, 'utf-8');
  }
  await writeFile(
    path.join(project, folder, 'frontx-template.json'),
    JSON.stringify({ name, version, excludedSubtrees: excluded, description: 'fixture' }),
    'utf-8',
  );
}

const statePath = (project: string) => path.join(project, '.frontx', 'project.json');
const stateText = (project: string) => readFile(statePath(project), 'utf-8');
const stateDoc = async (project: string) =>
  JSON.parse(await stateText(project)) as { formatVersion: number; templates: Record<string, Record<string, unknown>> };
const read = (project: string, relative: string) => readFile(path.join(project, relative), 'utf-8').catch(() => undefined);

/**
 * Host `@x/b` v1 ships `sub/b2.txt`; v2 excludes `sub/`. Applied at `real`,
 * upgraded (relinquishing `real/sub`), deleted (preserving `real/sub/b2.txt`),
 * then guest `@x/g` is applied INTO that ground. The state now records the
 * host's `relinquishedGround`: the protection a previous generation lacks.
 */
async function protectedProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-boundary-'));
  const project = sandbox;
  await template(project, 'hb1', '@x/b', '1.0.0', [], { 'b.txt': 'B', 'sub/b2.txt': 'OLD' });
  await template(project, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B' });
  await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1' });
  expect(cli(project, 'register', 'path:hb1').envelope.ok).toBe(true);
  expect(cli(project, 'register', 'path:g1').envelope.ok).toBe(true);
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/b': ['real'] } })).envelope.ok).toBe(true);
  expect(cli(project, 'upgrade', '@x/b', 'path:hb2', '--yes').envelope.ok).toBe(true);
  expect(confirmDelete(cli, project, 'real').envelope.ok).toBe(true);
  expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/g': ['real/sub'] } }), '--adopt-existing').envelope.ok).toBe(true);
  return project;
}

/** The two-call delete protocol: a review (writes nothing), then the confirming call stating its `planDigest`. */
function confirmDelete<R extends { envelope: { error?: { code?: string; message?: string; details?: unknown } } }>(
  run: (project: string, ...args: string[]) => R,
  project: string,
  target: string,
): R {
  const review = run(project, 'delete', target);
  // A review that is itself refused is that refusal: there is no plan to confirm.
  if (review.envelope.error?.code !== 'CONFIRMATION_REQUIRED') return review;
  return run(project, 'delete', target, '--yes', `--plan-digest=${String((review.envelope.error?.details as { planDigest?: unknown } | undefined)?.planDigest)}`);
}

describe('formatVersion boundary around the downgrade-sensitive entry fields (built CLI)', () => {
  it('a project that records no protection stays formatVersion 1 and a previous build still operates on it', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-plain-'));
    const project = sandbox;
    await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1' });
    expect(cli(project, 'register', 'path:g1').envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/g': ['app'] } })).envelope.ok).toBe(true);
    expect((await stateDoc(project)).formatVersion).toBe(1);

    const deleted = confirmDelete(previous, project, 'app');
    expect(deleted.envelope.ok).toBe(true);
    expect(await read(project, 'app/g.txt')).toBeUndefined();
  });

  it('a state that records relinquished ground is stamped above 1, and a previous build refuses it before writing anything', async () => {
    const project = await protectedProject();
    const doc = await stateDoc(project);
    expect(doc.templates['@x/b']).toHaveProperty('relinquishedGround');
    // 3, not 2: the upgrade that relinquished the ground wrote pendingPostCommit, and a
    // document once stamped 3 is never lowered (composed-provenance FEATURE, pendingPostCommit).
    expect(doc.formatVersion).toBe(3);

    const before = await stateText(project);
    // The R25-1 command: the guest's delete, which the V2 ruling says must keep
    // `real/sub/b2.txt`. A previous build reads the document as unusable and
    // plans nothing.
    for (const args of [['delete', 'real/sub', '--yes'], ['delete', 'real/sub'], ['upgrade', '@x/g', 'path:g1', '--yes'], ['list']]) {
      const refused = previous(project, ...args);
      expect(refused.envelope.ok).toBe(false);
      expect(refused.status).not.toBe(0);
      expect(refused.envelope.error?.code).toBe('PROJECT_INVALID');
      expect(refused.envelope.error?.message).toContain('formatVersion');
    }
    expect(await stateText(project)).toBe(before);
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');

    // The current build, on the same document, keeps the old file (and, by the
    // same conservatism, the guest's own files beneath the retained ground).
    expect(confirmDelete(cli, project, 'real/sub').envelope.ok).toBe(true);
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
  });

  it('refuses a version-1 document that carries a protection field (an unsupported intermediate build wrote it) and changes nothing', async () => {
    const project = await protectedProject();
    const doc = await stateDoc(project);
    doc.formatVersion = 1; // a state this build never writes: it stamps 2 whenever the field is present
    const text = JSON.stringify(doc, null, 2);
    await writeFile(statePath(project), text, 'utf-8');

    const refused = confirmDelete(cli, project, 'real/sub');
    expect(refused.envelope.ok).toBe(false);
    expect(refused.envelope.error?.code).toBe('PROJECT_INVALID');
    expect(refused.envelope.error?.message).toContain('unsupported intermediate build');
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    expect(await stateText(project)).toBe(text);
  });

  it('refuses a formatVersion it does not know, in either direction', async () => {
    const project = await protectedProject();
    const doc = await stateDoc(project);
    for (const version of [0, 4, '3']) {
      doc.formatVersion = version as number;
      await writeFile(statePath(project), JSON.stringify(doc, null, 2), 'utf-8');
      const refused = cli(project, 'list');
      expect(refused.envelope).toMatchObject({ ok: false, error: { code: 'PROJECT_INVALID' } });
      expect(refused.envelope.error?.message).toContain('formatVersion is not 1, 2 or 3');
    }
  });
});
