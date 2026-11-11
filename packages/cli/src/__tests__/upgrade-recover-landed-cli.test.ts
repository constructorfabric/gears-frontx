// @cpt-algo:cpt-frontx-algo-upgrade-changeset-recover:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1
//
// Independent review r1 on d1e18073, HIGH: an upgrade whose files had landed
// but whose state write failed (or whose process died before it) left the
// project in a dead end — `--recover` refused, every writer answered
// RECOVERY_REQUIRED, and the convergence the ADR and QUICK_START promise was
// unreachable through the CLI. The receipt now records, per footprint path,
// the content the approved plan lands there, so `--recover` can tell the
// plan's own partial result from a foreign change:
//
//   - every changed path holds exactly the approved content → `released`,
//     the files stay, the identical re-run converges and commits;
//   - any changed path holds something else → RECOVERY_REQUIRED naming it,
//     nothing released, nothing rolled back; fixed by hand, `--recover` again;
//   - a receipt without the recorded `after` hashes proves nothing → refused.
//
// Drives the BUILT executable against a real project with a real mutation
// scope: the state write is made to fail by taking write permission off
// `.frontx` while its `operations/` subdirectory (receipts) stays writable.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..', '..');
let buildDir: string;
let sandbox: string | undefined;

beforeAll(async () => {
  buildDir = await mkdtemp(path.join(tmpdir(), 'frontx-cli-build-'));
  execFileSync('npx', ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'], { cwd: packageRoot, stdio: 'pipe' });
}, 120_000);

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
});

afterEach(async () => {
  if (sandbox !== undefined) {
    await chmod(path.join(sandbox, 'project', '.frontx'), 0o755).catch(() => undefined);
    await rm(sandbox, { recursive: true, force: true });
  }
  sandbox = undefined;
});

type Envelope = { ok: boolean; data: Record<string, unknown>; error: { code: string; message: string; details: Record<string, unknown> } };

function cli(project: string, ...args: string[]): { status: number | null; envelope: Envelope } {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
    cwd: project,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...process.env, FRONTX_INVENTORY_ROOT: path.join(path.dirname(project), 'inventory') },
  });
  return { status: result.status, envelope: JSON.parse(result.stdout) as Envelope };
}

/** The two-call upgrade protocol: review, then confirm with the reviewed digest. */
function confirmedUpgrade(project: string, ...args: string[]) {
  const review = cli(project, 'upgrade', ...args);
  if (review.envelope.error?.code !== 'CONFIRMATION_REQUIRED') return review;
  return cli(project, 'upgrade', ...args, '--yes', `--plan-digest=${String(review.envelope.error.details.planDigest)}`);
}

async function template(project: string, folder: string, version: string, files: Record<string, string>) {
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project, folder, relative)), { recursive: true });
    await writeFile(path.join(project, folder, relative), content, 'utf-8');
  }
  await writeFile(path.join(project, folder, 'frontx-template.json'), JSON.stringify({ name: '@x/t', version, excludedSubtrees: [], description: 'fixture' }));
}

const read = (project: string, relative: string) => readFile(path.join(project, relative), 'utf-8').catch(() => undefined);
const entry = async (project: string) =>
  (JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as { templates: Record<string, unknown> }).templates['@x/t'];
const receipts = async (project: string) => (await readdir(path.join(project, '.frontx', 'operations')).catch(() => [])).filter((f) => f.endsWith('.json'));

/** v1 applied at `app`; the v1→v2 plan is REPLACE a.txt, ADD n.txt, REMOVE gone.txt. */
async function landedButUncommitted(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-recover-'));
  const project = path.join(sandbox, 'project');
  await mkdir(project);
  await template(project, 't1', '1.0.0', { 'a.txt': 'A1', 'gone.txt': 'G' });
  await template(project, 't2', '2.0.0', { 'a.txt': 'A2', 'n.txt': 'N' });
  expect(cli(project, 'register', 'path:t1').envelope.ok).toBe(true);
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/t': ['app'] } })).envelope.ok).toBe(true);
  // Receipts need a writable home while `.frontx` itself refuses the store's temp file.
  await mkdir(path.join(project, '.frontx', 'operations'), { recursive: true });
  await chmod(path.join(project, '.frontx'), 0o555);
  const failed = confirmedUpgrade(project, '@x/t', 'path:t2');
  await chmod(path.join(project, '.frontx'), 0o755);
  expect(failed.status).toBe(1);
  expect(failed.envelope).toMatchObject({
    ok: false,
    error: { code: 'RECOVERY_REQUIRED', details: { cause: 'INTERNAL', transitionCommitted: false, changedPaths: ['app/a.txt', 'app/gone.txt', 'app/n.txt'] } },
  });
  expect(await read(project, 'app/a.txt')).toBe('A2');
  expect(await read(project, 'app/n.txt')).toBe('N');
  expect(await read(project, 'app/gone.txt')).toBeUndefined();
  expect(await entry(project)).toMatchObject({ origin: 'path:t1', version: '1.0.0' });
  expect(await receipts(project)).toHaveLength(1);
  // Every writer is guarded until the operation is recovered.
  expect(cli(project, 'ownership', 'add', 'other').envelope).toMatchObject({ ok: false, error: { code: 'RECOVERY_REQUIRED' } });
  return project;
}

describe.skipIf(process.getuid?.() === 0)('upgrade --recover after a failed state write with landed files (built CLI, real scope)', () => {
  it('releases a partial result that is exactly the approved plan, and the identical re-run converges', async () => {
    const project = await landedButUncommitted();

    const recovered = cli(project, 'upgrade', '@x/t', '--recover');
    expect(recovered.status).toBe(0);
    expect(recovered.envelope).toEqual({ ok: true, data: { outcome: 'released', name: '@x/t', landedPaths: ['app/a.txt', 'app/gone.txt', 'app/n.txt'] } });
    expect(await receipts(project)).toHaveLength(0);
    expect(await read(project, 'app/a.txt')).toBe('A2');
    expect(await entry(project)).toMatchObject({ origin: 'path:t1', version: '1.0.0' });

    const rerun = confirmedUpgrade(project, '@x/t', 'path:t2');
    expect(rerun.status).toBe(0);
    expect(rerun.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
    // Nothing left to write: every landed path classifies UNCHANGED (`inst-cls-if-unchanged`).
    expect((rerun.envelope.data.plan as { operations: { op: string }[] }).operations.map((o) => o.op)).toEqual(['UNCHANGED', 'UNCHANGED', 'UNCHANGED']);
    expect(await entry(project)).toMatchObject({ origin: 'path:t2', version: '2.0.0', previous: { origin: 'path:t1', version: '1.0.0' } });
    expect(await read(project, 'app/a.txt')).toBe('A2');
    expect(await read(project, 'app/n.txt')).toBe('N');
    expect(await receipts(project)).toHaveLength(0);
  });

  it('refuses while a landed path holds content the plan did not write, naming it, and releases once it is returned', async () => {
    const project = await landedButUncommitted();
    await writeFile(path.join(project, 'app', 'a.txt'), 'someone else', 'utf-8');

    const refused = cli(project, 'upgrade', '@x/t', '--recover');
    expect(refused.status).toBe(1);
    expect(refused.envelope).toMatchObject({
      ok: false,
      error: {
        code: 'RECOVERY_REQUIRED',
        message: expect.stringContaining('app/a.txt'),
        details: { transitionCommitted: false, changedPaths: ['app/a.txt', 'app/gone.txt', 'app/n.txt'], foreignPaths: ['app/a.txt'] },
      },
    });
    expect(await receipts(project)).toHaveLength(1);
    expect(await read(project, 'app/a.txt')).toBe('someone else');
    expect(cli(project, 'ownership', 'add', 'other').envelope).toMatchObject({ ok: false, error: { code: 'RECOVERY_REQUIRED' } });

    // Returned to the pre-upgrade content: still the plan's own result for the rest, so released.
    await writeFile(path.join(project, 'app', 'a.txt'), 'A1', 'utf-8');
    expect(cli(project, 'upgrade', '@x/t', '--recover').envelope).toMatchObject({ ok: true, data: { outcome: 'released', landedPaths: ['app/gone.txt', 'app/n.txt'] } });
    expect(await receipts(project)).toHaveLength(0);
  });

  it('a receipt without the recorded landed content proves nothing and stays refused', async () => {
    const project = await landedButUncommitted();
    const [file] = await receipts(project);
    const receiptPath = path.join(project, '.frontx', 'operations', file!);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf-8')) as { intent: { footprint: { after?: unknown }[] } };
    for (const f of receipt.intent.footprint) delete f.after;
    await writeFile(receiptPath, JSON.stringify(receipt), 'utf-8');

    const refused = cli(project, 'upgrade', '@x/t', '--recover');
    expect(refused.envelope).toMatchObject({ ok: false, error: { code: 'RECOVERY_REQUIRED', details: { foreignPaths: ['app/a.txt', 'app/gone.txt', 'app/n.txt'] } } });
    expect(await receipts(project)).toHaveLength(1);
  });
});
