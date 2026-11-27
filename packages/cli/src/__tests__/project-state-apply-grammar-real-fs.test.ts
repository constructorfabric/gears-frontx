// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-record-noncanonical
//
// The state store must never refuse, after `apply` has written files, a target
// `apply` itself recorded. Every non-null answer of the REAL canonicaliser — the
// only thing `apply` records — has to be accepted by the grammar the store judges
// recorded paths with, whatever the raw spelling was: a raw spelling the store's
// grammar refuses either never gets past the canonicaliser, or comes out of it
// in canonical form. Run over a real directory so symlink and case resolution
// are the platform's own.
import path from 'node:path';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createFsCanonicalizeTargetFn } from '../adapters/fs-project-io';
import { canonicalizeForRecording } from '../paths/relative-path';
import { mutateProjectState } from '../project-state/io';

let sandbox: string | undefined;

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

const RAW_TARGETS = [
  'app',
  './app',
  'app/',
  'app//src',
  'app/./src',
  'app/../other',
  'x/..',
  '.',
  './',
  '',
  'app ',
  ' app',
  'app\u0001',
  'a\\b',
  'a:b',
  '~',
  '~/x',
  './~',
  'x/../~',
  './~/x',
  'nul\u0000',
  'tab\there',
  'trail/ ',
  'link',
  'link/inner',
  'App',
  '../outside',
  '/abs/outside',
];

describe('what apply records is always accepted by the state store', () => {
  it.each(RAW_TARGETS.map((raw) => ({ raw })))('records the canonical form of %j without being refused', async ({ raw }) => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-state-grammar-'));
    const project = path.join(sandbox, 'project');
    await mkdir(path.join(project, 'app', 'src'), { recursive: true });
    await mkdir(path.join(project, 'other'), { recursive: true });
    await symlink(path.join(project, 'app'), path.join(project, 'link'));
    // The gate `apply` and `ownership add` record through: a path it admits is
    // one the store accepts, and one it refuses is refused before any write.
    const canonical = canonicalizeForRecording(raw, createFsCanonicalizeTargetFn(project));
    if (canonical === null) return;

    const writes: string[] = [];
    const result = await mutateProjectState(
      project,
      { kind: 'set-template', name: 't', entry: { origin: 'o', version: '1', targets: [canonical] } },
      async () => null,
      async (_location, content) => {
        writes.push(content);
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(writes).toHaveLength(1);
  });
});

describe('the real canonicaliser is idempotent', () => {
  it.each(RAW_TARGETS.map((raw) => ({ raw })))('answers %j with a path it would answer unchanged', async ({ raw }) => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-state-idem-'));
    const project = path.join(sandbox, 'project');
    await mkdir(path.join(project, 'app', 'src'), { recursive: true });
    await symlink(path.join(project, 'app'), path.join(project, 'link'));
    const canonicalize = createFsCanonicalizeTargetFn(project);
    let canonical: string | null;
    try {
      canonical = canonicalize(raw);
    } catch {
      return; // a platform throw (NUL) is refused by `canonicalizeForRecording` before it is asked
    }
    if (canonical === null) return;

    expect(canonicalize(canonical)).toBe(canonical);
  });
});
