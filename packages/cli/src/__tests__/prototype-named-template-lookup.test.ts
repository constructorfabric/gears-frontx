// @cpt-algo:cpt-frontx-algo-composed-provenance-unregister:p1
//
// A template name is user-chosen text. `toString`, `constructor`,
// `hasOwnProperty` and `__proto__` are valid names the CLI accepts at
// `register`, so a by-name lookup must answer only for names a record holds as
// its OWN property: an inherited `Object.prototype` member is not a registered
// template. Covers the shared helpers, the in-process command boundaries
// against empty and persisted state, and the BUILT executable's `--json`
// envelope.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getOwn, setOwn } from '../own-record';
import { unregisterTemplate } from '../commands/unregister';
import { officialDefaultOrigin } from '../commands/official-defaults';
import { FsInventoryIndex } from '../adapters/fs-inventory-index';
import { InventoryIndex } from '../inventory/InventoryIndex';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn } from '../project-state/types';

const PROTOTYPE_NAMES = ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__'] as const;

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

describe('own-record helpers', () => {
  it('answer undefined for inherited members and for absent names', () => {
    const record: Record<string, number> = { present: 1 };
    for (const name of [...PROTOTYPE_NAMES, 'absent']) expect(getOwn(record, name)).toBeUndefined();
    expect(getOwn(record, 'present')).toBe(1);
  });

  it('store and return an entry named __proto__ without rewiring the prototype', () => {
    const record: Record<string, string[]> = {};
    setOwn(record, '__proto__', ['x']);
    expect(Object.keys(record)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(getOwn(record, '__proto__')).toEqual(['x']);
    expect(JSON.parse(JSON.stringify(record))).toEqual(JSON.parse('{"__proto__":["x"]}'));
  });
});

function fakeState(initial: ProjectStateDocument | null): { read: ReadProjectStateFn; write: WriteProjectStateFn; written: () => string | null } {
  let stored = initial ? JSON.stringify(initial) : null;
  const write: WriteProjectStateFn = vi.fn(async (_p, content) => {
    stored = content;
  });
  return { read: async () => stored, write, written: () => stored };
}

const persisted = (): ProjectStateDocument => ({
  formatVersion: 1,
  templates: { '@x/real': { origin: 'path:real', version: '1.0.0', targets: [] } },
  projectOwnedRoots: [],
});

describe('unregisterTemplate with a prototype-named template', () => {
  for (const name of PROTOTYPE_NAMES) {
    it(`refuses ${name} as TEMPLATE_NOT_REGISTERED against an empty state and writes nothing`, async () => {
      const state = fakeState(null);
      const result = await unregisterTemplate(name, '/repo', state.read, state.write);
      expect(result).toMatchObject({ ok: false, code: 'TEMPLATE_NOT_REGISTERED' });
      expect(state.write).not.toHaveBeenCalled();
    });

    it(`refuses ${name} as TEMPLATE_NOT_REGISTERED against a persisted state and leaves it byte-identical`, async () => {
      const state = fakeState(persisted());
      const before = state.written();
      const result = await unregisterTemplate(name, '/repo', state.read, state.write);
      expect(result).toMatchObject({ ok: false, code: 'TEMPLATE_NOT_REGISTERED' });
      expect(state.written()).toBe(before);
    });
  }

  it('still removes a template that is REGISTERED under a prototype name', async () => {
    const doc: ProjectStateDocument = JSON.parse(
      '{"formatVersion":1,"projectOwnedRoots":[],"templates":{"toString":{"origin":"path:t","version":"1.0.0","targets":[]},"__proto__":{"origin":"path:t","version":"1.0.0","targets":[]}}}',
    );
    const state = fakeState(doc);
    expect(await unregisterTemplate('toString', '/repo', state.read, state.write)).toEqual({ ok: true, name: 'toString' });
    expect(await unregisterTemplate('__proto__', '/repo', state.read, state.write)).toEqual({ ok: true, name: '__proto__' });
    expect(Object.keys(JSON.parse(state.written() as string).templates)).toEqual([]);
  });
});

describe('other name-keyed lookups', () => {
  it('officialDefaultOrigin does not treat an inherited member as an official default', () => {
    for (const name of PROTOTYPE_NAMES) expect(officialDefaultOrigin(name)).toBeUndefined();
  });

  it('InventoryIndex.toJSON keeps an entry named __proto__', () => {
    const index = new InventoryIndex();
    index.record({ name: '__proto__', source: 's', ref: 'r', status: 'installed', content: 'c' } as never);
    expect(Object.keys(JSON.parse(index.toJSON()))).toEqual(['__proto__']);
  });

  describe('FsInventoryIndex', () => {
    let dir: string | undefined;
    afterEach(async () => {
      if (dir !== undefined) await rm(dir, { recursive: true, force: true });
      dir = undefined;
    });

    it('lookup and getState answer absent for inherited members, empty and persisted, and update is a no-op', async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'frontx-inv-proto-'));
      const index = new FsInventoryIndex(dir);
      for (const name of PROTOTYPE_NAMES) expect(index.lookup(name)).toBeUndefined();
      index.record({ name: '@x/real', source: 's', ref: 'r', status: 'installed', content: 'c' } as never);
      for (const name of PROTOTYPE_NAMES) {
        expect(index.lookup(name)).toBeUndefined();
        expect(index.getState(name)).toBe('UNRESOLVED');
      }
      const before = index.toJSON();
      for (const name of PROTOTYPE_NAMES) index.update(name, { ref: 'changed' });
      expect(index.toJSON()).toBe(before);
    });

    it('records and finds an entry named __proto__ as an own entry', async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'frontx-inv-proto-'));
      const index = new FsInventoryIndex(dir);
      index.record({ name: '__proto__', source: 's', ref: 'r', status: 'installed', content: 'c' } as never);
      expect(index.lookup('__proto__')?.name).toBe('__proto__');
      expect(index.all().map((e) => e.name)).toEqual(['__proto__']);
    });
  });
});

// ---------- the BUILT executable ----------
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

type Envelope = { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } };
function cli(project: string, ...args: string[]): { status: number | null; stderr: string; envelope: Envelope } {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], { cwd: project, encoding: 'utf-8', timeout: 60_000 });
  return { status: result.status, stderr: result.stderr, envelope: JSON.parse(result.stdout) as Envelope };
}

async function fixtureTemplate(project: string, folder: string, name: string): Promise<void> {
  await mkdir(path.join(project, folder), { recursive: true });
  await writeFile(path.join(project, folder, 'a.txt'), 'A', 'utf-8');
  await writeFile(path.join(project, folder, 'frontx-template.json'), JSON.stringify({ name, version: '1.0.0', excludedSubtrees: [], description: 'fixture' }), 'utf-8');
}

const stateFile = (project: string) => path.join(project, '.frontx', 'project.json');

describe('built CLI: a prototype-named template that is not registered', () => {
  const commands: [string, (name: string) => string[]][] = [
    ['unregister', (n) => ['unregister', n]],
    ['upgrade <name> <origin>', (n) => ['upgrade', n, 'path:nowhere']],
    ['upgrade <name> --restore', (n) => ['upgrade', n, '--restore']],
    ['apply', (n) => ['apply', '--input', JSON.stringify({ templates: { [n]: ['app'] } })]],
  ];

  for (const [label, args] of commands) {
    for (const name of PROTOTYPE_NAMES) {
      it(`${label} ${name}: structured TEMPLATE_NOT_REGISTERED on an empty project, nothing created`, async () => {
        sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-proto-'));
        const { status, stderr, envelope } = cli(sandbox, ...args(name));
        expect(stderr).not.toMatch(/TypeError|Cannot read/);
        expect(status).toBe(1);
        expect(envelope.ok).toBe(false);
        expect(envelope.error?.code).toBe('TEMPLATE_NOT_REGISTERED');
        await expect(readFile(stateFile(sandbox), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
      });
    }
  }

  it('is refused the same way against a persisted state, which stays byte-identical', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-proto-'));
    await fixtureTemplate(sandbox, 'real', '@x/real');
    expect(cli(sandbox, 'register', 'path:real').envelope.ok).toBe(true);
    const before = await readFile(stateFile(sandbox), 'utf-8');
    for (const name of PROTOTYPE_NAMES) {
      for (const [, args] of commands) {
        const { status, envelope } = cli(sandbox, ...args(name));
        expect(status, `${name}`).toBe(1);
        expect(envelope.error?.code, `${name}`).toBe('TEMPLATE_NOT_REGISTERED');
      }
    }
    expect(await readFile(stateFile(sandbox), 'utf-8')).toBe(before);
  });

  it('seed refuses a prototype name as not an official default instead of treating it as one', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-proto-'));
    await mkdir(path.join(sandbox, 'fresh'));
    for (const name of PROTOTYPE_NAMES) {
      const { status, envelope } = cli(sandbox, 'seed', 'fresh', '--input', JSON.stringify({ templates: { [name]: ['app'] } }));
      expect(status, name).toBe(1);
      expect(envelope.error?.code, name).toBe('TEMPLATE_NOT_REGISTERED');
    }
  });
});

describe('built CLI: a template REGISTERED under a prototype name (register accepts it) behaves as any other', () => {
  it('registers, applies, lists-by-state, unregisters after delete, for toString and __proto__', async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-proto-'));
    for (const name of ['toString', '__proto__']) {
      const folder = `src_${name.replace(/\W/g, '')}`;
      await fixtureTemplate(sandbox, folder, name);
      const registered = cli(sandbox, 'register', `path:${folder}`);
      expect(registered.envelope.ok, name).toBe(true);
      expect(registered.envelope.data?.outcome, name).toBe('created');
      // A second register is idempotent against the OWN entry, not "created" again.
      expect(cli(sandbox, 'register', `path:${folder}`).envelope.data?.outcome, name).not.toBe('created');
      const target = `app_${folder}`;
      const applied = cli(sandbox, 'apply', '--input', JSON.stringify({ templates: { [name]: [target] } }));
      expect(applied.envelope.ok, `${name} apply ${JSON.stringify(applied.envelope)}`).toBe(true);
      const state = JSON.parse(await readFile(stateFile(sandbox), 'utf-8')) as { templates: Record<string, { targets: string[] }> };
      expect(Object.keys(state.templates)).toContain(name);
      expect(state.templates[name]?.targets).toEqual([target]);
      expect(confirmDelete(cli, sandbox, target).envelope.ok, name).toBe(true);
      expect(cli(sandbox, 'unregister', name).envelope, name).toEqual({ ok: true, data: { name } });
      expect(cli(sandbox, 'unregister', name).envelope.error?.code, name).toBe('TEMPLATE_NOT_REGISTERED');
    }
  });
});
