/**
 * Child-process spawning and lifecycle helpers for the monorepo runner.
 *
 * All stateful interactions with `child_process.spawn` live here so the rest
 * of the runner stays pure (arg parsing) or orchestration-only (CLI flow).
 * Unit tests exercise `npmSpawnArgs`, `spawnOptionsFor`, and `aggregateExitCode`
 * directly; `spawnProject` and `waitForExit` are covered end-to-end by the CLI
 * tests that actually spin up processes.
 */
import { spawn as realSpawn } from 'node:child_process';
import process from 'node:process';
import {
  defaultParallelBufferBytes,
  defaultRepoRoot,
  npmCommand,
} from './common.mjs';
import { rewriteForwardArgsForProject } from './routing.mjs';

/**
 * Injectable `spawn` reference. Tests that exercise `spawnProject` /
 * `runSequentially` / `runInParallel` without touching the real `npm run`
 * pipeline replace this via `setSpawnImpl`. Production code always uses the
 * real `node:child_process` export; the indirection is test-only.
 *
 * @type {typeof realSpawn}
 */
let currentSpawn = realSpawn;

/**
 * Swap the `spawn` implementation the runner uses for child processes.
 * Passing `null`/`undefined` (or calling `resetSpawnImpl`) restores the
 * real `node:child_process` export. Intended for unit tests only —
 * production callers must not touch this.
 *
 * @param {typeof realSpawn | null | undefined} impl
 */
export function setSpawnImpl(impl) {
  currentSpawn = impl ?? realSpawn;
}

/** Restore the real `node:child_process` spawn. */
export function resetSpawnImpl() {
  currentSpawn = realSpawn;
}

/**
 * @param {import('./common.mjs').Project} project
 * @param {'run' | 'watch'} mode
 * @param {string[]} forwardArgs
 * @returns {string[]}
 */
export function npmSpawnArgs(project, mode, forwardArgs) {
  /** @type {string[]} */
  let args;

  if (project.kind === 'host') {
    const script = mode === 'watch' ? '_test:unit:host:watch' : '_test:unit:host';
    args = ['run', script];
  } else if (project.kind === 'workspace') {
    const script = mode === 'watch' ? 'test:unit:watch' : 'test:unit';
    args = ['run', script, '-w', project.workspace];
  } else {
    const script = mode === 'watch' ? 'test:unit:watch' : 'test:unit';
    args = ['run', script];
  }

  const rewritten = rewriteForwardArgsForProject(project, forwardArgs);
  if (rewritten.length > 0) {
    args.push('--', ...rewritten);
  }

  return args;
}

/**
 * Compute the `spawn` options for a project invocation. Extracted as a pure
 * helper so unit tests can assert the routing (cwd + stdio) without actually
 * spawning a child process. When `buffered` is true the child's stdout and
 * stderr are piped so the orchestrator can collect and flush them per-project
 * instead of interleaving them character-by-character into the parent's tty.
 *
 * @param {import('./common.mjs').Project} project
 * @param {{ buffered?: boolean }} [options]
 * @returns {{ cwd: string; stdio: 'inherit' | ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv }}
 */
export function spawnOptionsFor(project, { buffered = false } = {}) {
  const cwd = project.kind === 'mfe' ? project.cwd : defaultRepoRoot;
  /** @type {'inherit' | ['ignore', 'pipe', 'pipe']} */
  const stdio = buffered ? ['ignore', 'pipe', 'pipe'] : 'inherit';
  return { cwd, stdio, env: process.env };
}

/**
 * Build a bounded-memory accumulator for a child's stdout+stderr.
 *
 * Parallel runs need per-child buffering so the final flush can label each
 * block with its project name — but a chatty child (verbose reporter across
 * a thousand-file suite) can otherwise grow the buffer unbounded and OOM
 * the CI runner. `maxBytes` caps the live buffer; when an incoming chunk
 * pushes past the cap we drop the oldest chunks first and flip a `truncated`
 * flag so the final output gets a clear marker explaining that early output
 * was discarded. Exported primarily so unit tests can drive it without
 * spawning children.
 *
 * @param {number} maxBytes
 */
export function createBoundedBuffer(maxBytes) {
  /** @type {Buffer[]} */
  const chunks = [];
  let totalBytes = 0;
  let truncated = false;

  return {
    /** @param {Buffer} chunk */
    append(chunk) {
      chunks.push(chunk);
      totalBytes += chunk.length;
      // Drop oldest chunks until we fit under the cap. The `chunks.length > 1`
      // guard keeps at least the newest chunk even when a single write is
      // bigger than the cap itself — callers still want the trailing bytes.
      while (totalBytes > maxBytes && chunks.length > 1) {
        // `chunks.length > 1` guarantees `shift()` returns an element, not
        // `undefined` — TS can't see that loop invariant, so document it.
        const dropped = /** @type {Buffer} */ (chunks.shift());
        totalBytes -= dropped.length;
        truncated = true;
      }
      if (totalBytes > maxBytes && chunks.length === 1) {
        // Single oversized chunk: slice its tail so we keep the most recent
        // `maxBytes` and still surface the truncation banner to the reader.
        const only = chunks[0];
        chunks[0] = only.subarray(only.length - maxBytes);
        totalBytes = chunks[0].length;
        truncated = true;
      }
    },
    read() {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!truncated) return body;
      return (
        `[run-monorepo-unit-tests] output truncated to last ${maxBytes} bytes; oldest chunks dropped.\n` +
        body
      );
    },
    get isTruncated() {
      return truncated;
    },
  };
}

/**
 * @param {import('./common.mjs').Project} project
 * @param {'run' | 'watch'} mode
 * @param {string[]} forwardArgs
 * @param {{ buffered?: boolean; maxBufferedBytes?: number }} [options]
 * @returns {{ child: import('node:child_process').ChildProcess; getOutput: () => string }}
 */
export function spawnProject(project, mode, forwardArgs, options = {}) {
  const { buffered = false, maxBufferedBytes = defaultParallelBufferBytes } = options;
  const child = currentSpawn(
    npmCommand,
    npmSpawnArgs(project, mode, forwardArgs),
    spawnOptionsFor(project, { buffered }),
  );

  const buffer = createBoundedBuffer(maxBufferedBytes);
  if (buffered) {
    child.stdout?.on('data', (chunk) => buffer.append(chunk));
    child.stderr?.on('data', (chunk) => buffer.append(chunk));
  }

  return {
    child,
    getOutput: () => (buffered ? buffer.read() : ''),
  };
}

/** Grace window between SIGTERM and SIGKILL. */
const sigtermGraceMs = 5_000;
/** Hard deadline after SIGKILL before we give up waiting for exit and reject. */
const sigkillGraceMs = 5_000;

/**
 * Wait for a spawned child to exit. Rejects on spawn error, signal exit, or
 * timeout. On timeout the child is sent `SIGTERM` first; if it's still alive
 * after a 5-second grace window it's upgraded to `SIGKILL`. The returned
 * promise deliberately does NOT resolve/reject the instant the timeout fires
 * — it waits for the child's own `exit` event (or a hard SIGKILL deadline)
 * so callers observe complete teardown before starting the next project.
 *
 * Two bugs the explicit `hasExited` flag fixes:
 *  - `child.killed` flips to `true` the moment `.kill('SIGTERM')` is
 *    delivered, so a naive `if (!child.killed) child.kill('SIGKILL')` gate
 *    never fires — the escalation was dead code. We now gate on actual
 *    exit instead.
 *  - The previous implementation rejected immediately on timeout, letting
 *    the next sequential project spawn while the previous child was still
 *    tearing down. Sequential mode now sees the timeout rejection only
 *    after the child has actually exited (or we've given up on SIGKILL).
 *
 * @param {import('./common.mjs').SpawnedChildLike} child
 * @param {string} projectName
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<number>}
 */
export function waitForExit(child, projectName, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    /** @type {NodeJS.Timeout | undefined} */
    let timeoutTimer;
    /** @type {NodeJS.Timeout | undefined} */
    let sigkillTimer;
    /** @type {NodeJS.Timeout | undefined} */
    let hardDeadlineTimer;
    let hasExited = false;
    let timedOut = false;

    const clearTimers = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      if (hardDeadlineTimer) clearTimeout(hardDeadlineTimer);
    };

    /** @param {NodeJS.Signals} signal */
    const safeKill = (signal) => {
      try {
        child.kill(signal);
      } catch {
        // Child already dead or signal delivery failed (e.g. permissions);
        // the `exit` handler or hard deadline will still finish the promise.
      }
    };

    const scheduleHardDeadline = () => {
      hardDeadlineTimer = setTimeout(() => {
        if (hasExited) return;
        // SIGKILL cannot be ignored on POSIX; a child still alive here is
        // stuck in an uninterruptible state (disk wait, zombie parent).
        // Reject so CI fails loudly instead of hanging forever.
        reject(
          new Error(
            `${projectName} timed out after ${timeoutMs}ms and did not exit within ${sigtermGraceMs + sigkillGraceMs}ms of SIGKILL.`,
          ),
        );
      }, sigkillGraceMs);
      hardDeadlineTimer.unref?.();
    };

    const scheduleSigkill = () => {
      sigkillTimer = setTimeout(() => {
        if (hasExited) return;
        safeKill('SIGKILL');
        scheduleHardDeadline();
      }, sigtermGraceMs);
      sigkillTimer.unref?.();
    };

    const handleTimeout = () => {
      if (hasExited) return;
      timedOut = true;
      safeKill('SIGTERM');
      scheduleSigkill();
    };

    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(handleTimeout, timeoutMs);
      timeoutTimer.unref?.();
    }

    child.once('error', (err) => {
      hasExited = true;
      clearTimers();
      reject(err);
    });
    child.once('exit', (code, signal) => {
      hasExited = true;
      clearTimers();
      if (timedOut) {
        reject(
          new Error(`${projectName} timed out after ${timeoutMs}ms; sent SIGTERM.`),
        );
        return;
      }
      if (signal) {
        reject(new Error(`${projectName} exited via signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

/**
 * Collapse per-child exit codes into the runner's overall exit code.
 *
 * Historically this returned the first-seen failing child's exit code, which
 * leaks child-specific error codes (e.g. Vitest's 1 vs 7 vs 130) and makes the
 * aggregate return value depend on iteration order. We now return a flat `1`
 * on any failure so CI contracts stay stable regardless of which child ran
 * first. Per-child codes are still logged in the failure summary for operator
 * visibility.
 *
 * @param {{ name: string; code: number }[]} results
 * @returns {number}
 */
export function aggregateExitCode(results) {
  return results.some((result) => result.code !== 0) ? 1 : 0;
}
