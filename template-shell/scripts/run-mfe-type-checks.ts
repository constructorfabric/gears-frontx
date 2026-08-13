#!/usr/bin/env node

/**
 * Type-check every MFE package independently.
 *
 * Each package under `src-app/mfe_packages/` has its own install boundary and
 * its own `tsconfig`, so there is no single `tsc` invocation that covers them
 * all - this delegates to each package's own `type-check` script.
 *
 * A package whose `mfe.json` declares `"templateExample": true` is left out by
 * default, on the same rule the other package scanners apply: it is content the
 * template ships to be read and copied, so an applied project pays for
 * type-checking it on every run without learning anything about its own code.
 * `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1` puts them back, which is how the
 * template's own repository keeps its scaffold provably compilable.
 *
 * Usage:
 *   npx tsx scripts/run-mfe-type-checks.ts [--parallel] [--timeout=<ms>]
 */

import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  MFE_PACKAGES_DIR,
  TEMPLATE_EXAMPLES_ENV_VAR,
  isTemplateExamplePackage,
  noDiscoveredPackagesNotice,
  templateExamplesIncluded,
  templateExamplesSkippedNotice,
} from './lib/mfe-tools.js';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Per-MFE type-check timeout. Type-checking rarely takes more than a couple
// of minutes; 15m is a generous ceiling that still catches a genuinely hung
// child without surprising an intentionally slow run. Overridable via
// `--timeout=<ms>` on the CLI; 0 disables.
const defaultTypeCheckTimeoutMs = 15 * 60 * 1000;

interface CliOptions {
  parallel: boolean;
  help: boolean;
  timeoutMs: number;
}

/** One package this run type-checks, and the directory to spawn npm in. */
interface MfeProject {
  cwd: string;
  name: string;
}

/**
 * Outcome of the package scan. The skipped example names travel with the
 * projects for the same reason they do in `getMFEPackages`: a caller reporting
 * an empty set has to say which kind of empty it is.
 */
interface MfeProjectDiscovery {
  projects: MfeProject[];
  /** Directory names that hold a `package.json` but declare no `type-check` script. */
  missingTypeCheckScript: string[];
  /** Directory names left out because their `mfe.json` declares template example content. */
  skippedExamples: string[];
}

function printUsage(): void {
  console.log(
    `Usage: npx tsx scripts/run-mfe-type-checks.ts [--parallel] [--timeout=<ms>]

Options:
  --parallel     Run per-MFE type-check concurrently. Defaults to sequential,
                 which keeps interleaved stdout readable for small runs; use
                 --parallel for CI or multi-MFE repos where fanning out
                 saves wall-clock time.
  --timeout=<ms> Per-child timeout in milliseconds. Default ${defaultTypeCheckTimeoutMs}
                 (15 minutes); 0 disables. On timeout the child is sent
                 SIGTERM, then SIGKILL after a 5 s grace period.
  -h, --help     Print this message.

Environment:
  ${TEMPLATE_EXAMPLES_ENV_VAR}=1
                 Type-check the template's own example and scaffold packages
                 too. They are left out by default.
`,
  );
}

function parseArgs(argv: string[]): CliOptions {
  let parallel = false;
  let help = false;
  let timeoutMs: number | null = null;

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

function parseTimeoutValue(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    console.error(
      `Invalid --timeout value "${raw}". Expected a non-negative integer (milliseconds); use 0 to disable.`,
    );
    process.exit(1);
  }
  return parsed;
}

/**
 * Scan the MFE packages directory for packages this run should type-check.
 *
 * Exported for `__tests__/template-example-packages.test.ts`, which runs the
 * real scan against a fixture tree rather than a copy of its rules. The CLI
 * entry at the foot of this file guards on being the process entry point, so
 * importing this spawns nothing.
 *
 * @param mfeRoot - Directory to scan. Defaults to the shared `MFE_PACKAGES_DIR`,
 *   so this script resolves the tree from the working directory exactly as
 *   `build-mfes`, `dev-all` and `generate:mfe-manifests` do rather than from its
 *   own file location; tests pass it explicitly, because they cannot move the
 *   working directory the default was resolved from at import time
 */
export async function discoverMfeProjects(
  mfeRoot: string = MFE_PACKAGES_DIR,
): Promise<MfeProjectDiscovery> {
  const entries = await readdir(mfeRoot, { withFileTypes: true }).catch(() => []);
  const projects: MfeProject[] = [];
  const missingTypeCheckScript: string[] = [];
  const skippedExamples: string[] = [];
  const includeExamples = templateExamplesIncluded();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const cwd = path.join(mfeRoot, entry.name);

    // Ahead of reading `package.json`: an example package is out of this run
    // whether or not it declares a `type-check` script, and the hard failure
    // below would otherwise refuse the whole run over a package nothing
    // intends to check.
    if (!includeExamples && isTemplateExamplePackage(cwd)) {
      skippedExamples.push(entry.name);
      continue;
    }

    const packageJsonPath = path.join(cwd, 'package.json');
    let packageJson: unknown;

    try {
      packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    } catch {
      continue;
    }

    if (!declaresTypeCheckScript(packageJson)) {
      missingTypeCheckScript.push(entry.name);
      continue;
    }

    projects.push({ cwd, name: entry.name });
  }

  return { projects, missingTypeCheckScript, skippedExamples };
}

/**
 * Whether a parsed `package.json` body declares a runnable `type-check` script.
 * The body arrives as `unknown` straight from `JSON.parse`, so every hop down to
 * the script name is checked rather than asserted.
 */
function declaresTypeCheckScript(packageJson: unknown): boolean {
  if (typeof packageJson !== 'object' || packageJson === null) return false;
  if (!('scripts' in packageJson)) return false;

  const scripts = packageJson.scripts;
  if (typeof scripts !== 'object' || scripts === null) return false;

  return 'type-check' in scripts && Boolean(scripts['type-check']);
}

/**
 * A failed type-check, carrying the child's buffered output.
 *
 * Only a buffered (parallel) run has output to carry: a sequential child
 * inherits stdio, so everything it printed is already on the terminal. Making
 * the carrier a named error type rather than a field bolted onto `Error` is
 * what lets the parallel orchestrator recover the output with an `instanceof`
 * check instead of trusting a shape.
 */
class TypeCheckFailure extends Error {
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = 'TypeCheckFailure';
    this.output = output;
  }
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
 */
function runTypeCheck(
  project: MfeProject,
  { buffered, timeoutMs }: { buffered: boolean; timeoutMs: number },
): Promise<{ output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', 'type-check'], {
      cwd: project.cwd,
      stdio: buffered ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    const chunks: Buffer[] = [];
    if (buffered) {
      child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk));
    }

    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const clearTimers = (): void => {
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
        killTimer.unref();
      }, timeoutMs);
      timer.unref();
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
      reject(
        new TypeCheckFailure(
          `Type-check failed for ${project.name} (${reason}).`,
          output,
        ),
      );
    });
  });
}

/** One package's failure, with whatever the rejection carried as its reason. */
interface TypeCheckFailureReport {
  name: string;
  reason: unknown;
}

/**
 * Raise one error naming every package that failed, or return quietly.
 *
 * Each package's own reason is repeated here because by the time this prints,
 * a multi-package run has scrolled far past the first failure, and a timeout
 * has to stay distinguishable from a type error.
 */
function throwOnFailures(failures: TypeCheckFailureReport[]): void {
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
 */
async function runSequential(
  projects: MfeProject[],
  { timeoutMs }: { timeoutMs: number },
): Promise<TypeCheckFailureReport[]> {
  const failures: TypeCheckFailureReport[] = [];

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

async function runParallel(
  projects: MfeProject[],
  { timeoutMs }: { timeoutMs: number },
): Promise<TypeCheckFailureReport[]> {
  console.log(`\n==> Type-checking ${projects.length} MFE package(s) in parallel`);

  const results = await Promise.allSettled(
    projects.map((project) => runTypeCheck(project, { buffered: true, timeoutMs })),
  );

  const failures: TypeCheckFailureReport[] = [];

  results.forEach((result, index) => {
    const project = projects[index];
    console.log(`\n==> ${project.name}`);

    if (result.status === 'fulfilled') {
      if (result.value.output) {
        process.stdout.write(result.value.output);
      }
      return;
    }

    const reason: unknown = result.reason;
    // A spawn error (`child.on('error')`) rejects with a plain Error and has no
    // captured output - only a completed-but-red child does.
    const buffered = reason instanceof TypeCheckFailure ? reason.output : '';
    if (buffered) {
      process.stdout.write(buffered);
    }

    failures.push({ name: project.name, reason });
  });

  return failures;
}

async function main(): Promise<void> {
  const { parallel, help, timeoutMs } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const { projects, missingTypeCheckScript, skippedExamples } = await discoverMfeProjects();

  if (missingTypeCheckScript.length > 0) {
    throw new Error(
      `Missing \`type-check\` script in MFE package(s): ${missingTypeCheckScript.join(', ')}.`,
    );
  }

  if (projects.length === 0) {
    // `noDiscoveredPackagesNotice` already names the skipped examples when they
    // are the whole reason the set is empty, so the skip line below would only
    // repeat it.
    console.log(`${noDiscoveredPackagesNotice(skippedExamples)} Skipping MFE type-check.`);
    return;
  }

  // The type-check flow is the notice's own home. Manifest generation carries it
  // for `dev`, `build` and `dev:all`, but `npm run type-check` chains
  // `type-check:package`, `:package:test`, `:app`, `:packages` and `:mfe` - none
  // of which generates a manifest - so nothing else in this flow would report
  // which packages the scan left out.
  if (skippedExamples.length > 0) {
    console.log(templateExamplesSkippedNotice(skippedExamples));
  }

  const failures = parallel
    ? await runParallel(projects, { timeoutMs })
    : await runSequential(projects, { timeoutMs });

  throwOnFailures(failures);
}

// Type-checking is what running this file does, and only running it: the test
// that imports `discoverMfeProjects` must not spawn npm across the real
// project's packages as a side effect of the import. The comparison is against
// the resolved path of the file node was told to run, so it holds under
// `tsx scripts/run-mfe-type-checks.ts` as well as under node.
const invokedPath = process.argv[1];
const isProcessEntryPoint =
  invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url);

if (isProcessEntryPoint) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
