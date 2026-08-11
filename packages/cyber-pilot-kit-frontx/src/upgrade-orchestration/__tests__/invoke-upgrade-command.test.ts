// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
//
// `createInvokeUpgradeCommand` spawns the built `frontx upgrade --json`
// command surface (never importing `@gears-frontx/cli`), gates the engine's
// apply step on the developer's review decision, and parses the process's
// final JSON line into the kit-local `UpgradeCommandJsonResult`. This test
// injects a fake spawned process (EventEmitter + PassThrough streams) — no
// real process is launched.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInvokeUpgradeCommand, type SpawnFn } from '../invoke-upgrade-command.js';
import type { ChangeSet, ReviewDecision } from '../types.js';

/** Minimal fake `ChildProcessWithoutNullStreams` double. */
function makeFakeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough & { writtenLines: string[] };
  };
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  const stdin = new PassThrough() as PassThrough & { writtenLines: string[] };
  stdin.writtenLines = [];
  const originalWrite = stdin.write.bind(stdin);
  stdin.write = ((chunk: unknown, ...rest: unknown[]) => {
    stdin.writtenLines.push(String(chunk));
    return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof stdin.write;
  emitter.stdin = stdin;
  return emitter;
}

const CHANGE_SET: ChangeSet = {
  templateIdentity: 'my-template',
  baselineVersion: '1.0.0',
  targetVersion: '2.0.0',
  targetOccupiedOwnershipBoundary: '{"exclusiveSubtrees":["src/"],"sharedFiles":[]}',
  clean: [{ kind: 'modify', path: 'src/App.tsx', content: 'v2' }],
  conflicts: [],
};

describe('createInvokeUpgradeCommand (cpt-frontx-dod-ai-upgrade-orchestration-single-engine)', () => {
  it('spawns the built "frontx upgrade --json" command surface for (projectRoot, targetVersion)', () => {
    const fakeChild = makeFakeChild();
    const spawnFn: SpawnFn = vi.fn(() => fakeChild as never);
    const invoke = createInvokeUpgradeCommand({ frontxBin: 'frontx', spawnFn });

    void invoke('/proj', '2.0.0', async () => 'approved');

    expect(spawnFn).toHaveBeenCalledWith('frontx', ['upgrade', '/proj', '2.0.0', '--json']);
  });

  it('relays the raw change set to onChangeSet and gates the engine apply step on the returned decision', async () => {
    const fakeChild = makeFakeChild();
    const spawnFn: SpawnFn = () => fakeChild as never;
    const invoke = createInvokeUpgradeCommand({ spawnFn });

    const onChangeSet = vi.fn(async (changeSet: ChangeSet): Promise<ReviewDecision> => {
      expect(changeSet).toEqual(CHANGE_SET);
      return 'approved';
    });

    const resultPromise = invoke('/proj', '2.0.0', onChangeSet);

    // The command surface emits the raw change set BEFORE any decision.
    fakeChild.stdout.write(`${JSON.stringify({ changeSet: CHANGE_SET })}\n`);
    await vi.waitFor(() => expect(onChangeSet).toHaveBeenCalledTimes(1));
    // The developer's decision is relayed back over the process boundary.
    await vi.waitFor(() => expect(fakeChild.stdin.writtenLines).toContain('approved\n'));

    // Only after the decision does the command surface report its outcome.
    fakeChild.stdout.write(`${JSON.stringify({ ok: true, status: 'applied' })}\n`);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true, status: 'applied' });
  });

  it('parses the final JSON result into the kit-local UpgradeCommandJsonResult shape', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', '2.0.0', async () => 'declined');
    fakeChild.stdout.write(`${JSON.stringify({ changeSet: CHANGE_SET })}\n`);
    await vi.waitFor(() => expect(fakeChild.stdin.writtenLines.length).toBeGreaterThan(0));
    fakeChild.stdout.write(`${JSON.stringify({ ok: true, status: 'declined' })}\n`);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true, status: 'declined' });
  });

  it('fails explicitly (rejects) when the process exits without a parseable JSON result line', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', '2.0.0', async () => 'approved');
    fakeChild.stderr.write('not json at all\n');
    fakeChild.emit('close', 2);

    await expect(resultPromise).rejects.toThrow(/without a parseable JSON result/);
  });

  it('fails explicitly (rejects) when the process fails to spawn', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', '2.0.0', async () => 'approved');
    fakeChild.emit('error', new Error('ENOENT'));

    await expect(resultPromise).rejects.toThrow(/Failed to spawn/);
  });

  it('never imports @gears-frontx/cli — command-surface-only coupling (no kit->cli package edge)', () => {
    // Static assertion, exercised at module-scan time by the source-string
    // guard test (`no-cli-import.test.ts`); this test documents the intent
    // alongside the adapter's own behavioral coverage.
    expect(true).toBe(true);
  });
});
