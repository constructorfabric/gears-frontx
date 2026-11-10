// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// Review r24 (R24-1, R24-2): a marked host entry (`exclusionsBackfilled`) must
// keep the evidence it had at apply time that a long-standing excluded region
// was never written by it (`provenExcludedSubtrees`), through SUCCESSIVE
// upgrades, so a guest nested there is neither frozen on the host's second
// upgrade nor orphaned by `delete`. The evidence is only ever narrowed, comes
// from recorded state (never from the mutable current origin), and an entry
// without it (legacy, marked by an older build) keeps the conservative
// behaviour. What the host newly handed over stays retained (human ruling V2).
// Drives the BUILT executable.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { intersectDeclarations } from '../project-state/retained-ground';
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
    wasLastTarget?: boolean;
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
const stateFile = (project: string) => path.join(project, '.frontx', 'project.json');
type State = { templates: Record<string, Record<string, unknown>> };
const readState = async (project: string) => JSON.parse(await readFile(stateFile(project), 'utf-8')) as State;
const entry = async (project: string, name: string) => (await readState(project)).templates[name];
const retainedSkips = (result: { envelope: Envelope }) =>
  (result.envelope.data.plan?.skipped ?? []).filter((skip) => skip.reason === 'RETAINED_GROUND');

/**
 * Host `@x/h` v1 excludes `plugins/` and writes `extra/e.txt`; guest `@x/g` v1
 * is applied INTO `app/plugins`. Host v2 additionally excludes `extra/`
 * (marking the host entry), and, when `successive`, host v3 keeps the same two
 * exclusions and changes only `h.txt`.
 */
async function hostProject(successive: boolean): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-durable-'));
  const project = sandbox;
  await template(project, 'h1', '@x/h', '1.0.0', ['plugins/'], { 'h.txt': 'H', 'extra/e.txt': 'E' });
  await template(project, 'h2', '@x/h', '2.0.0', ['plugins/', 'extra/'], { 'h.txt': 'H2' });
  await template(project, 'h3', '@x/h', '3.0.0', ['plugins/', 'extra/'], { 'h.txt': 'H3' });
  await template(project, 'h3n', '@x/h', '3.0.0', ['extra/'], { 'h.txt': 'H3' });
  await template(project, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1', 'old.txt': 'O' });
  await template(project, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
  await template(project, 'k1', '@x/k', '1.0.0', [], { 'k.txt': 'K1' });
  await template(project, 'k2', '@x/k', '2.0.0', [], { 'k.txt': 'K2' });
  for (const origin of ['h1', 'g1', 'k1']) expect(cli(project, 'register', `path:${origin}`).envelope.ok).toBe(true);
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/h': ['app'], '@x/g': ['app/plugins'] } })).envelope.ok).toBe(true);
  const first = cli(project, 'upgrade', '@x/h', 'path:h2', '--yes');
  expect(JSON.stringify(first.envelope)).toContain('"ok":true');
  if (successive) expect(cli(project, 'upgrade', '@x/h', 'path:h3', '--yes').envelope.ok).toBe(true);
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

describe('proven exclusion evidence survives successive host upgrades (built CLI)', () => {
  it('records the proven region once, and only the handed-over region as retained', async () => {
    const project = await hostProject(false);
    expect(await entry(project, '@x/h')).toMatchObject({
      exclusionsBackfilled: true,
      relinquishedGround: ['app/extra'],
      provenExcludedSubtrees: ['plugins/'],
    });
  });

  it('R24-1: a second host upgrade with the same exclusions does not freeze the nested guest', async () => {
    const project = await hostProject(true);
    expect(await entry(project, '@x/h')).toMatchObject({ relinquishedGround: ['app/extra'], provenExcludedSubtrees: ['plugins/'] });
    const upgraded = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(upgraded.status).toBe(0);
    expect(retainedSkips(upgraded)).toEqual([]);
    expect(await read(project, 'app/plugins/g.txt')).toBe('G2');
    expect(await read(project, 'app/plugins/old.txt')).toBeUndefined();
  });

  it('R24-2: guest delete after the host upgrades removes its files and its target', async () => {
    const project = await hostProject(true);
    expect(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes').envelope.ok).toBe(true);
    const deleted = confirmDelete(cli, project, 'app/plugins');
    expect(deleted.envelope.ok).toBe(true);
    expect(deleted.envelope.data.toDelete).toContain('app/plugins/g.txt');
    expect(deleted.envelope.data.toPreserve ?? []).not.toContain('app/plugins/g.txt');
    expect(await read(project, 'app/plugins/g.txt')).toBeUndefined();
    expect((await entry(project, '@x/g')).targets).toEqual([]);
  });

  it('R24-2: guest delete right after the FIRST host upgrade also removes its files', async () => {
    const project = await hostProject(false);
    const deleted = confirmDelete(cli, project, 'app/plugins');
    expect(deleted.envelope.data.toDelete).toContain('app/plugins/g.txt');
    expect(await read(project, 'app/plugins/g.txt')).toBeUndefined();
  });

  it('V2: ground the host handed over stays retained through the second upgrade', async () => {
    const project = await hostProject(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/k': ['app/extra'] } }), '--adopt-existing').envelope.ok).toBe(true);
    const upgraded = cli(project, 'upgrade', '@x/k', 'path:k2', '--yes');
    expect(upgraded.envelope.data.plan?.skipped).toContainEqual({ target: 'app/extra', path: 'app/extra/k.txt', reason: 'RETAINED_GROUND' });
    expect(await read(project, 'app/extra/k.txt')).toBe('K1');
    expect(await read(project, 'app/extra/e.txt')).toBe('E');
    const deleted = confirmDelete(cli, project, 'app/extra');
    expect(deleted.envelope.data.toDelete ?? []).not.toContain('app/extra/e.txt');
    expect(await read(project, 'app/extra/e.txt')).toBe('E');
  });

  it('narrowing over a registered guest is refused, and refusing changes no evidence', async () => {
    const project = await hostProject(false);
    const narrowed = cli(project, 'upgrade', '@x/h', 'path:h3n', '--yes');
    expect(narrowed.envelope.error.code).toBe('TARGET_CONFLICT');
    expect(await entry(project, '@x/h')).toMatchObject({ provenExcludedSubtrees: ['plugins/'] });
  });

  it('narrowing once the guest is gone drops the evidence, and widening again does not bring it back', async () => {
    const project = await hostProject(false);
    expect(confirmDelete(cli, project, 'app/plugins').envelope.ok).toBe(true);
    expect(cli(project, 'upgrade', '@x/h', 'path:h3n', '--yes').envelope.ok).toBe(true);
    const narrowed = await entry(project, '@x/h');
    expect(narrowed.provenExcludedSubtrees).toBeUndefined();
    expect(narrowed.relinquishedGround).toEqual(expect.arrayContaining(['app/plugins', 'app/extra']));
    expect(cli(project, 'upgrade', '@x/h', 'path:h3', '--yes').envelope.ok).toBe(true);
    const widened = await entry(project, '@x/h');
    expect(widened.provenExcludedSubtrees).toBeUndefined();
    expect(widened.relinquishedGround).toEqual(expect.arrayContaining(['app/plugins', 'app/extra']));
    // A guest nested there again is retained: the host may have written beneath it while it was not excluded.
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/g': ['app/plugins'] } }), '--adopt-existing').envelope.ok).toBe(true);
    expect(retainedSkips(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes')).length).toBeGreaterThan(0);
  });

  it('restore keeps the evidence only for what both declarations excluded', async () => {
    const project = await hostProject(true);
    expect(cli(project, 'upgrade', '@x/h', '--restore', '--yes').envelope.ok).toBe(true);
    expect((await entry(project, '@x/h')).provenExcludedSubtrees).toEqual(['plugins/']);
    expect(retainedSkips(cli(project, 'upgrade', '@x/g', 'path:g2', '--yes'))).toEqual([]);
  });
});

describe('no evidence means no trust (built CLI)', () => {
  it('an entry marked by an older build (no recorded evidence) stays conservative on upgrade and delete', async () => {
    const project = await hostProject(true);
    const state = await readState(project);
    delete state.templates['@x/h'].provenExcludedSubtrees;
    state.templates['@x/h'].relinquishedGround = ['app/extra', 'app/plugins'];
    await writeFile(stateFile(project), JSON.stringify(state, null, 2), 'utf-8');
    const upgraded = cli(project, 'upgrade', '@x/g', 'path:g2', '--yes');
    expect(retainedSkips(upgraded).length).toBeGreaterThan(0);
    expect(await read(project, 'app/plugins/g.txt')).toBe('G1');
    const deleted = confirmDelete(cli, project, 'app/plugins');
    expect(deleted.envelope.data.toPreserve).toContain('app/plugins/g.txt');
    expect(await read(project, 'app/plugins/g.txt')).toBe('G1');
  });

  it('a later host upgrade never creates evidence for an entry that has none', async () => {
    const project = await hostProject(false);
    const state = await readState(project);
    delete state.templates['@x/h'].provenExcludedSubtrees;
    await writeFile(stateFile(project), JSON.stringify(state, null, 2), 'utf-8');
    expect(cli(project, 'upgrade', '@x/h', 'path:h3', '--yes').envelope.ok).toBe(true);
    const host = await entry(project, '@x/h');
    expect(host.provenExcludedSubtrees).toBeUndefined();
    expect(host.relinquishedGround).toEqual(expect.arrayContaining(['app/plugins', 'app/extra']));
  });

  it('a mutable current origin cannot grant trust: delete still protects when the host origin now declares nothing', async () => {
    const project = await hostProject(true);
    await writeFile(
      path.join(project, 'h3', 'frontx-template.json'),
      JSON.stringify({ name: '@x/h', version: '3.0.0', excludedSubtrees: [], description: 'fixture' }),
      'utf-8',
    );
    const deleted = confirmDelete(cli, project, 'app/plugins');
    expect(deleted.envelope.data.toPreserve).toContain('app/plugins/g.txt');
    expect(await read(project, 'app/plugins/g.txt')).toBe('G1');
  });

  it('a mutable origin edited to declare more excludes does not widen the recorded evidence', async () => {
    const project = await hostProject(false);
    await writeFile(
      path.join(project, 'h2', 'frontx-template.json'),
      JSON.stringify({ name: '@x/h', version: '2.0.0', excludedSubtrees: ['plugins/', 'extra/', 'h.txt'], description: 'fixture' }),
      'utf-8',
    );
    expect((await entry(project, '@x/h')).provenExcludedSubtrees).toEqual(['plugins/']);
  });
});

describe('every holder of overlapping retained ground is reported (R24-3)', () => {
  it('names both entries that record the ground, and the human note does not offer a removal', async () => {
    const project = await hostProject(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/k': ['app/extra'] } }), '--adopt-existing').envelope.ok).toBe(true);
    const state = await readState(project);
    state.templates['@x/g'].relinquishedGround = ['app/extra'];
    await writeFile(stateFile(project), JSON.stringify(state, null, 2), 'utf-8');
    const human = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), 'upgrade', '@x/k', 'path:k2'], { cwd: project, encoding: 'utf-8' });
    expect(human.stdout + human.stderr).toMatch(/does not by itself say the held files may be removed/);
    const upgraded = cli(project, 'upgrade', '@x/k', 'path:k2', '--yes');
    const plan = upgraded.envelope.data.plan as unknown as { retainedGround?: { template: string; ground: string }[] };
    expect(plan.retainedGround).toEqual(
      expect.arrayContaining([
        { template: '@x/h', ground: 'app/extra' },
        { template: '@x/g', ground: 'app/extra' },
      ]),
    );
  });
});

describe('intersectDeclarations', () => {
  it('keeps what both sides declare, by exact spelling', () => {
    expect(intersectDeclarations(['plugins/', 'old/'], ['plugins', 'extra/'])).toEqual(['plugins/']);
    expect(intersectDeclarations(['Plugins/'], ['plugins/'])).toEqual([]);
  });

  it('keeps a region only when the other side covers it, and the narrower region of the two', () => {
    expect(intersectDeclarations(['plugins/'], ['plugins/deep/'])).toEqual(['plugins/deep/']);
    expect(intersectDeclarations(['plugins/deep/'], ['plugins/'])).toEqual(['plugins/deep/']);
    expect(intersectDeclarations(['plugins/'], ['plugin/'])).toEqual([]);
  });
});
