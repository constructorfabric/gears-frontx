/**
 * Entry point for the FrontX monorepo unit-test runner.
 *
 * The implementation lives in focused modules under `scripts/test-runner/`
 * so each concern (arg parsing, project discovery, path routing, child
 * spawning, CLI flow) has one reason to change (ENG-CODE-002 / SRP). This
 * file is the thin integration layer: it re-exports every public helper for
 * tests and tooling, and runs the CLI when executed as a Node entry point.
 *
 * Runs unit tests across this npm workspaces monorepo by delegating to each
 * package's `test:unit` / `test:unit:watch` scripts (`npm run … -w <pkg>` from
 * the repo root, or `npm run test:unit` with cwd for nested MFE packages).
 * The root unit loop delegates only the canonical `test:unit` contract; any
 * separate slow/opt-in lanes a package may introduce stay outside this runner.
 *
 * This file is intentionally FrontX-monorepo-specific; generated apps should
 * use their own package-manager invocation of `test:unit` only.
 *
 * Usage:
 *   node scripts/run-monorepo-unit-tests.mjs [--run|--watch]
 *                                            [--project=<name>]
 *                                            [--parallel]
 *                                            [--timeout=<ms>]
 *                                            [-- <vitest args>]
 *
 *   --run                 Non-interactive run across all (or selected) projects. Default.
 *   --watch               Interactive Vitest watcher. Defaults to `repo-scripts`
 *                         when no project/path narrows the run; otherwise it
 *                         still requires a single target so one Vitest instance
 *                         owns stdio.
 *   --project=<name>      Restrict execution to a single project.
 *   --parallel            Run selected projects concurrently. Intended for CI
 *                         and non-interactive runs; watch mode stays single-project.
 *   --timeout=<ms>        Per-child timeout in milliseconds. Defaults to
 *                         900000 (15 minutes); 0 disables. Only applies to
 *                         non-interactive (--run) modes. On timeout the child
 *                         is sent SIGTERM, then SIGKILL after 5 s.
 *   -- <vitest args>      Forwarded verbatim to the underlying `test:unit` script,
 *                         so `npm run test:unit -- path/to/file.test.ts` works.
 *                         When --project is not set, any forwarded path under a
 *                         known project root auto-narrows the run to that project
 *                         (so root-level focused runs don't fan out and fail in
 *                         every unrelated package). Unexpanded shell globs in
 *                         path args are rejected with a helpful error.
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Re-exported so consumers (notably the unit test suite) can reference
 * `import('./run-monorepo-unit-tests.mjs').Project` without reaching into
 * the `test-runner/` submodule directly — this file is the public surface.
 *
 * @typedef {import('./test-runner/common.mjs').Project} Project
 */

export {
  CliError,
  defaultParallelBufferBytes,
  defaultProjectTimeoutMs,
  defaultRepoRoot,
  defaultWatchProjectName,
  npmCommand,
} from './test-runner/common.mjs';

export { parseArgs, printUsage } from './test-runner/args.mjs';

export {
  discoverMfeProjects,
  discoverWorkspaceProjects,
  loadProjects,
  resolveWorkspaceEntry,
} from './test-runner/discovery.mjs';

export {
  assertForwardPathArgsExpanded,
  hasGlobMetacharacters,
  inferProjectsFromForwardArgs,
  isPathLikeArg,
  normalizePathArg,
  rewriteForwardArgsForProject,
} from './test-runner/routing.mjs';

export {
  aggregateExitCode,
  createBoundedBuffer,
  npmSpawnArgs,
  spawnOptionsFor,
  spawnProject,
  waitForExit,
} from './test-runner/spawning.mjs';

export {
  resolveCliTargets,
  resolveProjects,
  runCli,
  runInParallel,
  runInWatchMode,
  runSequentially,
  validateWatchTargets,
} from './test-runner/cli.mjs';

import { CliError } from './test-runner/common.mjs';
import { runCli } from './test-runner/cli.mjs';

// Only execute the runner when this file is the Node entry point. Keeping the
// CLI behind a guard is what lets the test suite `import` the helpers above
// without spawning child processes or calling `process.exit`.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  try {
    const code = await runCli();
    process.exit(code);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(err.message);
      process.exit(err.exitCode);
    } else {
      console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exit(1);
    }
  }
}
