// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
//
// Review r23 (Q23-1): marking a host entry (`exclusionsBackfilled`) records the
// location of the exclusions in play as `relinquishedGround`, and an upgrade
// SKIPS any REPLACE/REMOVE inside that ground. An exclusion the entry recorded
// when it wrote its files and still declares was never the entry's ground, so a
// guest nested there legitimately must not be frozen because a DIFFERENT region
// was relinquished in the same upgrade. What the entry newly handed over stays
// retained (human ruling V2, 2026-11-06). Drives the BUILT executable.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { changedDeclarations } from '../project-state/retained-ground';
import { withReviewedDigest } from './support/confirm-upgrade';

const packageRoot = path.resolve(__dirname, '..', '..');
let buildDir: string;
let sandbox: string | undefined;

beforeAll(async () => {
  buildDir = await mkdtemp(path.join(tmpdir(), 'frontx-cli-build-'));
  execFileSync('npx', ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
}, 120_000);

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
});

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

type Envelope = {
  ok: boolean;
  data: {
    outcome?: string;
    plan?: { operations: { op: string; path: string }[]; skipped: { path: string; reason: string }[] };
    toDelete?: string[];
    toPreserve?: unknown[];
  };
  error: { code: string; details?: unknown };
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
  (JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as { templates: Record<string, Record<string, unknown>> }).templates[name];

/**
 * Host `@x/h` v1 excludes `plugins/` (declared at apply) and writes `extra/e.txt`;
 * guest `@x/g` v1 is applied INTO `app/plugins`. Host v2 additionally excludes
 * `extra/`, handing over the file it wrote there, so the host entry is marked.
 */
async function markedHostProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-precision-'));
  const project = sandbox;
  await template(project, 'h1', '@x/h', '1.0.0', ['plugins/'], { 'h.txt': 'H', 'extra/e.txt': 'E' });
  await template(project, 'h2', '@x/h', '2.0.0', ['plugins/', 'extra/'], { 'h.txt': 'H' });
  await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1', 'old.txt': 'O' });
  await template(project, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
  await template(project, 'k1', '@x/k', '1.0.0', [], { 'k.txt': 'K1' });
  await template(project, 'k2', '@x/k', '2.0.0', [], { 'k.txt': 'K2' });
  for (const origin of ['h1', 'g1', 'k1']) expect(cli(project, 'register', `path:${origin}`).envelope.ok).toBe(true);
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/h': ['app'], '@x/g': ['app/plugins'] } })).envelope.ok).toBe(true);
  expect(await read(project, 'app/plugins/g.txt')).toBe('G1');
  const upgraded = cli(project, 'upgrade', '@x/h', 'path:h2', '--yes');
  expect(upgraded.envelope.ok).toBe(true);
  expect(await read(project, 'app/extra/e.txt')).toBe('E');
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

describe('proven exclusions are not retained because another region was relinquished (built CLI)', () => {
  it('retains only the newly relinquished region on the marked host', async () => {
    const project = await markedHostProject();
    expect(await entry(project, '@x/h')).toMatchObject({ exclusionsBackfilled: true, relinquishedGround: ['app/extra'] });
  });

  it('upgrades the guest nested in the long-standing excluded region instead of freezing it', async () => {
    const project = await markedHostProject();
    const upgraded = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(upgraded.status).toBe(0);
    expect(upgraded.envelope.ok).toBe(true);
    expect(upgraded.envelope.data.plan?.skipped.filter((skip) => skip.reason === 'RETAINED_GROUND')).toEqual([]);
    expect(await read(project, 'app/plugins/g.txt')).toBe('G2');
    expect(await read(project, 'app/plugins/old.txt')).toBeUndefined();
    expect(await entry(project, '@x/g')).toMatchObject({ origin: 'path:g2', version: '2.0.0' });
  });

  it('deletes the guest: the marked host\'s durable evidence proves the nested region was never its ground', async () => {
    // Superseded the r23 behaviour (r24 R24-2): the host entry carries
    // `provenExcludedSubtrees`, so the other-owner ancestor exemption applies.
    const project = await markedHostProject();
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);
    const deleted = confirmDelete(cli, project, 'app/plugins');
    expect(deleted.envelope.ok).toBe(true);
    expect(deleted.envelope.data.toDelete).toContain('app/plugins/g.txt');
    expect(await read(project, 'app/plugins/g.txt')).toBeUndefined();
  });

  it('still skips and keeps a guest file inside the region the host newly relinquished (V2)', async () => {
    const project = await markedHostProject();
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/k': ['app/extra'] } }), '--adopt-existing').envelope.ok).toBe(true);
    expect(await read(project, 'app/extra/k.txt')).toBe('K1');
    const upgraded = cli(project, 'upgrade', '@x/k', 'path:k2', '--yes');
    expect(upgraded.envelope.ok).toBe(true);
    expect(upgraded.envelope.data.plan?.skipped).toContainEqual({ target: 'app/extra', path: 'app/extra/k.txt', reason: 'RETAINED_GROUND' });
    expect(await read(project, 'app/extra/k.txt')).toBe('K1');
    expect(await read(project, 'app/extra/e.txt')).toBe('E');
  });
});

describe('changedDeclarations', () => {
  it('returns every declaration when nothing is proven', () => {
    expect(changedDeclarations(undefined, ['a/', 'b'])).toEqual(['a', 'b']);
  });

  it('drops what both sides declare and reports added and dropped regions', () => {
    expect(changedDeclarations(['plugins/', 'old/'], ['plugins', 'extra/']).sort()).toEqual(['extra', 'old']);
  });

  it('treats a region inside a proven one as proven', () => {
    expect(changedDeclarations(['plugins/'], ['plugins/', 'plugins/deep/'])).toEqual([]);
    expect(changedDeclarations(['plugins/sub/'], ['plugins/', 'plugins/sub/'])).toEqual(['plugins']);
  });

  it('never proves a region spelled differently on the two sides', () => {
    expect(changedDeclarations(['Plugins/'], ['plugins/']).sort()).toEqual(['Plugins', 'plugins']);
  });
});
