// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
//
// Reviewed equals applied, across the two processes the real orchestrator uses
// (ADR 0021; CLI upgrade FEATURE): the review call and the confirming `--yes`
// call each compute their own plan, so an approval is only worth anything if the
// confirming call applies THAT plan and nothing else.
//
// Drives the real orchestrator (`orchestrateAiDrivenUpgrade`) and the real
// adapter (`createInvokeUpgradeCommand`) against the BUILT `frontx` executable
// in a hermetic project. The only seam is an offline stand-in for the Node
// global `fetch` (preloaded into every spawned CLI through NODE_OPTIONS) that
// serves GitHub-shaped tarballs per ref from scratch directories — the CLI's own
// `FRONTX_TEST_LOCAL_SOURCE_DIR` hook serves ONE directory for any url, which
// makes the recorded baseline and the candidate indistinguishable. The "reviewer"
// callback rewrites the served candidate between the review and the
// confirmation to model a changed candidate (a mutable ref, or a re-tagged one). Project drift is the same callback
// editing a file in the project. Operation lists are deliberately NOT what the
// assertions rest on: the candidate-content case keeps the list byte-identical
// and changes only a file's bytes, and every case checks the bytes on disk and
// the recorded version afterwards.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { craftTarball } from '../../__test-utils__/crafted-tarball.js';
import { createInvokeUpgradeCommand, type SpawnFn } from '../invoke-upgrade-command.js';
import { orchestrateAiDrivenUpgrade, type OrchestrationResult } from '../orchestrate.js';
import type { EnrichedReviewPackage, ReviewDecision } from '../types.js';

const cliPackageRoot = path.resolve(__dirname, '..', '..', '..', '..', 'cli');
const NAME = '@acme/drift';
let root: string;
let buildDir: string;
let sandbox: string;

beforeAll(async () => {
  // `FRONTX_TEST_SCRATCH` lets a runner keep every artifact inside its own scratch tree.
  root = await mkdtemp(path.join(process.env.FRONTX_TEST_SCRATCH ?? tmpdir(), 'frontx-approval-binding-'));
  buildDir = path.join(root, 'build');
  execFileSync('npx', ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'], {
    cwd: cliPackageRoot,
    stdio: 'pipe',
  });
}, 120_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await writeFile(path.join(root, 'standin.mjs'), STANDIN, 'utf-8');
  sandbox = await mkdtemp(path.join(root, 'case-'));
  await mkdir(path.join(sandbox, 'home'), { recursive: true });
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

// Serves `https://api.github.com/repos/acme/drift/tarball/<ref>` from `<STANDIN_SERVE>/drift-<version>`,
// rebuilt on every request so a later rewrite of the directory is what the next request sees. `<ref>` is
// `v<version>` or the pin `sha7(version)` the same module mints; every other URL is a 404 (nothing leaves the machine).
const STANDIN = `
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const serve = process.env.STANDIN_SERVE;
const sha = (version) => createHash('sha1').update('acme/drift@' + version).digest('hex');
globalThis.fetch = async (url) => {
  const match = /^https:\\/\\/api\\.github\\.com\\/repos\\/acme\\/drift\\/tarball\\/([^/?#]+)$/.exec(String(url));
  const version = match && readdirSync(serve).map((d) => d.slice('drift-'.length)).find((v) => match[1] === 'v' + v || match[1] === sha(v));
  if (!version) return new Response('not found (offline stand-in)', { status: 404, statusText: 'Not Found' });
  return new Response(readFileSync(path.join(serve, 'drift-' + version, '.github-tarball')), { status: 200 });
};
`;

const V1 = { 'README.md': 'readme v1\n', 'keep.txt': 'kept\n' };
const V2 = { 'README.md': 'readme v2\n', 'keep.txt': 'kept\n', 'CHANGELOG.md': 'changelog v2\n' };

async function writeSource(dir: string, version: string, files: Record<string, string>): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) await writeFile(path.join(dir, file), content, 'utf-8');
  await writeFile(
    path.join(dir, 'frontx-template.json'),
    JSON.stringify({ name: NAME, version, excludedSubtrees: [], description: 'approval binding fixture' }),
    'utf-8',
  );
}

function env(serve: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: path.join(sandbox, 'home'),
    FRONTX_INVENTORY_ROOT: path.join(sandbox, 'inventory'),
    NODE_OPTIONS: `--import=${path.join(root, 'standin.mjs')}`,
    STANDIN_SERVE: serve,
    STANDIN_STAGE: sandbox,
  };
}

/** Publishes (or rewrites) one version of the served template. */
const publish = (serve: string, version: string, files: Record<string, string>) =>
  writeSource(path.join(serve, `drift-${version}`), version, files).then(async () => {
    const commit = createHash('sha1').update('acme/drift@' + version).digest('hex');
    const tarball = craftTarball({ ...files, 'frontx-template.json': JSON.stringify({ name: NAME, version, excludedSubtrees: [], description: 'approval binding fixture' }) }, commit);
    await writeFile(path.join(serve, `drift-${version}`, '.github-tarball'), tarball.bytes);
  });

type Envelope = { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } };

function cli(project: string, source: string, ...args: string[]): { status: number | null; stdout: string; envelope: Envelope } {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
    cwd: project,
    encoding: 'utf-8',
    timeout: 60_000,
    env: env(source),
  });
  if (!result.stdout.trim()) throw new Error(`CLI exited ${result.status} (signal ${result.signal}): ${result.error?.message ?? ''}\n${result.stderr}`);
  return { status: result.status, stdout: result.stdout, envelope: JSON.parse(result.stdout.trim()) as Envelope };
}

const read = (project: string, relative: string) => readFile(path.join(project, relative), 'utf-8').catch(() => undefined);
const recorded = async (project: string) =>
  (JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as { templates: Record<string, { version: string; origin: string }> })
    .templates[NAME];

/** A project holding `NAME` v1.0.0 applied at `app/`, with the source directory re-served as v1.1.0. */
async function preparedProject(): Promise<{ project: string; source: string }> {
  const project = path.join(sandbox, 'project');
  const source = path.join(sandbox, 'serve');
  await mkdir(project, { recursive: true });
  await publish(source, '1.0.0', V1);
  for (const args of [
    ['install', 'github:acme/drift@v1.0.0'],
    ['register', 'github:acme/drift@v1.0.0'],
    ['apply', '--input', JSON.stringify({ templates: { [NAME]: ['app'] } })],
  ]) {
    const step = cli(project, source, ...args);
    expect(step.envelope.ok, `${args.join(' ')}: ${step.stdout}`).toBe(true);
  }
  expect(await read(project, 'app/README.md')).toBe(V1['README.md']);
  await publish(source, '1.1.0', V2);
  return { project, source };
}

/** The real orchestrator over the real adapter and the built CLI; `afterReview` runs INSIDE the approval callback. */
async function orchestrate(
  project: string,
  source: string,
  afterReview?: (pkg: EnrichedReviewPackage) => Promise<void>,
): Promise<{ result: OrchestrationResult; reviewed: EnrichedReviewPackage[] }> {
  const reviewed: EnrichedReviewPackage[] = [];
  const spawnFn: SpawnFn = (_bin, args, options) =>
    spawn(process.execPath, [path.join(buildDir, 'cli.js'), ...args], { ...options, env: env(source) });
  const result = await orchestrateAiDrivenUpgrade(project, NAME, 'v1.1.0', {
    readProvenance: async (projectRoot) =>
      JSON.parse(await readFile(path.join(projectRoot, '.frontx', 'project.json'), 'utf-8')) as never,
    invokeUpgradeCommand: createInvokeUpgradeCommand({ spawnFn }),
    presentEnrichedReview: async (pkg): Promise<ReviewDecision> => {
      reviewed.push(pkg);
      await afterReview?.(pkg);
      return 'approved';
    },
  });
  return { result, reviewed };
}

const stateFile = (project: string) => path.join(project, '.frontx', 'project.json');
const rawState = (project: string) => readFile(stateFile(project), 'utf-8');

/** Removes the optional `excludedSubtrees` field from the recorded entry: the legacy shape the no-op branch backfills. */
async function dropRecordedExclusions(project: string): Promise<void> {
  const state = JSON.parse(await rawState(project)) as { templates: Record<string, Record<string, unknown>> };
  delete state.templates[NAME].excludedSubtrees;
  await writeFile(stateFile(project), JSON.stringify(state, null, 2) + '\n', 'utf-8');
  expect(JSON.parse(await rawState(project)).templates[NAME].excludedSubtrees).toBeUndefined();
}

/** Nothing the unreviewed plan would have written exists, and the recorded entry never advanced. */
async function expectNothingApplied(project: string): Promise<void> {
  expect((await recorded(project)).version).toBe('1.0.0');
  expect(await read(project, 'app/CHANGELOG.md')).toBeUndefined();
  expect(await read(project, 'app/AFTER.md')).toBeUndefined();
}

describe('AI orchestration applies exactly what was reviewed (built CLI, real orchestrator)', () => {
  it('unchanged happy path: the reviewed plan lands, with its content', async () => {
    const { project, source } = await preparedProject();
    const { result, reviewed } = await orchestrate(project, source);

    expect(result, JSON.stringify(result)).toMatchObject({ status: 'applied' });
    expect(reviewed).toHaveLength(1);
    expect(await read(project, 'app/README.md')).toBe(V2['README.md']);
    expect(await read(project, 'app/CHANGELOG.md')).toBe(V2['CHANGELOG.md']);
    expect(await recorded(project)).toMatchObject({ version: '1.1.0' });
  });

  it('candidate content drift with an IDENTICAL operation list is refused, nothing applied', async () => {
    const { project, source } = await preparedProject();
    const { result, reviewed } = await orchestrate(project, source, async () => {
      // Same files, same operations (REPLACE README, ADD CHANGELOG) — different bytes.
      await publish(source, '1.1.0', { ...V2, 'README.md': 'readme v2 — CHANGED AFTER REVIEW\n' });
    });

    expect(result.status).toBe('apply-failed');
    expect(reviewed).toHaveLength(1);
    await expectNothingApplied(project);
    expect(await read(project, 'app/README.md')).toBe(V1['README.md']);
  });

  it('candidate drift that adds a file is refused: the unreviewed ADD never lands', async () => {
    const { project, source } = await preparedProject();
    const { result } = await orchestrate(project, source, async () => {
      await publish(source, '1.1.0', { ...V2, 'AFTER.md': 'added after review\n' });
    });

    expect(result.status).toBe('apply-failed');
    await expectNothingApplied(project);
    expect(await read(project, 'app/README.md')).toBe(V1['README.md']);
  });

  it('project drift that turns a reviewed REPLACE into UNCHANGED is refused, not reported as applied', async () => {
    const { project, source } = await preparedProject();
    const { result, reviewed } = await orchestrate(project, source, async () => {
      await writeFile(path.join(project, 'app/README.md'), V2['README.md'], 'utf-8');
    });

    expect(reviewed[0].changeSet.clean).toContainEqual({ kind: 'modify', path: 'app/README.md' });
    expect(result.status).toBe('apply-failed');
    await expectNothingApplied(project);
    // The developer's own edit is exactly as they left it.
    expect(await read(project, 'app/README.md')).toBe(V2['README.md']);
  });

  it('project drift on a destination the plan would write is never overwritten under the old approval', async () => {
    const { project, source } = await preparedProject();
    const { result } = await orchestrate(project, source, async () => {
      await writeFile(path.join(project, 'app/CHANGELOG.md'), 'a developer file created after review\n', 'utf-8');
    });

    expect(result.status).not.toBe('applied');
    expect(await read(project, 'app/CHANGELOG.md')).toBe('a developer file created after review\n');
    expect((await recorded(project)).version).toBe('1.0.0');
  });
});

describe('the project reaches the candidate between review and confirmation (transition to no-op)', () => {
  const upgrade = ['upgrade', NAME, 'github:acme/drift@v1.1.0'];

  /** Callback body: an independent review-bound upgrade lands the candidate under review. */
  const upgradeIndependently = (project: string, source: string) => async () => {
    const digest = cli(project, source, ...upgrade).envelope.error?.details?.planDigest as string;
    const direct = cli(project, source, ...upgrade, '--yes', `--plan-digest=${digest}`);
    expect(direct.envelope.data, direct.stdout).toMatchObject({ outcome: 'success' });
  };

  it('orchestrator reports apply-failed (not declined) and writes nothing; stale, no backfill needed', async () => {
    const { project, source } = await preparedProject();
    let snapshot = '';
    const { result } = await orchestrate(project, source, async () => {
      await upgradeIndependently(project, source)();
      snapshot = await rawState(project);
    });

    expect(result.status, JSON.stringify(result)).toBe('apply-failed');
    expect(await rawState(project)).toBe(snapshot);
    expect(await recorded(project)).toMatchObject({ version: '1.1.0' });
  });

  it('orchestrator reports apply-failed and does NOT backfill exclusions on a stale approval', async () => {
    const { project, source } = await preparedProject();
    let snapshot = '';
    const { result } = await orchestrate(project, source, async () => {
      await upgradeIndependently(project, source)();
      await dropRecordedExclusions(project);
      snapshot = await rawState(project);
    });

    expect(result.status, JSON.stringify(result)).toBe('apply-failed');
    // Byte-identical: the stale approval did not touch the document at all.
    expect(await rawState(project)).toBe(snapshot);
    expect(JSON.parse(snapshot).templates[NAME].excludedSubtrees).toBeUndefined();
  });

  it('built CLI: digest + no-op fails closed with CONFIRMATION_REQUIRED before any write, with or without the legacy field', async () => {
    for (const legacy of [false, true]) {
      const { project, source } = await preparedProject();
      const digest = cli(project, source, ...upgrade).envelope.error?.details?.planDigest as string;
      await upgradeIndependently(project, source)();
      if (legacy) await dropRecordedExclusions(project);
      const before = await rawState(project);

      const stale = cli(project, source, ...upgrade, '--yes', `--plan-digest=${digest}`);
      expect(stale.status, stale.stdout).toBe(1);
      expect(stale.envelope.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED', details: { reviewSuperseded: true } });
      expect(stale.envelope.error?.message).toContain('not the plan that was reviewed');
      expect(await rawState(project)).toBe(before);
      await rm(project, { recursive: true, force: true });
    }
  });

  it('a genuine no-op is unchanged: the no-op path can backfill exclusions without approving an upgrade', async () => {
    const { project, source } = await preparedProject();
    await upgradeIndependently(project, source)();
    const before = await rawState(project);
    const { result, reviewed } = await orchestrate(project, source);
    expect(result.status, JSON.stringify(result)).toBe('empty-changeset');
    expect(reviewed).toHaveLength(0);
    expect(await rawState(project)).toBe(before);

    await dropRecordedExclusions(project);
    const direct = cli(project, source, ...upgrade, '--yes');
    expect(direct.status).toBe(0);
    expect(direct.envelope.data).toMatchObject({ outcome: 'noop', recordedExclusions: [] });
    expect(JSON.parse(await rawState(project)).templates[NAME].excludedSubtrees).toEqual([]);
  });
});

describe('`frontx upgrade --yes --plan-digest` (built CLI, the contract the orchestrator relies on)', () => {
  const upgrade = ['upgrade', NAME, 'github:acme/drift@v1.1.0'];

  it('the review envelope names the plan by digest and carries no file content', async () => {
    const { project, source } = await preparedProject();
    const review = cli(project, source, ...upgrade);

    expect(review.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(review.envelope.error?.details?.planDigest).toMatch(/^[0-9a-f]{64}$/);
    for (const content of ['readme v2', 'changelog v2', 'readme v1']) expect(review.stdout).not.toContain(content);
    // Reviewing again without drift names the same plan.
    expect(cli(project, source, ...upgrade).envelope.error?.details?.planDigest).toBe(review.envelope.error?.details?.planDigest);
  });

  it('the digest tracks bytes, not the displayed list', async () => {
    const { project, source } = await preparedProject();
    const before = cli(project, source, ...upgrade).envelope.error;
    await publish(source, '1.1.0', { ...V2, 'README.md': 'readme v2, other bytes\n' });
    const after = cli(project, source, ...upgrade).envelope.error;

    expect(after?.details?.plan).toEqual(before?.details?.plan);
    expect(after?.details?.planDigest).not.toBe(before?.details?.planDigest);
  });

  it('commits when the digest matches; a stale digest returns a fresh review and writes nothing', async () => {
    const { project, source } = await preparedProject();
    const digest = cli(project, source, ...upgrade).envelope.error?.details?.planDigest as string;

    const stale = cli(project, source, ...upgrade, '--yes', `--plan-digest=${'0'.repeat(64)}`);
    expect(stale.status).toBe(1);
    expect(stale.envelope.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED', details: { planDigest: digest } });
    expect(stale.envelope.error?.message).toContain('not the plan that was reviewed');
    await expectNothingApplied(project);

    const confirmed = cli(project, source, ...upgrade, '--yes', `--plan-digest=${digest}`);
    expect(confirmed.status).toBe(0);
    expect(confirmed.envelope.data).toMatchObject({ outcome: 'success' });
    expect(await read(project, 'app/README.md')).toBe(V2['README.md']);
  });

  it('refuses a malformed digest, and a digest without --yes', async () => {
    const { project, source } = await preparedProject();
    for (const args of [
      [...upgrade, '--yes', '--plan-digest=nothex'],
      [...upgrade, `--plan-digest=${'a'.repeat(64)}`],
    ]) {
      const refused = cli(project, source, ...args);
      expect(refused.status).toBe(1);
      expect(refused.envelope.error?.code).toBe('INVALID_INPUT');
    }
    await expectNothingApplied(project);
  });

  it('`--yes` without a digest fails closed and leaves the project unchanged', async () => {
    const { project, source } = await preparedProject();
    const before = await rawState(project);
    const refused = cli(project, source, ...upgrade, '--yes');
    expect(refused.status).toBe(1);
    expect(refused.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(refused.envelope.error?.message).toContain('--yes confirms only a reviewed plan');
    expect(await rawState(project)).toBe(before);
  });
});
