// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
//
// `createInvokeUpgradeCommand` spawns the built `frontx upgrade <templateName>
// <new-origin> --json[, --yes]` command surface (never importing
// `@gears-frontx/cli`), with the target project as the spawned process's
// working directory, gates the engine's apply step on the developer's review
// decision by RE-ISSUING the identical command with `--yes` rather than by
// writing to the process's stdin, and parses each invocation's single JSON
// envelope into the kit-local `UpgradeCommandJsonResult`.
//
// This test injects a fake spawned process (EventEmitter + PassThrough
// streams) that speaks the REAL `{ok:true, data}` / `{ok:false,
// error:{code, message, details}}` envelope — the retired `{changeSet}` /
// stdin-decision / `{ok, status}` handshake the previous version of this
// test spoke is gone; that fake is exactly what hid the original defect.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInvokeUpgradeCommand, type SpawnFn } from '../invoke-upgrade-command.js';
import { enrichUpgradeChangeSet } from '../enrich.js';
import type { ChangeSet, ReviewDecision } from '../types.js';

/** Minimal fake `ChildProcessWithoutNullStreams` double. */
function makeFakeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough & { writtenChunks: unknown[] };
  };
  emitter.kill = vi.fn();
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  const stdin = new PassThrough() as PassThrough & { writtenChunks: unknown[] };
  stdin.writtenChunks = [];
  const originalWrite = stdin.write.bind(stdin);
  stdin.write = ((chunk: unknown, ...rest: unknown[]) => {
    stdin.writtenChunks.push(chunk);
    return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof stdin.write;
  emitter.stdin = stdin;
  return emitter;
}

/** Ends one fake invocation: writes a full stdout envelope, then closes. */
function respond(child: ReturnType<typeof makeFakeChild>, envelope: unknown, exitCode = (envelope as {ok?: boolean}).ok ? 0 : 1): void {
  child.stdout.write(JSON.stringify(envelope));
  child.emit('close', exitCode);
}

const CONFIRMATION_PLAN: NonNullable<ChangeSet['plan']> = {
  name: 'my-template',
  from: { origin: 'git:example/tpl@1.0.0', version: '1.0.0' },
  to: { origin: 'git:example/tpl@2.0.0', version: '2.0.0' },
  targets: ['.'],
  operations: [
    { target: '.', path: 'src/App.tsx', op: 'REPLACE' },
    { target: '.', path: 'src/new-file.ts', op: 'ADD' },
    { target: '.', path: 'src/old-file.ts', op: 'REMOVE' },
    { target: '.', path: 'src/local.ts', op: 'KEEP_LOCAL' },
    { target: '.', path: 'src/same.ts', op: 'UNCHANGED' },
  ],
  skipped: [],
};

const DIGEST = 'a'.repeat(64);

const CONFIRMATION_REQUIRED_ENVELOPE = {
  ok: false,
  error: {
    code: 'CONFIRMATION_REQUIRED',
    message: '"my-template"\'s upgrade requires confirmation.',
    details: { name: 'my-template', plan: CONFIRMATION_PLAN, planDigest: DIGEST },
  },
};

const EXPECTED_CHANGE_SET: ChangeSet = {
  templateIdentity: 'my-template',
  baselineVersion: '1.0.0',
  targetVersion: '2.0.0',
  clean: [
    { kind: 'modify', path: 'src/App.tsx' },
    { kind: 'add', path: 'src/new-file.ts' },
    { kind: 'remove', path: 'src/old-file.ts' },
  ],
  conflicts: [],
  plan: CONFIRMATION_PLAN,
  notes: [],
};

describe('createInvokeUpgradeCommand (cpt-frontx-dod-ai-upgrade-orchestration-single-engine)', () => {
  it('spawns the built "frontx upgrade <templateName> <new-origin> --json" command surface, cwd set to the project root, no --yes on the first call', () => {
    const fakeChild = makeFakeChild();
    const spawnFn: SpawnFn = vi.fn(() => fakeChild as never);
    const invoke = createInvokeUpgradeCommand({ frontxBin: 'frontx', spawnFn });

    void invoke('/proj', 'my-template', '2.0.0', async () => 'approved');

    expect(spawnFn).toHaveBeenCalledWith('frontx', ['upgrade', 'my-template', '2.0.0', '--json'], { cwd: '/proj' });
  });

  describe('approved path (two calls)', () => {
    it('parses CONFIRMATION_REQUIRED into a ChangeSet, relays it to onChangeSet, and re-issues the identical command with --yes on approval', async () => {
      const firstChild = makeFakeChild();
      const secondChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn().mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);
      const invoke = createInvokeUpgradeCommand({ frontxBin: 'frontx', spawnFn });

      const onChangeSet = vi.fn(async (changeSet: ChangeSet): Promise<ReviewDecision> => {
        expect(changeSet).toEqual(EXPECTED_CHANGE_SET);
        return 'approved';
      });

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', onChangeSet);

      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);
      await vi.waitFor(() => expect(onChangeSet).toHaveBeenCalledTimes(1));

      // The second invocation is the IDENTICAL command with --yes appended —
      // never a stdin write.
      await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
      expect(spawnFn).toHaveBeenNthCalledWith(1, 'frontx', ['upgrade', 'my-template', '2.0.0', '--json'], { cwd: '/proj' });
      expect(spawnFn).toHaveBeenNthCalledWith(2, 'frontx', ['upgrade', 'my-template', '2.0.0', '--json', '--yes', `--plan-digest=${DIGEST}`], { cwd: '/proj' });

      respond(secondChild, { ok: true, data: { outcome: 'success', plan: { ...CONFIRMATION_PLAN } } });

      const result = await resultPromise;
      expect(result).toEqual({ ok: true, status: 'applied', targetVersion: '2.0.0' });

      expect(firstChild.stdin.writtenChunks).toEqual([]);
      expect(secondChild.stdin.writtenChunks).toEqual([]);
    });

    it('surfaces a failure envelope from the second (--yes) call as apply-failed, with its own code and message', async () => {
      const firstChild = makeFakeChild();
      const secondChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn().mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);
      await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
      respond(secondChild, { ok: false, error: { code: 'TARGETS_EXIST', message: 'A target vanished mid-flight.' } });

      const result = await resultPromise;
      expect(result).toEqual({ ok: false, status: 'apply-failed', code: 'TARGETS_EXIST', message: 'A target vanished mid-flight.' });
    });
  });

  describe('approval bound to the reviewed plan', () => {
    it('reports a plan that changed after review as apply-failed (nothing applied), never as applied', async () => {
      const firstChild = makeFakeChild();
      const secondChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn().mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);
      await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
      respond(secondChild, {
        ok: false,
        error: { code: 'CONFIRMATION_REQUIRED', message: 'plan differs', details: { name: 'my-template', plan: CONFIRMATION_PLAN, planDigest: 'b'.repeat(64) } },
      });

      const result = await resultPromise;
      expect(result).toMatchObject({ ok: false, status: 'apply-failed', code: 'CONFIRMATION_REQUIRED' });
      expect(result.message).toContain('plan changed after it was reviewed');
    });

    it('reports a noop from the confirming call as apply-failed, without asserting that nothing was written', async () => {
      const firstChild = makeFakeChild();
      const secondChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn().mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);
      await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
      respond(secondChild, { ok: true, data: { outcome: 'noop', at: { origin: 'git:example/tpl@2.0.0', version: '2.0.0' } } });

      const result = await resultPromise;
      expect(result).toMatchObject({ ok: false, status: 'apply-failed', code: 'CONFIRMATION_REQUIRED' });
      expect(result.message).toContain('already at the candidate');
      expect(result.message).toContain('the approved upgrade was not applied');
      expect(result.message).not.toContain('nothing was applied');
    });

    it('refuses to confirm unbound when the review envelope carries no planDigest', async () => {
      const firstChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn(() => firstChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });
      const onChangeSet = vi.fn(async (): Promise<ReviewDecision> => 'approved');

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', onChangeSet);
      respond(firstChild, {
        ok: false,
        error: { code: 'CONFIRMATION_REQUIRED', message: 'x', details: { name: 'my-template', plan: CONFIRMATION_PLAN } },
      });

      await expect(resultPromise).rejects.toThrow(/planDigest/);
      expect(onChangeSet).not.toHaveBeenCalled();
      expect(spawnFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('declined path', () => {
    it('makes exactly one invocation, with no --yes anywhere, and never writes to stdin', async () => {
      const firstChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn(() => firstChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });

      const onChangeSet = vi.fn(async (): Promise<ReviewDecision> => 'declined');
      const resultPromise = invoke('/proj', 'my-template', '2.0.0', onChangeSet);

      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);

      const result = await resultPromise;
      expect(result).toEqual({ ok: true, status: 'declined' });

      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(spawnFn).toHaveBeenCalledWith('frontx', ['upgrade', 'my-template', '2.0.0', '--json'], { cwd: '/proj' });
      for (const call of vi.mocked(spawnFn).mock.calls) {
        expect(call[1]).not.toContain('--yes');
      }
      expect(firstChild.stdin.writtenChunks).toEqual([]);
    });
  });

  describe('review failure (cpt-frontx-flow-ai-upgrade-orchestration-upgrade)', () => {
    it('rejects with the review error itself, issues no confirming call, and never writes to stdin', async () => {
      const firstChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn(() => firstChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });
      const reviewError = new Error('enrichment failed');

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => {
        throw reviewError;
      });
      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);

      await expect(resultPromise).rejects.toBe(reviewError);
      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(firstChild.stdin.writtenChunks).toEqual([]);
    });

    it('treats a review that throws synchronously the same way', async () => {
      const firstChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn(() => firstChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });
      const reviewError = new Error('sync failure');

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', (() => {
        throw reviewError;
      }) as unknown as (changeSet: ChangeSet) => Promise<ReviewDecision>);
      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);

      await expect(resultPromise).rejects.toBe(reviewError);
      expect(spawnFn).toHaveBeenCalledTimes(1);
    });

    it('wraps a rejection that is not an Error, keeping its text', async () => {
      const firstChild = makeFakeChild();
      const spawnFn: SpawnFn = vi.fn(() => firstChild as never);
      const invoke = createInvokeUpgradeCommand({ spawnFn });

      const resultPromise = invoke('/proj', 'my-template', '2.0.0', () => Promise.reject('plain text'));
      respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);

      await expect(resultPromise).rejects.toThrow('The change-set review failed: plain text');
      expect(spawnFn).toHaveBeenCalledTimes(1);
    });
  });

  it('short-circuits cleanly on an ok:true first response (idempotent no-op) without calling onChangeSet or invoking a second time', async () => {
    const firstChild = makeFakeChild();
    const spawnFn: SpawnFn = vi.fn(() => firstChild as never);
    const invoke = createInvokeUpgradeCommand({ spawnFn });

    const onChangeSet = vi.fn(async (): Promise<ReviewDecision> => 'approved');
    const resultPromise = invoke('/proj', 'my-template', '2.0.0', onChangeSet);

    respond(firstChild, { ok: true, data: { outcome: 'noop', at: { origin: 'git:example/tpl@2.0.0', version: '2.0.0' } } });

    const result = await resultPromise;
    expect(result).toEqual({ ok: true, status: 'noop', targetVersion: '2.0.0' });
    expect(onChangeSet).not.toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('surfaces a non-CONFIRMATION_REQUIRED failure from the first call with its own code and message, never as unparseable', async () => {
    const firstChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => firstChild as never });

    const onChangeSet = vi.fn(async (): Promise<ReviewDecision> => 'approved');
    const resultPromise = invoke('/proj', 'my-template', '2.0.0', onChangeSet);

    respond(firstChild, { ok: false, error: { code: 'CONTENT_CONFLICT', message: 'A path was modified on both sides.' } });

    const result = await resultPromise;
    expect(result).toEqual({ ok: false, status: 'resolution-failed', code: 'CONTENT_CONFLICT', message: 'A path was modified on both sides.' });
    expect(onChangeSet).not.toHaveBeenCalled();
  });

  it('never writes to the child process stdin at any point in the approved flow', async () => {
    const firstChild = makeFakeChild();
    const secondChild = makeFakeChild();
    const spawnFn: SpawnFn = vi.fn().mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);
    const invoke = createInvokeUpgradeCommand({ spawnFn });

    const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
    respond(firstChild, CONFIRMATION_REQUIRED_ENVELOPE);
    await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
    respond(secondChild, { ok: true, data: { outcome: 'success', plan: CONFIRMATION_PLAN } });
    await resultPromise;

    expect(firstChild.stdin.writtenChunks).toEqual([]);
    expect(secondChild.stdin.writtenChunks).toEqual([]);
  });

  it('fails explicitly (rejects) when the process exits without a parseable JSON envelope', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
    fakeChild.stderr.write('not json at all\n');
    fakeChild.emit('close', 2);

    await expect(resultPromise).rejects.toThrow(/did not emit a parseable JSON envelope/);
  });

  it('fails explicitly (rejects) when the process fails to spawn', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
    fakeChild.emit('error', new Error('ENOENT'));

    await expect(resultPromise).rejects.toThrow(/Failed to spawn/);
  });

  it('fails explicitly (rejects) when CONFIRMATION_REQUIRED details do not carry the expected {name, plan} shape', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', 'my-template', '2.0.0', async () => 'approved');
    respond(fakeChild, { ok: false, error: { code: 'CONFIRMATION_REQUIRED', message: 'needs confirmation', details: { surprise: true } } });

    await expect(resultPromise).rejects.toThrow(/did not carry the expected/);
  });

  it.each([undefined, 'yes', true])('refuses invalid review decision %s', async decision => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child as never);
    const pending = createInvokeUpgradeCommand({ spawnFn })('/p', 'my-template', 'ref', async () => decision as ReviewDecision);
    respond(child, CONFIRMATION_REQUIRED_ENVELOPE);
    await expect(pending).rejects.toThrow('explicit approval');
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    { plan: { ...CONFIRMATION_PLAN, operations: null } },
    { plan: { ...CONFIRMATION_PLAN, operations: [{ op: 'MOVE', path: 'a', target: '.' }] } },
    { plan: { ...CONFIRMATION_PLAN, operations: [{ op: 'ADD', target: '.' }] } },
    { planDigest: 'bogus' },
  ])('rejects malformed details before review', async invalid => {
    const child = makeFakeChild();
    const review = vi.fn();
    const pending = createInvokeUpgradeCommand({ spawnFn: () => child as never })('/p', 'my-template', 'ref', review);
    const { error } = CONFIRMATION_REQUIRED_ENVELOPE;
    respond(child, { ok: false, error: { ...error, details: { ...error.details, ...invalid } } });
    await expect(pending).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });

  it.each([
    ['files', -1, DIGEST],
    ['existing', 0, ''],
    ['files', 0, 'z'.repeat(64)],
  ])('rejects invalid AI file metadata in %s before review', async (field, length, sha256) => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child as never);
    const review = vi.fn();
    const pending = createInvokeUpgradeCommand({ spawnFn })('/p', 'my-template', 'ref', review);
    const { error } = CONFIRMATION_REQUIRED_ENVELOPE;
    const ai = { destination: '.frontx/ai/my-template', changes: [], files: [], existing: [],
      [field]: [{ path: 'a', length, sha256 }] };
    respond(child, { ok: false, error: { ...error, details: { ...error.details, plan: { ...CONFIRMATION_PLAN, ai } } } });
    await expect(pending).rejects.toThrow('did not carry the expected');
    expect(review).not.toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, { origin: 'git:example/tpl@1.0.0' }])('rejects noop without a resolved version', async at => {
    const child = makeFakeChild();
    const review = vi.fn();
    const pending = createInvokeUpgradeCommand({ spawnFn: () => child as never })('/p', 'my-template', 'ref', review);
    respond(child, { ok: true, data: { outcome: 'noop', at } });
    await expect(pending).rejects.toThrow('noop');
    expect(review).not.toHaveBeenCalled();
  });

  it('presents the complete plan when only the AI bundle and version change', async () => {
    const child = makeFakeChild();
    const plan = { ...CONFIRMATION_PLAN, operations: [{ target: '.', path: 'a', op: 'UNCHANGED' }],
      skipped: [{ target: '.', path: 'b', reason: 'RETAINED_GROUND' }], retainedGround: [{ template: 'other', ground: 'b' }],
      ai: { destination: '.frontx/ai/my-template', changes: [{ path: 'locál', kind: 'local-only' }], files: [], existing: [] } };
    const notes = ['Project-only files will be removed'];
    const review = vi.fn(async (changeSet: ChangeSet) => {
      const result = enrichUpgradeChangeSet(changeSet, { name: plan.name, ...plan.from, targets: plan.targets });
      expect(result.status).toBe('enriched');
      if (result.status === 'enriched') expect(JSON.parse(result.package.reviewText!)).toEqual({ plan, notes });
      return 'declined' as const;
    });
    const pending = createInvokeUpgradeCommand({ spawnFn: () => child as never })('/p', plan.name, 'ref', review);
    const raw = Buffer.from(JSON.stringify({ ok: false, error: { ...CONFIRMATION_REQUIRED_ENVELOPE.error,
      details: { name: plan.name, plan, notes, planDigest: DIGEST } } }));
    const split = raw.indexOf(Buffer.from('á')) + 1;
    child.stdout.write(raw.subarray(0, split));
    child.stdout.write(raw.subarray(split));
    child.emit('close', 1);
    await expect(pending).resolves.toMatchObject({ status: 'declined' });
    expect(review).toHaveBeenCalledOnce();
  });

  it.each(['RESOURCE_BUSY', 'RECOVERY_REQUIRED'])('relays %s before and after approval', async code => {
    const refusal = { ok: false, error: { code, message: 'refused', details: { transitionCommitted: code === 'RECOVERY_REQUIRED' } } };
    for (const confirm of [false, true]) {
      const first = makeFakeChild();
      const second = makeFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
      const pending = createInvokeUpgradeCommand({ spawnFn })('/p', 'my-template', 'ref', async () => 'approved');
      respond(first, confirm ? CONFIRMATION_REQUIRED_ENVELOPE : refusal);
      if (confirm) {
        await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
        respond(second, refusal);
      }
      await expect(pending).resolves.toMatchObject({ status: confirm ? 'apply-failed' : 'resolution-failed', code,
        ...(confirm && code === 'RECOVERY_REQUIRED' && { transitionCommitted: true }) });
    }
  });

  it.each(['spawn', 'stderr-only', 'non-json', 'signal', 'exit mismatch', 'unknown outcome', 'review superseded'])(
    'reports confirmation failure: %s', async failure => {
      const first = makeFakeChild();
      const second = makeFakeChild();
      const spawnFn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
      const pending = createInvokeUpgradeCommand({ spawnFn })('/p', 'my-template', 'ref', async () => 'approved');
      respond(first, CONFIRMATION_REQUIRED_ENVELOPE);
      await vi.waitFor(() => expect(spawnFn).toHaveBeenCalledTimes(2));
      switch (failure) {
        case 'spawn': second.emit('error', new Error('ENOENT')); break;
        case 'stderr-only': second.stderr.write('post-commit failure'); second.emit('close', 2); break;
        case 'signal': second.emit('close', null, 'SIGKILL'); break;
        case 'non-json': second.stdout.write('broken'); second.emit('close', 0); break;
        case 'exit mismatch': respond(second, { ok: true, data: { outcome: 'success', plan: CONFIRMATION_PLAN } }, 2); break;
        case 'unknown outcome': respond(second, { ok: true, data: { outcome: 'released' } }); break;
        case 'review superseded': respond(second, { ok: false, error: { code: 'CONFIRMATION_REQUIRED',
          message: 'already at candidate', details: { reviewSuperseded: true } } }); break;
      }
      await expect(pending).resolves.toMatchObject({ status: 'apply-failed', code: failure === 'review superseded' ? 'CONFIRMATION_REQUIRED' : 'OUTCOME_UNKNOWN' });
      expect(spawnFn).toHaveBeenCalledTimes(2);
    });

  it('rejects flag-like template names before spawning', async () => {
    const spawnFn = vi.fn();
    await expect(createInvokeUpgradeCommand({ spawnFn })('/p', '--restore', 'ref', vi.fn())).rejects.toThrow('flag-like');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'output'])('terminates the child on %s before review', async reason => {
    const child = makeFakeChild();
    const review = vi.fn();
    const pending = createInvokeUpgradeCommand({ spawnFn: () => child as never, timeoutMs: 50 })('/p', 'my-template', 'ref', review);
    if (reason === 'output') child.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1));
    await expect(pending).rejects.toThrow(reason === 'timeout' ? 'timed out' : 'output limit');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(review).not.toHaveBeenCalled();
  });

});
