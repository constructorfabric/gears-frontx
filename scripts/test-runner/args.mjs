/**
 * CLI argument parsing for the monorepo test runner.
 *
 * `parseArgs` turns `process.argv.slice(2)` into a normalized shape that
 * downstream code can consume without re-inspecting `argv`. Every helper
 * here is pure and throws `CliError` on malformed input so tests can import
 * it without side effects.
 */
import { CliError, defaultProjectTimeoutMs, defaultWatchProjectName } from './common.mjs';

/**
 * @typedef {{
 *   kind: 'separator'
 * } | {
 *   kind: 'mode'
 *   mode: 'run' | 'watch'
 * } | {
 *   kind: 'parallel'
 * } | {
 *   kind: 'help'
 * } | {
 *   kind: 'project'
 *   project: string
 *   nextIndex: number
 * } | {
 *   kind: 'timeout'
 *   timeoutMs: number
 *   nextIndex: number
 * } | {
 *   kind: 'forward'
 *   value: string
 * }} ParsedArg
 */

/**
 * @param {string[]} argv
 * @param {number} index
 * @returns {ParsedArg}
 */
function parseCliArg(argv, index) {
  const arg = argv[index];

  if (arg === '--') {
    return { kind: 'separator' };
  }

  if (arg === '--watch' || arg === 'watch') {
    return { kind: 'mode', mode: 'watch' };
  }

  if (arg === '--run' || arg === 'run') {
    return { kind: 'mode', mode: 'run' };
  }

  if (arg === '--parallel' || arg === 'parallel') {
    return { kind: 'parallel' };
  }

  if (arg === '--help' || arg === '-h') {
    return { kind: 'help' };
  }

  if (arg.startsWith('--project=')) {
    const value = arg.slice('--project='.length);
    if (value === '') {
      // `--project=` with an empty RHS used to fall through to "no project
      // selected" and silently fan out to every workspace — the exact
      // opposite of the caller's intent. Reject loudly so the mistake is
      // obvious instead of wasting CI minutes on unrelated packages.
      throw new CliError('Missing value for --project. Expected --project=<name>.');
    }
    return { kind: 'project', project: value, nextIndex: index };
  }

  if (arg === '--project' || arg === '-p') {
    const next = argv[index + 1];
    if (!next || next.startsWith('-')) {
      throw new CliError('Missing value for --project. Expected --project=<name>.');
    }

    return { kind: 'project', project: next, nextIndex: index + 1 };
  }

  if (arg.startsWith('--timeout=')) {
    return { kind: 'timeout', timeoutMs: parseTimeoutValue(arg.slice('--timeout='.length)), nextIndex: index };
  }

  if (arg === '--timeout') {
    const next = argv[index + 1];
    if (!next || next.startsWith('-')) {
      throw new CliError('Missing value for --timeout. Expected --timeout=<ms>.');
    }
    return { kind: 'timeout', timeoutMs: parseTimeoutValue(next), nextIndex: index + 1 };
  }

  return { kind: 'forward', value: arg };
}

/**
 * Parse a `--timeout` value. Accepts a non-negative integer (milliseconds);
 * `0` disables the timeout. Anything else is a hard CLI error so callers
 * don't silently fall back to the default.
 *
 * @param {string} raw
 * @returns {number}
 */
function parseTimeoutValue(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new CliError(
      `Invalid --timeout value "${raw}". Expected a non-negative integer (milliseconds); use 0 to disable.`,
    );
  }
  return parsed;
}

/**
 * Parse the CLI args supported by this runner. Returns a normalized shape
 * that downstream code can consume without re-inspecting `argv`.
 *
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {'run' | 'watch'} */
  let mode = 'run';
  /** @type {string | null} */
  let project = null;
  let parallel = false;
  let help = false;
  /** @type {number | null} */
  let timeoutMs = null;
  /** @type {string[]} */
  const forwardArgs = [];
  let sawSeparator = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (sawSeparator) {
      forwardArgs.push(arg);
      i += 1;
      continue;
    }

    const parsedArg = parseCliArg(argv, i);

    if (parsedArg.kind === 'separator') {
      sawSeparator = true;
      i += 1;
      continue;
    }

    switch (parsedArg.kind) {
      case 'mode':
        mode = parsedArg.mode;
        break;
      case 'parallel':
        parallel = true;
        break;
      case 'help':
        help = true;
        break;
      case 'project':
        project = parsedArg.project;
        break;
      case 'timeout':
        timeoutMs = parsedArg.timeoutMs;
        break;
      case 'forward':
        forwardArgs.push(parsedArg.value);
        break;
    }

    if (parsedArg.kind === 'project' || parsedArg.kind === 'timeout') {
      i = parsedArg.nextIndex + 1;
    } else {
      i += 1;
    }
  }

  return { mode, project, parallel, help, timeoutMs, forwardArgs };
}

export function printUsage(projectNames) {
  console.log(
    `Usage: node scripts/run-monorepo-unit-tests.mjs [--run|--watch] [--project=<name>] [--parallel] [--timeout=<ms>] [-- <vitest args>]

Options:
  --run                 Non-interactive run (default).
  --watch               Interactive Vitest watcher. Defaults to --project=${defaultWatchProjectName}
                        when no project/path is provided; otherwise it still
                        requires a single target (explicit or inferred).
  --project=<name>      Restrict execution to a single project.
                        Available: ${projectNames}.
  --parallel            Run selected projects concurrently. Intended for CI and
                        other non-interactive runs.
  --timeout=<ms>        Per-child timeout (default ${defaultProjectTimeoutMs}, 0 disables).
                        Applies only to --run / --parallel; --watch is interactive.
  -h, --help            Print this message.

Path-based project inference:
  When --project is not set, any forwarded path that starts with a known
  project root (e.g. scripts/..., packages/api/..., src/mfe_packages/<mfe>/...)
  narrows the run to that single project automatically. Paths
  spanning multiple projects are rejected with a clear error; unexpanded
  globs (e.g. "packages/api/**/*.test.ts" the shell did not expand) are
  rejected too so focused runs don't silently fan out.

Examples:
  npm run test:unit
  npm run test:unit -- --parallel
  npm run test:unit -- scripts/test-runner/orchestration.test.mjs
  npm run test:unit -- packages/api/src/__tests__/AccountsApiService.test.ts
  npm run test:unit -- src/mfe_packages/demo-mfe/src/api/AccountsApiService.test.ts
  npm run test:unit -- --project=api
  npm run test:unit -- --project=api --parallel
  npm run test:unit -- --reporter=verbose                (no path → all projects)
  npm run test:unit:watch                                 (defaults to ${defaultWatchProjectName})
  npm run test:unit:watch -- scripts/test-runner/orchestration.test.mjs
  npm run test:unit:watch -- --project=repo-scripts
`,
  );
}
