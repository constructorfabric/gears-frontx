// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
//
// Human ruling (2026-11-06, review r17): an upgrade SKIPS and REPORTS the
// operations that would remove or replace an old file in ground a template
// relinquished, keeps the bytes, and advances the recorded version anyway,
// accepting that a later upgrade may conflict. This suite drives the BUILT
// `frontx` executable (the only dispatch path) end to end, from `register`
// through `apply` and `delete` to `upgrade`, so the visible semantics are
// pinned as a user meets them and not as a hand-written state:
//
//   - the `--json` preview (no `--yes`) lists the skips and writes nothing;
//   - `--json --yes` keeps the old files, reports `RETAINED_GROUND` and
//     records the new origin/version with the old one as `previous`;
//   - repeating the same upgrade is a `noop`;
//   - a LATER upgrade is judged against the version the skipped upgrade
//     recorded, so a file left at an older version surfaces as
//     `CONTENT_CONFLICT` (the disclosed cost);
//   - `upgrade --restore` is the way back, after which the same upgrade is
//     offered again with the same skips;
//   - an upgrade with no retained ground is not held back.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withReviewedDigest } from './support/confirm-upgrade';

const packageRoot = path.resolve(__dirname, '..', '..');
let buildDir: string;
let sandbox: string | undefined;

beforeAll(async () => {
  buildDir = await mkdtemp(path.join(tmpdir(), 'frontx-cli-build-'));
  execFileSync(
    'npx',
    ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'],
    { cwd: packageRoot, stdio: 'pipe' },
  );
}, 120_000);

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
});

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

type Plan = {
  from: { origin: string; version: string };
  to: { origin: string; version: string };
  operations: { op: string }[];
  skipped: { target: string; path: string; reason: string }[];
};
// Both halves are typed as present: a test reads the half its `ok` implies and
// an absent one fails the assertion on it, which is the failure wanted.
type Envelope = {
  ok: boolean;
  data: { outcome: string; plan: Plan; at?: { origin: string; version: string } };
  error: { code: string; message: string; details: { plan: Plan; conflicts?: unknown } };
};

function cli(project: string, ...args: string[]): { status: number | null; envelope: Envelope } {
  return withReviewedDigest(args, (a) => cliOnce(project, ...a));
}

function cliOnce(project: string, ...args: string[]): { status: number | null; envelope: Envelope } {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
    cwd: project,
    encoding: 'utf-8',
    timeout: 60_000,
  });
  return { status: result.status, envelope: JSON.parse(result.stdout) as Envelope };
}

/** Human mode: no `--json`, so the plan is shown and approved on stdin. */
function human(project: string, answer: string, ...args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args], {
    cwd: project,
    encoding: 'utf-8',
    input: answer,
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout };
}

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

const read = (project: string, relative: string) => readFile(path.join(project, relative), 'utf-8').catch(() => undefined);
const entry = async (project: string, name: string) =>
  (JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as { templates: Record<string, unknown> }).templates[name];

/**
 * Host `@x/b` (v1 ships `sub/b2.txt`, v2 excludes `sub/`) is applied at `real`,
 * upgraded so it relinquishes `real/sub`, then deleted, which preserves
 * `real/sub/b2.txt`. Guest `@x/g` v1 is then applied INTO that ground.
 */
async function lifecycleProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-retained-'));
  const project = sandbox;
  await template(project, 'hb1', '@x/b', '1.0.0', [], { 'b.txt': 'B', 'sub/b2.txt': 'OLD' });
  await template(project, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B' });
  await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1', 'b2.txt': 'OLD' });
  await template(project, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
  await template(project, 'g3', '@x/g', '3.0.0', [], { 'g.txt': 'G3' });
  expect(cli(project, 'register', 'path:hb1').envelope.ok).toBe(true);
  expect(cli(project, 'register', 'path:g1').envelope.ok).toBe(true);
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/b': ['real'] } })).envelope.ok).toBe(true);
  expect(cli(project, 'upgrade', '@x/b', 'path:hb2', '--yes').envelope.ok).toBe(true);
  expect(confirmDelete(cli, project, 'real').envelope.ok).toBe(true);
  expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/g': ['real/sub'] } })).envelope.ok).toBe(true);
  expect(await read(project, 'real/sub/g.txt')).toBe('G1');
  return project;
}

const retained = [
  { target: 'real/sub', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' },
  { target: 'real/sub', path: 'real/sub/g.txt', reason: 'RETAINED_GROUND' },
];

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

describe('upgrade skip-and-report in relinquished ground (built CLI, real lifecycle)', () => {
  it('previews the skips without writing, then --yes keeps the files and records the new version', async () => {
    const project = await lifecycleProject();

    const preview = cli(project, 'upgrade', '@x/g', 'path:g2');
    expect(preview.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
    expect(preview.envelope.error.details.plan).toMatchObject({ operations: [], skipped: retained });
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g1', version: '1.0.0' });
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');

    const applied = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(applied.status).toBe(0);
    expect(applied.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(applied.envelope.data.plan).toMatchObject({ operations: [], skipped: retained });
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await entry(project, '@x/g')).toMatchObject({
      origin: 'path:g2',
      version: '2.0.0',
      previous: { origin: 'path:g1', version: '1.0.0' },
    });
  });

  it('machine-readable: stable skip records, explicit outcome and recorded version, no bypass advice', async () => {
    const project = await lifecycleProject();
    const preview = cli(project, 'upgrade', '@x/g', 'path:g2');
    const applied = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    for (const envelope of [preview.envelope, applied.envelope]) {
      const plan = envelope.ok ? envelope.data.plan : envelope.error.details.plan;
      // The agent decides from these fields alone: every skip names its
      // target, its path and one stable reason code, and nothing else.
      expect(plan.skipped).toEqual(retained);
      for (const skip of plan.skipped) expect(Object.keys(skip).sort()).toEqual(['path', 'reason', 'target']);
      expect(plan.to).toEqual({ origin: 'path:g2', version: '2.0.0' });
      expect(plan.from).toEqual({ origin: 'path:g1', version: '1.0.0' });
      expect(JSON.stringify(envelope)).not.toMatch(/overwrite|--force|bypass|rm -|delete the file/i);
    }
    expect(applied.envelope.data.outcome).toBe('success');
    // The confirmation gate names the way forward without inviting a bypass.
    expect(preview.envelope.error.message).toContain('--yes');
  });

  it('human-readable: the plan speaks in the conditional before approval, the result in the past after it', async () => {
    const project = await lifecycleProject();
    const run = human(project, 'y\n', 'upgrade', '@x/g', 'path:g2');
    expect(run.status).toBe(0);
    const planAt = run.stdout.indexOf('If approved, 2 file(s)');
    const resultAt = run.stdout.indexOf('Upgraded "@x/g" to "path:g2" (version 2.0.0).');
    expect(run.stdout).toContain('SKIPPED    real/sub/b2.txt (RETAINED_GROUND)');
    expect(run.stdout).toContain('SKIPPED    real/sub/g.txt (RETAINED_GROUND)');
    expect(planAt).toBeGreaterThanOrEqual(0);
    expect(resultAt).toBeGreaterThan(planAt);
    // Before approval: conditional, and declining is stated to write nothing.
    const beforeApproval = run.stdout.slice(0, resultAt);
    expect(beforeApproval).toContain('will be left exactly as they are');
    expect(beforeApproval).toContain('the recorded version will become 2.0.0');
    expect(beforeApproval).toContain('Declining writes nothing.');
    expect(beforeApproval).not.toContain('were left');
    // After the commit: past tense, and the conflict is a possibility, not a promise.
    const afterCommit = run.stdout.slice(resultAt);
    expect(afterCommit).toContain('were left exactly as they are');
    expect(afterCommit).toContain('the recorded version is 2.0.0 all the same');
    expect(afterCommit).toContain('may report them as conflicts if they differ from both');
    expect(run.stdout).not.toMatch(/overwrite|--force|bypass/i);
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await entry(project, '@x/g')).toMatchObject({ version: '2.0.0' });
  });

  it('human-readable: declining keeps the version and the files, and never claims either changed', async () => {
    const project = await lifecycleProject();
    const run = human(project, 'n\n', 'upgrade', '@x/g', 'path:g2');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('If approved, 2 file(s)');
    expect(run.stdout).toContain('Declining writes nothing.');
    expect(run.stdout).toContain('Upgrade of "@x/g" declined; nothing was written.');
    expect(run.stdout).not.toContain('were left');
    expect(run.stdout).not.toContain('all the same, so');
    expect(run.stdout).not.toContain('Upgraded "@x/g"');
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g1', version: '1.0.0' });
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
  });

  it('human-readable: an upgrade that skips nothing carries no retained-ground note', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-plain-'));
    const project = sandbox;
    await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1' });
    await template(project, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
    expect(cli(project, 'register', 'path:g1').envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/g': ['app'] } })).envelope.ok).toBe(true);
    const run = human(project, 'y\n', 'upgrade', '@x/g', 'path:g2');
    expect(run.stdout).toContain('Upgraded "@x/g" to "path:g2" (version 2.0.0).');
    expect(run.stdout).not.toContain('RETAINED_GROUND');
  });

  it('repeating the same upgrade is a noop and nothing is retried', async () => {
    const project = await lifecycleProject();
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);
    const again = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(again.envelope).toMatchObject({ ok: true, data: { outcome: 'noop', at: { origin: 'path:g2', version: '2.0.0' } } });
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
  });

  it('a later upgrade is judged against the recorded version: a held-back file that differs from both is a CONTENT_CONFLICT and stays', async () => {
    const project = await lifecycleProject();
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);

    const later = cli(project, 'upgrade', '@x/g', 'path:g3', '--yes');
    expect(later.status).not.toBe(0);
    expect(later.envelope).toMatchObject({
      ok: false,
      error: { code: 'CONTENT_CONFLICT', details: { conflicts: [{ target: 'real/sub', path: 'real/sub/g.txt' }] } },
    });
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    // The refused upgrade recorded nothing.
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g2', version: '2.0.0' });
  });

  it('a later upgrade is NOT a conflict when the held-back file already equals the next version', async () => {
    const project = await lifecycleProject();
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);
    // g4 ships exactly the bytes the held-back file still has (`G1`).
    await template(project, 'g4', '@x/g', '4.0.0', [], { 'g.txt': 'G1' });

    const later = cli(project, 'upgrade', '@x/g', 'path:g4', '--yes');
    expect(later.status).toBe(0);
    expect(later.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(later.envelope.data.plan.operations).toEqual(
      expect.arrayContaining([{ target: 'real/sub', path: 'real/sub/g.txt', op: 'UNCHANGED' }]),
    );
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g4', version: '4.0.0' });
  });

  it('a later upgrade is KEEP_LOCAL, not a conflict, when the recorded and next payloads are equal', async () => {
    const project = await lifecycleProject();
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);
    // g5 ships the same bytes as the recorded version (`G2`), while the held-back file still holds `G1`.
    await template(project, 'g5', '@x/g', '5.0.0', [], { 'g.txt': 'G2' });

    const later = cli(project, 'upgrade', '@x/g', 'path:g5', '--yes');
    expect(later.status).toBe(0);
    expect(later.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(later.envelope.data.plan.operations).toEqual([{ target: 'real/sub', path: 'real/sub/g.txt', op: 'KEEP_LOCAL' }]);
    expect(later.envelope.data.plan.skipped).toEqual([]);
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g5', version: '5.0.0' });
  });

  it('the noop envelope has no plan: a caller must branch on the outcome and cannot recover earlier skips', async () => {
    const project = await lifecycleProject();
    const first = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(first.envelope.data.plan.skipped).toEqual(retained);
    const again = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(again.envelope.data.outcome).toBe('noop');
    expect(again.envelope.data.at).toEqual({ origin: 'path:g2', version: '2.0.0' });
    expect(again.envelope.data).not.toHaveProperty('plan');
  });

  it('upgrade --restore (all-skipped fixture): returns to the preceding version, and here the same upgrade is offered again with the same skips', async () => {
    const project = await lifecycleProject();
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);

    const restored = cli(project, 'upgrade', '@x/g', '--restore', '--yes');
    expect(restored.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(restored.envelope.data.plan.operations.every((o: { op: string }) => o.op === 'UNCHANGED')).toBe(true);
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g1', version: '1.0.0', previous: { origin: 'path:g2', version: '2.0.0' } });

    const again = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(again.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(again.envelope.data.plan).toMatchObject({ operations: [], skipped: retained });
    expect(await read(project, 'real/sub/g.txt')).toBe('G1');
  });

  it('upgrade --restore with mixed changes: it is a full upgrade to the previous origin, so it can change current files and skip others', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-restore-mixed-'));
    const project = sandbox;
    await template(project, 'hb1', '@x/b', '1.0.0', [], { 'b.txt': 'B1', 'sub/b2.txt': 'OLD' });
    await template(project, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B2', 'sub/b2.txt': 'OLD' });
    await template(project, 'hb3', '@x/b', '3.0.0', [], { 'b.txt': 'B3', 'sub/b2.txt': 'NEW', 'sub/added.txt': 'ADDED' });
    expect(cli(project, 'register', 'path:hb1').envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/b': ['real'] } })).envelope.ok).toBe(true);
    expect(cli(project, 'upgrade', '@x/b', 'path:hb2', '--yes').envelope.ok).toBe(true);
    const forward = cli(project, 'upgrade', '@x/b', 'path:hb3', '--yes');
    // Forward: one file is changed, the old file in relinquished ground is held back.
    expect(forward.envelope.data.plan.operations).toEqual(
      expect.arrayContaining([{ target: 'real', path: 'real/b.txt', op: 'REPLACE' }]),
    );
    expect(forward.envelope.data.plan.skipped).toEqual(
      expect.arrayContaining([{ target: 'real', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' }]),
    );
    expect(await read(project, 'real/b.txt')).toBe('B3');

    // Restore previews first: the plan names what it WOULD change, so a caller can decide.
    const preview = cli(project, 'upgrade', '@x/b', '--restore');
    expect(preview.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
    expect(preview.envelope.error.details.plan.operations).toEqual(
      expect.arrayContaining([{ target: 'real', path: 'real/b.txt', op: 'REPLACE' }]),
    );
    expect(await read(project, 'real/b.txt')).toBe('B3');

    const restored = cli(project, 'upgrade', '@x/b', '--restore', '--yes');
    expect(restored.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    // Restore CHANGED a current file ...
    expect(restored.envelope.data.plan.operations).toEqual(
      expect.arrayContaining([{ target: 'real', path: 'real/b.txt', op: 'REPLACE' }]),
    );
    expect(await read(project, 'real/b.txt')).toBe('B2');
    // ... and skipped the ground the restored version leaves outside its boundary.
    expect(restored.envelope.data.plan.skipped).toEqual(
      expect.arrayContaining([
        { target: 'real', path: 'real/sub/b2.txt', reason: 'OUTSIDE_BOUNDARY' },
        { target: 'real', path: 'real/sub/added.txt', reason: 'OUTSIDE_BOUNDARY' },
      ]),
    );
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    expect(await read(project, 'real/sub/added.txt')).toBe('ADDED');
    expect(await entry(project, '@x/b')).toMatchObject({ origin: 'path:hb2', version: '2.0.0' });
  });

  it("host reclaim: the host's own upgrade keeps the old file it once shipped and reports it", async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-reclaim-'));
    const project = sandbox;
    await template(project, 'hb1', '@x/b', '1.0.0', [], { 'b.txt': 'B', 'sub/b2.txt': 'OLD' });
    await template(project, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B', 'sub/b2.txt': 'OLD' });
    await template(project, 'hb3', '@x/b', '3.0.0', [], { 'b.txt': 'B', 'sub/b2.txt': 'NEW', 'sub/added.txt': 'ADDED' });
    expect(cli(project, 'register', 'path:hb1').envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/b': ['real'] } })).envelope.ok).toBe(true);
    expect(cli(project, 'upgrade', '@x/b', 'path:hb2', '--yes').envelope.ok).toBe(true);

    const reclaim = cli(project, 'upgrade', '@x/b', 'path:hb3', '--yes');
    expect(reclaim.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(reclaim.envelope.data.plan.skipped).toEqual(
      expect.arrayContaining([{ target: 'real', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' }]),
    );
    expect(await read(project, 'real/sub/b2.txt')).toBe('OLD');
    // What is not an old file is still delivered.
    expect(await read(project, 'real/sub/added.txt')).toBe('ADDED');
    expect(await entry(project, '@x/b')).toMatchObject({ origin: 'path:hb3', version: '3.0.0' });
  });

  it('control: an upgrade with no relinquished ground removes and replaces as before', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-control-'));
    const project = sandbox;
    await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1', 'old.txt': 'OLD' });
    await template(project, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
    expect(cli(project, 'register', 'path:g1').envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/g': ['app'] } })).envelope.ok).toBe(true);

    const upgraded = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(upgraded.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    expect(upgraded.envelope.data.plan.skipped).toEqual([]);
    expect(await read(project, 'app/g.txt')).toBe('G2');
    expect(await read(project, 'app/old.txt')).toBeUndefined();
  });
});
