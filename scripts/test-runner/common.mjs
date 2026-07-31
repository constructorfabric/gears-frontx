/**
 * Shared primitives for the monorepo test-runner submodules.
 *
 * Keeping these in one file avoids duplicating the repo-root resolution and
 * the `CliError` class across `args`, `discovery`, `routing`, `spawning`, and
 * `cli`. The submodules stay narrow and import from here instead of
 * cross-referencing each other for stray constants.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root resolved from this file's on-disk location (scripts/test-runner/). */
export const defaultRepoRoot = path.resolve(__dirname, '..', '..');

/** npm binary used for child-process spawns (Windows needs the `.cmd` shim). */
export const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Default per-child timeout for non-interactive runs. 15 minutes is well above
 * the slowest observed suite while still protecting CI from an indefinitely
 * hung child (the common failure mode before this guard existed). Override
 * via `--timeout=<ms>` on the CLI; pass `--timeout=0` to disable.
 */
export const defaultProjectTimeoutMs = 15 * 60 * 1000;

/** Project picked by `--watch` when no `--project` / path narrows the run. */
export const defaultWatchProjectName = 'repo-scripts';

/**
 * Maximum bytes buffered per parallel child before oldest chunks are dropped.
 * The runner buffers stdout+stderr of every concurrent child so the final
 * flush can label each block with its project name. Without a cap, a chatty
 * child (e.g. verbose reporters on a thousand-file suite) can exhaust memory
 * in CI. 8 MiB is generous enough to keep full failure logs for typical
 * suites while putting a hard ceiling on worst-case growth.
 */
export const defaultParallelBufferBytes = 8 * 1024 * 1024;

/**
 * Error thrown by CLI helpers to signal a user-facing failure without calling
 * `process.exit` directly. Keeping helpers exit-free makes them safely
 * importable from unit tests (and any other tooling) — only `runCli` at the
 * top level of this runner translates these into a real process exit.
 */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {number} [exitCode]
   */
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/**
 * `rootPath` is the repo-relative directory that owns a project's test files.
 * It's used to infer `--project=<name>` automatically when a path argument is
 * forwarded (see `inferProjectsFromForwardArgs`), so focused runs from the repo
 * root don't have to restate the package.
 *
 * A `host` project is one whose Vitest runs from the repo root against the root
 * `vitest.config.mjs`, spawned through the private `_test:unit:host` script
 * rather than a workspace or a nested package directory. There is exactly one —
 * `repo-scripts`, owning `scripts/`. The kind survives as its own case because
 * that spawn shape has no `-w <workspace>` to pass and no package `cwd` to
 * enter, so it cannot be folded into either of the other two.
 *
 * @typedef {{ kind: 'host'; name: string; rootPath: string }} HostProject
 * @typedef {{ kind: 'workspace'; name: string; workspace: string; rootPath: string; hasWatchScript: boolean }} WorkspaceProject
 * @typedef {{ kind: 'mfe'; name: string; cwd: string; rootPath: string }} MfeProject
 * @typedef {HostProject | WorkspaceProject | MfeProject} Project
 */
