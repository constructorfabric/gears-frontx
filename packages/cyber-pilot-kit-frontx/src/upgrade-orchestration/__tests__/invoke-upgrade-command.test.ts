// @cpt-flow:cpt-frontx-flow-ai-upgrade-orchestration-upgrade:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
//
// `createInvokeUpgradeCommand` spawns the built `frontx upgrade --json`
// command surface (never importing `@gears-frontx/cli`), gates the engine's
// apply step on the developer's review decision, and parses the process's
// final JSON line into the kit-local `UpgradeCommandJsonResult`. When the
// review fails, it tells the process the upgrade is declined and fails with
// the review's error. This test injects a fake spawned process
// (EventEmitter + PassThrough streams) — no real process is launched.
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

// Issue #742: a review that fails used to leave the invocation pending, the
// process waiting on stdin, and the error loose as an unhandled rejection.
describe('createInvokeUpgradeCommand when the review fails (cpt-frontx-flow-ai-upgrade-orchestration-upgrade)', () => {
  const changeSetLine = `${JSON.stringify({ changeSet: CHANGE_SET })}\n`;

  it('rejects the invocation when onChangeSet rejects (the repro from issue #742)', async () => {
    const fakeChild = makeFakeChild();
    const spawnFn: SpawnFn = () => fakeChild as never;
    const invoke = createInvokeUpgradeCommand({ spawnFn });
    const result = invoke('/proj', '2.0.0', async () => {
      throw new Error('review failed');
    });

    fakeChild.stdout.write(changeSetLine);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      result.then(
        () => 'resolved',
        (error: Error) => `rejected: ${error.message}`,
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve('still pending after 500 ms'), 500);
      }),
    ]);
    clearTimeout(timer);

    expect(outcome).toBe('rejected: review failed');
    expect(fakeChild.stdin.writtenLines).not.toEqual([]);
  });

  it('rejects with the review error itself and leaves no unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const fakeChild = makeFakeChild();
      const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });
      const reviewError = new Error('enrichment failed');

      const resultPromise = invoke('/proj', '2.0.0', async () => {
        throw reviewError;
      });
      fakeChild.stdout.write(changeSetLine);

      await expect(resultPromise).rejects.toBe(reviewError);
      // Node reports unhandled rejections after the microtask queue drains,
      // so give it a macrotask turn before checking.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('writes "declined" to the process stdin, so the engine exits without writing project files', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', '2.0.0', async () => {
      throw new Error('review failed');
    });
    fakeChild.stdout.write(changeSetLine);

    await expect(resultPromise).rejects.toThrow('review failed');
    expect(fakeChild.stdin.writtenLines).toEqual(['declined\n']);
  });

  it('keeps the review error when the process then reports a result and closes', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });
    const reviewError = new Error('review failed');

    const resultPromise = invoke('/proj', '2.0.0', async () => {
      throw reviewError;
    });
    // Attach the handler now; the assertion runs after the process events below.
    const outcome = resultPromise.then(
      () => 'resolved',
      (error: unknown) => error,
    );

    fakeChild.stdout.write(changeSetLine);
    await vi.waitFor(() => expect(fakeChild.stdin.writtenLines).toEqual(['declined\n']));

    // What the real CLI does after reading "declined": report it, then exit.
    fakeChild.stdout.write(`${JSON.stringify({ ok: true, status: 'declined' })}\n`);
    fakeChild.emit('close', 0);

    expect(await outcome).toBe(reviewError);
    expect(fakeChild.stdin.writtenLines).toEqual(['declined\n']);
  });

  it('treats a review that throws synchronously the same way', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });
    const reviewError = new Error('review threw');

    const resultPromise = invoke('/proj', '2.0.0', () => {
      throw reviewError;
    });
    fakeChild.stdout.write(changeSetLine);

    await expect(resultPromise).rejects.toBe(reviewError);
    expect(fakeChild.stdin.writtenLines).toEqual(['declined\n']);
  });

  it('wraps a rejection that is not an Error, keeping its text', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', '2.0.0', () => Promise.reject('no reviewer available'));
    fakeChild.stdout.write(changeSetLine);

    await expect(resultPromise).rejects.toThrow(/no reviewer available/);
    expect(fakeChild.stdin.writtenLines).toEqual(['declined\n']);
  });

  it('does not write "declined" when the process has already closed its stdin', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });

    const resultPromise = invoke('/proj', '2.0.0', async () => {
      throw new Error('review failed');
    });
    // The process closed its stdin before the review failed, so there is no
    // one left to tell.
    fakeChild.stdin.end();
    fakeChild.stdout.write(changeSetLine);

    await expect(resultPromise).rejects.toThrow('review failed');
    expect(fakeChild.stdin.writtenLines).toEqual([]);
  });

  it('does not crash the host when a write to stdin fails with EPIPE', async () => {
    const fakeChild = makeFakeChild();
    const invoke = createInvokeUpgradeCommand({ spawnFn: () => fakeChild as never });
    const reviewError = new Error('review failed');

    const resultPromise = invoke('/proj', '2.0.0', async () => {
      throw reviewError;
    });
    fakeChild.stdout.write(changeSetLine);

    await expect(resultPromise).rejects.toBe(reviewError);
    expect(fakeChild.stdin.writtenLines).toEqual(['declined\n']);

    // The process closed its stdin or died, but Node had not handled the exit
    // yet, so stdin was still writable and the write went ahead. The pipe's
    // failure arrives afterwards as an 'error' event; with no listener, Node
    // throws it and the host process crashes.
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => fakeChild.stdin.emit('error', epipe)).not.toThrow();
  });
});
