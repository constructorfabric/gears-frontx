// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
//
// Mocked-child-process coverage for the runner's orchestration layer.
//
// The pure helpers (arg parsing, path inference, project discovery) are
// covered by `scripts/run-monorepo-unit-tests.test.mjs`. This file focuses on
// the stateful `spawnProject` / `waitForExit` / `runSequentially` /
// `runInParallel` flow — behaviors that historically regressed silently
// (dead-code SIGKILL escalation, immediate timeout rejection, listener
// leaks) and can only be exercised by simulating spawn lifecycles.
import { EventEmitter } from 'node:events';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  npmSpawnArgs,
  resetSpawnImpl,
  setSpawnImpl,
  spawnProject,
  waitForExit,
} from './spawning.mjs';
import {
  runCli,
  runInParallel,
  runInWatchMode,
  runSequentially,
} from './cli.mjs';

// Prefer dependency injection (`setSpawnImpl`) over `vi.mock('node:child_process')`.
// Mocking Node built-ins via `importOriginal` is fragile in Vitest 4 (ESM
// module-graph caching + node: prefix handling), and when the mock silently
// fails, the tests spawn real `npm run _test:unit:host` subprocesses —
// creating an infinite recursion of nested vitest runs. A typed injection
// point in the module itself keeps tests deterministic and makes the
// "test-only" seam explicit.
/** @type {import('vitest').Mock} */
const spawnMock = vi.fn();

/**
 * Minimal ChildProcess stand-in. Real children emit `exit`, `error`, and
 * respond to `kill(signal)`; that's the entire surface `waitForExit`
 * consumes, so we implement just those.
 */
class FakeChild extends EventEmitter {
  constructor({ autoExitWith } = {}) {
    super();
    this.killed = false;
    /** @type {NodeJS.Signals[]} */
    this.signalsReceived = [];
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    if (autoExitWith !== undefined) {
      queueMicrotask(() => this.emit('exit', autoExitWith, null));
    }
  }

  /** @param {NodeJS.Signals} [signal] */
  kill(signal = 'SIGTERM') {
    this.signalsReceived.push(signal);
    this.killed = true;
    return true;
  }
}

beforeEach(() => {
  setSpawnImpl(spawnMock);
});

afterEach(() => {
  spawnMock.mockReset();
  resetSpawnImpl();
  vi.useRealTimers();
});

describe('npmSpawnArgs (routing contract)', () => {
  it('routes host projects to the `_test:unit:host` script', () => {
    expect(
      npmSpawnArgs({ kind: 'host', name: 'host-app', rootPath: 'src' }, 'run', []),
    ).toEqual(['run', '_test:unit:host']);
  });

  it('routes host watch mode to the host watch script', () => {
    expect(
      npmSpawnArgs({ kind: 'host', name: 'host-app', rootPath: 'src' }, 'watch', []),
    ).toEqual(['run', '_test:unit:host:watch']);
  });

  it('routes workspace projects via `npm run -w <workspace>`', () => {
    const project = {
      kind: 'workspace',
      name: 'api',
      workspace: '@gears-frontx/api',
      rootPath: 'packages/api',
      hasWatchScript: true,
    };
    expect(npmSpawnArgs(project, 'run', [])).toEqual([
      'run',
      'test:unit',
      '-w',
      '@gears-frontx/api',
    ]);
  });

  it('routes MFE projects via a local `test:unit` invocation (no -w)', () => {
    const project = {
      kind: 'mfe',
      name: 'demo-mfe',
      cwd: '/repo/src/mfe_packages/demo-mfe',
      rootPath: 'src/mfe_packages/demo-mfe',
    };
    expect(npmSpawnArgs(project, 'run', [])).toEqual(['run', 'test:unit']);
  });

  it('appends rewritten forward args after a `--` separator', () => {
    const project = {
      kind: 'workspace',
      name: 'api',
      workspace: '@gears-frontx/api',
      rootPath: 'packages/api',
      hasWatchScript: true,
    };
    const args = npmSpawnArgs(project, 'run', [
      'packages/api/src/foo.test.ts',
      '--reporter=verbose',
    ]);
    expect(args).toEqual([
      'run',
      'test:unit',
      '-w',
      '@gears-frontx/api',
      '--',
      'src/foo.test.ts',
      '--reporter=verbose',
    ]);
  });
});

describe('spawnProject', () => {
  it('delegates to child_process.spawn and returns the child handle', () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValue(fake);

    const result = spawnProject(
      { kind: 'host', name: 'host-app', rootPath: 'src' },
      'run',
      [],
    );

    expect(result.child).toBe(fake);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toMatch(/npm(\.cmd)?$/);
    expect(args).toEqual(['run', '_test:unit:host']);
    expect(options.stdio).toBe('inherit');
    expect(options.env).toBe(process.env);
  });

  it('captures stdout+stderr into the bounded buffer in buffered mode', () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValue(fake);

    const { getOutput } = spawnProject(
      { kind: 'host', name: 'host-app', rootPath: 'src' },
      'run',
      [],
      { buffered: true },
    );

    fake.stdout.emit('data', Buffer.from('hello '));
    fake.stderr.emit('data', Buffer.from('world'));

    expect(getOutput()).toBe('hello world');
    // Buffered mode MUST request piped stdio so the orchestrator can capture
    // output per-child instead of inheriting the TTY directly.
    const [, , options] = spawnMock.mock.calls[0];
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('returns an empty string for getOutput when buffered is false', () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValue(fake);

    const { getOutput } = spawnProject(
      { kind: 'host', name: 'host-app', rootPath: 'src' },
      'run',
      [],
    );

    expect(getOutput()).toBe('');
  });
});

describe('waitForExit', () => {
  it('resolves with the child exit code on clean exit', async () => {
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api');
    fake.emit('exit', 0, null);
    await expect(pending).resolves.toBe(0);
  });

  it('resolves with a non-zero code when the child fails without a signal', async () => {
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api');
    fake.emit('exit', 7, null);
    await expect(pending).resolves.toBe(7);
  });

  it('resolves with 1 when the child exits with a null code but no signal', async () => {
    // Node reports `{ code: null, signal: null }` for certain abnormal exits
    // (e.g. spawn-time failures that still surface as `exit`). The runner
    // must treat those as failures rather than resolving with `null`.
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api');
    fake.emit('exit', null, null);
    await expect(pending).resolves.toBe(1);
  });

  it('rejects when the child exits via a signal', async () => {
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api');
    fake.emit('exit', null, 'SIGKILL');
    await expect(pending).rejects.toThrow(/exited via signal SIGKILL/);
  });

  it('rejects when the child emits `error` before `exit`', async () => {
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api');
    fake.emit('error', new Error('spawn ENOENT'));
    await expect(pending).rejects.toThrow(/spawn ENOENT/);
  });

  it('escalates SIGTERM to SIGKILL when the child ignores the first signal', async () => {
    vi.useFakeTimers();
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api', { timeoutMs: 100 });
    // Swallow the rejection (we assert via signalsReceived) so unhandled
    // rejection warnings don't fail the suite.
    pending.catch(() => {});

    // Timeout fires: SIGTERM must be sent immediately.
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.signalsReceived).toEqual(['SIGTERM']);

    // After the 5-second grace window, SIGKILL must fire. Previously the
    // implementation gated this on `!child.killed`, which is already true
    // right after SIGTERM — so the escalation was dead code. The fix tracks
    // actual exit, not the `killed` flag.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fake.signalsReceived).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('waits for the child to exit before rejecting on timeout (bounded teardown)', async () => {
    vi.useFakeTimers();
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api', { timeoutMs: 100 });

    // Timeout fires and SIGTERM is sent, but we have NOT seen the child
    // exit yet. The promise must still be pending — if it rejected here,
    // sequential mode would spawn the next project while the previous one
    // is still tearing down.
    await vi.advanceTimersByTimeAsync(100);
    let settled = false;
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    // Child honors SIGTERM before the 5s grace → promise rejects with the
    // timeout message (not the "signal SIGTERM" message, because this was a
    // timeout-driven teardown, not an unsolicited signal exit).
    fake.emit('exit', null, 'SIGTERM');
    await expect(pending).rejects.toThrow(/timed out after 100ms/);
  });

  it('rejects with a hard-deadline message when the child survives SIGKILL', async () => {
    vi.useFakeTimers();
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api', { timeoutMs: 100 });
    // Register a no-op rejection handler synchronously so Node doesn't
    // flag the upcoming rejection as "unhandled" when the hard-deadline
    // timer fires inside `advanceTimersByTimeAsync`. `expect(...).rejects`
    // below is the assertion that actually consumes the rejection.
    pending.catch(() => {});

    await vi.advanceTimersByTimeAsync(100); // SIGTERM
    await vi.advanceTimersByTimeAsync(5_000); // SIGKILL
    await vi.advanceTimersByTimeAsync(5_000); // hard deadline
    await expect(pending).rejects.toThrow(/did not exit within .*SIGKILL/);
  });

  it('does not install a timer when timeoutMs is 0 or omitted', async () => {
    // `--timeout=0` means "disable the guard" (useful when debugging a hang
    // with a debugger attached). A spurious timer here would kill the
    // attached session after the default delay.
    vi.useFakeTimers();
    const fake = new FakeChild();
    const pending = waitForExit(fake, 'api', { timeoutMs: 0 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.signalsReceived).toEqual([]);
    fake.emit('exit', 0, null);
    await expect(pending).resolves.toBe(0);
  });
});

describe('runSequentially', () => {
  const projects = [
    { kind: 'host', name: 'host-app', rootPath: 'src' },
    {
      kind: 'workspace',
      name: 'api',
      workspace: '@gears-frontx/api',
      rootPath: 'packages/api',
      hasWatchScript: true,
    },
  ];

  it('returns 0 when every project exits cleanly and runs them in order', async () => {
    const spawnedNames = [];
    let callIndex = 0;
    spawnMock.mockImplementation(() => {
      const name = projects[callIndex++].name;
      spawnedNames.push(name);
      return new FakeChild({ autoExitWith: 0 });
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await runSequentially(projects, []);

    expect(code).toBe(0);
    expect(spawnedNames).toEqual(['host-app', 'api']);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('records a per-project failure but keeps auditing the rest of the tree', async () => {
    const exits = [0, 7];
    spawnMock.mockImplementation(() => new FakeChild({ autoExitWith: exits.shift() ?? 0 }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await runSequentially(projects, []);

    expect(code).toBe(1);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    // Failing project must appear in the error summary so operators can
    // see which child tripped the aggregate failure.
    const printed = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printed).toContain('api');
    expect(printed).toContain('exit 7');
  });

  it('converts a timeout into a failed result without aborting remaining projects', async () => {
    vi.useFakeTimers();
    const firstChild = new FakeChild();
    /** @type {FakeChild | null} */
    let secondChild = null;
    // Construct the second child lazily inside the spawn mock so its
    // auto-exit microtask is only queued AFTER `waitForExit` has installed
    // its `exit` listener on this specific child. Constructing it eagerly
    // at test setup drains the microtask into the void.
    spawnMock
      .mockImplementationOnce(() => firstChild)
      .mockImplementationOnce(() => {
        secondChild = new FakeChild();
        queueMicrotask(() => secondChild?.emit('exit', 0, null));
        return secondChild;
      });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = runSequentially(projects, [], { timeoutMs: 50 });
    // Suppress the unhandled-rejection observer warning — the rejection is
    // handled inside `runSequentially` but Node still logs a transient
    // "handled asynchronously" notice we don't want in test output.
    pending.catch(() => {});

    // Let the first project time out and send SIGTERM.
    await vi.advanceTimersByTimeAsync(50);
    expect(firstChild.signalsReceived).toEqual(['SIGTERM']);

    // First child finally honors SIGTERM → waitForExit rejects with the
    // timeout message → runSequentially records {code: 1} and moves on.
    firstChild.emit('exit', null, 'SIGTERM');
    // Drain the rejection + microtask queue so the for-loop advances.
    await vi.advanceTimersByTimeAsync(0);
    // Now the second project spawns; its queued auto-exit fires on the
    // next microtask drain.
    await vi.advanceTimersByTimeAsync(0);

    const code = await pending;
    expect(code).toBe(1);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    const printed = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printed).toContain('timed out after 50ms');
  });
});

describe('runInParallel', () => {
  const projects = [
    { kind: 'host', name: 'host-app', rootPath: 'src' },
    {
      kind: 'workspace',
      name: 'api',
      workspace: '@gears-frontx/api',
      rootPath: 'packages/api',
      hasWatchScript: true,
    },
  ];

  it('spawns every project concurrently and aggregates to 0 on full success', async () => {
    spawnMock.mockImplementation(() => new FakeChild({ autoExitWith: 0 }));

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = await runInParallel(projects, []);

    expect(code).toBe(0);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    // Each child gets a `==> <name>` header so concurrent logs don't
    // interleave character-by-character.
    const headers = logSpy.mock.calls.flat().filter((line) => /^\n?==> /.test(line));
    expect(headers).toHaveLength(2);
    stdoutSpy.mockRestore();
  });

  it('flushes buffered output on failure and reports per-project exit codes', async () => {
    const failing = new FakeChild();
    const passing = new FakeChild({ autoExitWith: 0 });
    const order = [failing, passing];
    spawnMock.mockImplementation(() => order.shift());

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const pending = runInParallel(projects, []);
    failing.stdout.emit('data', Buffer.from('captured failure output\n'));
    queueMicrotask(() => failing.emit('exit', 7, null));

    const code = await pending;
    expect(code).toBe(1);
    const flushed = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(flushed).toContain('captured failure output');
    const printedErrors = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printedErrors).toContain('host-app failed with exit code 7');
    stdoutSpy.mockRestore();
  });
});

describe('runInWatchMode listener hygiene', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('does not leak SIGINT/SIGTERM listeners across invocations', async () => {
    // Pre-fix this function called `process.on(...)` unconditionally, so
    // every watch invocation appended a fresh pair of listeners without
    // ever removing them — Node would eventually log a
    // `MaxListenersExceededWarning` in long-lived tool sessions.
    const initialSigint = process.listenerCount('SIGINT');
    const initialSigterm = process.listenerCount('SIGTERM');

    for (let i = 0; i < 5; i++) {
      const fake = new FakeChild({ autoExitWith: 0 });
      spawnMock.mockReturnValueOnce(fake);
      await runInWatchMode(
        { kind: 'host', name: 'host-app', rootPath: 'src' },
        [],
      );
    }

    expect(process.listenerCount('SIGINT')).toBe(initialSigint);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigterm);
  });
});

describe('runCli', () => {
  /** @type {string[]} */
  let originalArgv;

  beforeEach(() => {
    originalArgv = process.argv;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('prints usage and returns 0 when --help is passed, without spawning anything', async () => {
    process.argv = ['node', 'run-monorepo-unit-tests.mjs', '--help'];
    const code = await runCli();
    expect(code).toBe(0);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
