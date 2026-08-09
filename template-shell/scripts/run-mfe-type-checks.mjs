import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const mfeRoot = path.join(repoRoot, 'src-app/mfe_packages');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Per-MFE type-check timeout. Type-checking rarely takes more than a couple
// of minutes; 15m is a generous ceiling that still catches a genuinely hung
// child without surprising an intentionally slow run. Overridable via
// `--timeout=<ms>` on the CLI; 0 disables.
const defaultTypeCheckTimeoutMs = 15 * 60 * 1000;

function printUsage() {
  console.log(
    `Usage: node scripts/run-mfe-type-checks.mjs [--parallel] [--timeout=<ms>]

Options:
  --parallel     Run per-MFE type-check concurrently. Defaults to sequential,
                 which keeps interleaved stdout readable for small runs; use
                 --parallel for CI or multi-MFE repos where fanning out
                 saves wall-clock time.
  --timeout=<ms> Per-child timeout in milliseconds. Default ${defaultTypeCheckTimeoutMs}
                 (15 minutes); 0 disables. On timeout the child is sent
                 SIGTERM, then SIGKILL after a 5 s grace period.
  -h, --help     Print this message.
`,
  );
}

function parseArgs(argv) {
  let parallel = false;
  let help = false;
  /** @type {number | null} */
  let timeoutMs = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--parallel' || arg === 'parallel') {
      parallel = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg.startsWith('--timeout=')) {
      timeoutMs = parseTimeoutValue(arg.slice('--timeout='.length));
      continue;
    }

    if (arg === '--timeout') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        console.error('Missing value for --timeout. Expected --timeout=<ms>.');
        printUsage();
        process.exit(1);
      }
      timeoutMs = parseTimeoutValue(next);
      i++;
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    printUsage();
    process.exit(1);
  }

  return {
    parallel,
    help,
    timeoutMs: timeoutMs ?? defaultTypeCheckTimeoutMs,
  };
}

/**
 * @param {string} raw
 * @returns {number}
 */
function parseTimeoutValue(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    console.error(
      `Invalid --timeout value "${raw}". Expected a non-negative integer (milliseconds); use 0 to disable.`,
    );
    process.exit(1);
  }
  return parsed;
}

async function discoverMfeProjects() {
  const entries = await readdir(mfeRoot, { withFileTypes: true }).catch(() => []);
  const projects = [];
  const missingTypeCheckScript = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const cwd = path.join(mfeRoot, entry.name);
    const packageJsonPath = path.join(cwd, 'package.json');
    let packageJson;

    try {
      packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    } catch {
      continue;
    }

    if (!packageJson?.scripts?.['type-check']) {
      missingTypeCheckScript.push(entry.name);
      continue;
    }

    projects.push({
      cwd,
      name: entry.name,
    });
  }

  return { projects, missingTypeCheckScript };
}

/**
 * Run the `type-check` npm script inside the project directory.
 *
 * In sequential mode stdout is inherited so the user sees Vitest-style live
 * output. In parallel mode we buffer stdout/stderr per project and flush it
 * with a clear header once the run completes, so concurrent runs don't
 * produce interleaved output that's impossible to read.
 *
 * A positive `timeoutMs` guards against a hung child: the process is sent
 * SIGTERM first, then SIGKILL after a 5 s grace window if it's still alive.
 * Passing `0` disables the timeout entirely.
 *
 * @param {{ cwd: string; name: string }} project
 * @param {{ buffered: boolean; timeoutMs: number }} options
 */
function runTypeCheck(project, { buffered, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', 'type-check'], {
      cwd: project.cwd,
      stdio: buffered ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    /** @type {Buffer[]} */
    const chunks = [];
    if (buffered) {
      child.stdout?.on('data', (chunk) => chunks.push(chunk));
      child.stderr?.on('data', (chunk) => chunks.push(chunk));
    }

    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer;
    let timedOut = false;
    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        if (!child.killed) {
          child.kill('SIGTERM');
        }
        killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5_000);
        killTimer.unref?.();
      }, timeoutMs);
      timer.unref?.();
    }

    child.on('error', (err) => {
      clearTimers();
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimers();
      const output = buffered ? Buffer.concat(chunks).toString('utf8') : '';

      if (code === 0 && !timedOut) {
        resolve({ output });
        return;
      }

      const reason = timedOut
        ? `timed out after ${timeoutMs}ms`
        : `exit code ${code ?? 'unknown'}`;
      const error = new Error(
        `Type-check failed for ${project.name} (${reason}).`,
      );
      // Attach buffered output so the parallel orchestrator can flush it
      // before printing the aggregated failure summary.
      // @ts-expect-error - adding ad-hoc field for parallel orchestrator.
      error.output = output;
      reject(error);
    });
  });
}

/**
 * Raise one error naming every package that failed, or return quietly.
 *
 * Each package's own reason is repeated here because by the time this prints,
 * a multi-package run has scrolled far past the first failure, and a timeout
 * has to stay distinguishable from a type error.
 *
 * @param {{ name: string; reason: unknown }[]} failures
 */
function throwOnFailures(failures) {
  if (failures.length === 0) {
    return;
  }

  const detail = failures
    .map((failure) => {
      const reason =
        failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
      return `  - ${failure.name}: ${reason}`;
    })
    .join('\n');

  throw new Error(
    `Type-check failed for ${failures.length} MFE package(s):\n${detail}`,
  );
}

/**
 * Type-check every project one at a time, collecting failures instead of
 * stopping at the first one.
 *
 * Awaiting each child directly would abort the loop on the first red package
 * and leave every later package unchecked, so a single broken MFE would hide
 * the state of all its siblings and turn one fix-and-rerun cycle into as many
 * cycles as there are broken packages.
 *
 * @param {{ cwd: string; name: string }[]} projects
 * @param {{ timeoutMs: number }} options
 * @returns {Promise<{ name: string; reason: unknown }[]>}
 */
async function runSequential(projects, { timeoutMs }) {
  /** @type {{ name: string; reason: unknown }[]} */
  const failures = [];

  for (const project of projects) {
    console.log(`\n==> Type-checking ${project.name}`);
    try {
      await runTypeCheck(project, { buffered: false, timeoutMs });
    } catch (error) {
      failures.push({ name: project.name, reason: error });
    }
  }

  return failures;
}

/**
 * @param {{ cwd: string; name: string }[]} projects
 * @param {{ timeoutMs: number }} options
 * @returns {Promise<{ name: string; reason: unknown }[]>}
 */
async function runParallel(projects, { timeoutMs }) {
  console.log(`\n==> Type-checking ${projects.length} MFE package(s) in parallel`);

  const results = await Promise.allSettled(
    projects.map((project) => runTypeCheck(project, { buffered: true, timeoutMs })),
  );

  const failures = [];

  results.forEach((result, index) => {
    const project = projects[index];
    console.log(`\n==> ${project.name}`);

    if (result.status === 'fulfilled') {
      if (result.value.output) {
        process.stdout.write(result.value.output);
      }
      return;
    }

    const reason = result.reason;
    const buffered = typeof reason === 'object' && reason && 'output' in reason
      ? /** @type {{ output: string }} */ (reason).output
      : '';
    if (buffered) {
      process.stdout.write(buffered);
    }

    failures.push({ name: project.name, reason });
  });

  return failures;
}

async function main() {
  const { parallel, help, timeoutMs } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const { projects, missingTypeCheckScript } = await discoverMfeProjects();

  if (missingTypeCheckScript.length > 0) {
    throw new Error(
      `Missing \`type-check\` script in MFE package(s): ${missingTypeCheckScript.join(', ')}.`,
    );
  }

  if (projects.length === 0) {
    console.log('No MFE packages with package.json found under src-app/mfe_packages.');
    return;
  }

  const failures = parallel
    ? await runParallel(projects, { timeoutMs })
    : await runSequential(projects, { timeoutMs });

  throwOnFailures(failures);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
