import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoordinationError, createFsWithMutationScope, type TransitionIntent } from '../operations/coordination';
import { FsContentStore } from '../adapters/fs-content-store';

// Explicit, non-recursive cleanup: only the named directories this suite creates,
// emptied of their own direct (non-directory) entries, then removed bottom-up.
const worlds: string[] = [];
afterEach(() => {
  for (const root of worlds.splice(0)) {
    for (const link of ['inv-link', 'a/.frontx']) {
      try { if (fs.lstatSync(path.join(root, link)).isSymbolicLink()) fs.unlinkSync(path.join(root, link)); } catch { /* already absent */ }
    }
    const dirs = [
      'home/.frontx/operations', 'home/.frontx',
      'a/.frontx/operations', 'a/.frontx', 'b/.frontx/operations', 'b/.frontx',
      'inv1/.frontx-operations/reservations', 'inv1/.frontx-operations/stray', 'inv1/.frontx-operations',
      'inv1', 'inv2', 'home', 'a', 'b',
    ].map((d) => path.join(root, d));
    for (const dir of dirs) {
      let entries: string[];
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const entry of entries) {
        const file = path.join(dir, entry);
        if (!fs.lstatSync(file).isDirectory()) fs.unlinkSync(file);
      }
      fs.rmdirSync(dir);
    }
    fs.rmdirSync(root);
  }
});

function world() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-coord-')));
  worlds.push(root);
  for (const d of ['a', 'b', 'inv1', 'inv2', 'home']) fs.mkdirSync(path.join(root, d));
  const home = path.join(root, 'home', '.frontx');
  const scopeFor = (inventory: string, timeoutMs = 2_000) => createFsWithMutationScope(path.join(root, inventory), home, timeoutMs);
  return { root, home, scopeFor };
}

const intent = (extra: Partial<TransitionIntent> = {}): TransitionIntent => ({
  kind: 'upgrade',
  name: 'demo',
  from: { origin: 'path:v1', version: '1.0.0' },
  to: { origin: 'path:v2', version: '2.0.0' },
  fromEntry: '{"version":"1.0.0"}',
  planDigest: 'digest',
  candidateHash: 'hash',
  footprint: [{ path: 'app/a.txt', before: null }],
  tasks: { inventory: 'not-required', ai: 'pending' },
  ...extra,
});

async function refusal(promise: Promise<unknown>): Promise<CoordinationError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CoordinationError) return error;
    throw error;
  }
  throw new Error('expected a coordination refusal');
}

describe('mutation scope', () => {
  it('a prepared transition is discoverable from its project and from its actual inventory root', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    const b = path.join(root, 'b');
    let receiptPath = '';
    let id = '';
    await scopeFor('inv1')(a, 'normal', async (scope) => {
      const t = scope.beginTransition(intent());
      receiptPath = t.receiptPath;
      id = t.receipt.id;
      expect(t.receipt.phase).toBe('prepared');
    });
    expect(path.dirname(receiptPath)).toBe(path.join(a, '.frontx', 'operations'));
    expect(JSON.parse(fs.readFileSync(receiptPath, 'utf8'))).toMatchObject({ phase: 'prepared', intent: { tasks: { ai: 'pending' } } });
    const reservation = path.join(root, 'inv1', '.frontx-operations', 'reservations', `${id}.json`);
    expect(JSON.parse(fs.readFileSync(reservation, 'utf8'))).toMatchObject({ id, projectRoot: a });

    expect((await refusal(scopeFor('inv1')(a, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    // Project discovery does not depend on the caller's current inventory root.
    expect((await refusal(scopeFor('inv2')(a, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    // Another project sharing the reserved root, also through a symlink alias, is blocked.
    expect((await refusal(scopeFor('inv1')(b, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    fs.symlinkSync(path.join(root, 'inv1'), path.join(root, 'inv-link'), 'dir');
    expect((await refusal(scopeFor('inv-link')(b, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    await expect(scopeFor('inv2')(b, 'normal', async () => 'ran')).resolves.toBe('ran');
  });

  it('finalizes only a verified terminal state, recording it before releasing reservation then receipt', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    await scopeFor('inv1')(a, 'normal', async (scope) => { scope.beginTransition(intent()); });
    await scopeFor('inv1')(a, 'recover', async (scope) => {
      const [t] = scope.pending;
      expect(() => scope.beginTransition(intent())).toThrow();
      // A changed entry blocks a cancel; nothing is written by the refusal.
      await expect(t.finalize('cancelled', '{"version":"2.0.0"}')).rejects.toThrow(/pre-transition/);
      expect(JSON.parse(fs.readFileSync(t.receiptPath, 'utf8'))).toMatchObject({ phase: 'prepared' });
      // `finalizing` (with the terminal entry) is durable BEFORE the project-state
      // clear runs, and both records still exist at that moment.
      const seen: unknown[] = [];
      await t.finalize('committed', '{"version":"2.0.0"}', async () => {
        seen.push(JSON.parse(fs.readFileSync(t.receiptPath, 'utf8')));
        seen.push(fs.readdirSync(path.join(root, 'inv1', '.frontx-operations', 'reservations')).length);
      });
      expect(seen).toEqual([expect.objectContaining({ phase: 'finalizing', completion: { result: 'committed', entry: '{"version":"2.0.0"}' } }), 1]);
    });
    expect(fs.readdirSync(path.join(a, '.frontx', 'operations'))).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'inv1', '.frontx-operations', 'reservations'))).toEqual([]);
    await expect(scopeFor('inv1')(a, 'normal', async () => 'ran')).resolves.toBe('ran');
  });

  it('a finalizing record whose release was interrupted is completed only for the same terminal entry', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    await scopeFor('inv1')(a, 'normal', async (scope) => {
      const t = scope.beginTransition(intent({ tasks: { inventory: 'not-required', ai: 'not-required' } }));
      // Simulate a crash after the finalizing write: persist it by hand.
      const r = JSON.parse(fs.readFileSync(t.receiptPath, 'utf8'));
      fs.writeFileSync(t.receiptPath, JSON.stringify({ ...r, phase: 'finalizing', completion: { result: 'committed', entry: 'E' } }));
    });
    await scopeFor('inv1')(a, 'recover', async (scope) => {
      expect(scope.pending[0].receipt.phase).toBe('finalizing');
      await expect(scope.pending[0].finalize('committed', 'other')).rejects.toThrow(/disagrees/);
      await scope.pending[0].finalize('committed', 'E');
    });
    await expect(scopeFor('inv1')(a, 'normal', async () => 'ran')).resolves.toBe('ran');
  });

  it('refuses to release a reservation that differs from its receipt or is missing for a prepared transition', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    let id = '';
    await scopeFor('inv1')(a, 'normal', async (scope) => { id = scope.beginTransition(intent({ tasks: { inventory: 'not-required', ai: 'not-required' } })).receipt.id; });
    const reservation = path.join(root, 'inv1', '.frontx-operations', 'reservations', `${id}.json`);
    const original = fs.readFileSync(reservation, 'utf8');
    // Same id and project root, different immutable intent.
    fs.writeFileSync(reservation, JSON.stringify({ ...JSON.parse(original), intent: intent({ candidateHash: 'other' }) }));
    await scopeFor('inv1')(a, 'recover', async (scope) => {
      await expect(scope.pending[0].finalize('committed', 'E')).rejects.toThrow(/does not match/);
      expect(scope.pending[0].receipt.phase).toBe('prepared');
    });
    expect(fs.existsSync(reservation)).toBe(true);
    fs.unlinkSync(reservation);
    await scopeFor('inv1')(a, 'recover', async (scope) => {
      await expect(scope.pending[0].finalize('committed', 'E')).rejects.toThrow(/missing/);
    });
    expect(fs.readdirSync(path.join(a, '.frontx', 'operations'))).toHaveLength(1);
    fs.writeFileSync(reservation, original);
    await scopeFor('inv1')(a, 'recover', async (scope) => { await scope.pending[0].finalize('committed', 'E'); });
    expect(fs.existsSync(reservation)).toBe(false);
  });

  it('a reservation whose receipt is gone is never released automatically', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    let receiptPath = '';
    await scopeFor('inv1')(a, 'normal', async (scope) => { receiptPath = scope.beginTransition(intent()).receiptPath; });
    fs.unlinkSync(receiptPath);
    expect((await refusal(scopeFor('inv1')(a, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    expect((await refusal(scopeFor('inv1')(a, 'recover', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    expect(fs.readdirSync(path.join(root, 'inv1', '.frontx-operations', 'reservations'))).toHaveLength(1);
  });

  it('fails closed on an unknown or malformed record and never deletes it; a stray temp is swept only by recover', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    fs.mkdirSync(path.join(a, '.frontx', 'operations'), { recursive: true });
    const unknown = path.join(a, '.frontx', 'operations', 'notes.txt');
    fs.writeFileSync(unknown, 'x');
    expect((await refusal(scopeFor('inv1')(a, 'normal', async () => 'ran'))).details).toEqual({ records: [unknown] });
    expect((await refusal(scopeFor('inv1')(a, 'recover', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    expect(fs.existsSync(unknown)).toBe(true);
    fs.unlinkSync(unknown);
    const malformed = path.join(a, '.frontx', 'operations', '00000000-0000-4000-8000-000000000000.json');
    fs.writeFileSync(malformed, '{');
    expect((await refusal(scopeFor('inv1')(a, 'recover', async () => 'ran'))).message).toMatch(/Malformed/);
    expect(fs.readFileSync(malformed, 'utf8')).toBe('{');
    fs.unlinkSync(malformed);
    const temp = path.join(a, '.frontx', 'operations', '00000000-0000-4000-8000-000000000000.00000000-0000-4000-8000-000000000001.tmp');
    fs.writeFileSync(temp, '{');
    expect((await refusal(scopeFor('inv1')(a, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
    await scopeFor('inv1')(a, 'recover', async (scope) => expect(scope.pending).toEqual([]));
    expect(fs.existsSync(temp)).toBe(false);
  });

  it('an unexpected entry in the inventory coordination directory blocks its writers', async () => {
    const { root, scopeFor } = world();
    fs.mkdirSync(path.join(root, 'inv1', '.frontx-operations', 'stray'), { recursive: true });
    expect((await refusal(scopeFor('inv1')(path.join(root, 'a'), 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
  });

  it('the content store refuses a slot inside the coordination directory before touching disk', () => {
    const { root } = world();
    const store = new FsContentStore(path.join(root, 'inv1'));
    expect(() => store.write('.frontx-operations', 'x')).toThrow(/reserved/);
    expect(() => store.replace('.frontx-operations/reservations', 'x')).toThrow(/reserved/);
    expect(fs.readdirSync(path.join(root, 'inv1'))).toEqual([]);
  });

  it('reports a live competing lease as RESOURCE_BUSY without running the body', async () => {
    const { scopeFor, root } = world();
    const a = path.join(root, 'a');
    let inner = false;
    await scopeFor('inv1')(a, 'normal', async () => {
      const busy = await refusal(scopeFor('inv1', 50)(a, 'normal', async () => { inner = true; }));
      expect(busy.code).toBe('RESOURCE_BUSY');
    });
    expect(inner).toBe(false);
  });

  it('refuses when .frontx is a symlink instead of reading through it', async () => {
    const { root, scopeFor } = world();
    const a = path.join(root, 'a');
    fs.symlinkSync(path.join(root, 'b'), path.join(a, '.frontx'), 'dir');
    expect((await refusal(scopeFor('inv1')(a, 'normal', async () => 'ran'))).code).toBe('RECOVERY_REQUIRED');
  });
});
