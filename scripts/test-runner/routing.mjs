/**
 * Path-based routing helpers: deciding which project owns a forwarded path,
 * normalizing paths, and rewriting them for each project's Vitest root.
 *
 * These helpers are deliberately pure so the CLI can run them without
 * spawning children — the entire inference pipeline is covered by unit
 * tests that feed in fixture project lists.
 */
import path from 'node:path';
import { CliError, defaultRepoRoot } from './common.mjs';

/**
 * An arg counts as path-like if it doesn't start with `-` AND it either
 * contains a path separator or names a test/spec file. Bare filter strings
 * (e.g. `-t "my test"`, `--reporter=verbose`, `"foo"`) don't count — they
 * apply to any project and shouldn't constrain the run.
 *
 * @param {string} arg
 */
export function isPathLikeArg(arg) {
  if (!arg || arg.startsWith('-')) return false;
  if (arg.includes('/') || arg.includes(path.sep)) return true;
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(arg);
}

/**
 * Detects shell-glob metacharacters that would make `inferProjectsFromForwardArgs`
 * silently fall through to "fan out" mode. Used by `assertForwardPathArgsExpanded`.
 *
 * Covers:
 *   - `*` / `?` / `[...]` — standard POSIX globbing
 *   - `{a,b,c}` brace expansion — supported by bash + zsh; when the shell
 *     fails to expand it (zsh `setopt nonomatch`, cmd.exe, quoted arg) it
 *     reaches the runner intact and would otherwise silently fall through.
 *     We detect the simplest form (`{` followed by at least one `,` before
 *     the matching `}`) so arbitrary filenames containing a single `{` by
 *     coincidence are not falsely flagged.
 *
 * @param {string} arg
 */
export function hasGlobMetacharacters(arg) {
  if (/[*?[\]]/.test(arg)) return true;
  return hasBraceExpansionPattern(arg);
}

/**
 * True if `arg` contains a `{...}` group with at least one comma and no nested
 * braces — the bash-style brace-expansion form we care about. Implemented as a
 * linear scan (no regex backtracking) so pathological inputs cannot cause
 * super-linear CPU use.
 *
 * @param {string} arg
 */
function hasBraceExpansionPattern(arg) {
  let i = 0;
  while (i < arg.length) {
    if (arg[i] !== '{') {
      i++;
      continue;
    }
    const open = i;
    i++;
    let sawComma = false;
    while (i < arg.length && arg[i] !== '{' && arg[i] !== '}') {
      if (arg[i] === ',') sawComma = true;
      i++;
    }
    if (i < arg.length && arg[i] === '}' && sawComma) return true;
    i = open + 1;
  }
  return false;
}

/**
 * Guard against unexpanded globs in path-like forwarded args.
 *
 * `packages/api/**\/*.test.ts` (or any pattern the shell failed to expand —
 * zsh with `set -o nomatch off`, Windows cmd, quoted args) would otherwise
 * not match any project root in `inferProjectsFromForwardArgs` and cause the
 * runner to fall back to running every project, which is almost never what
 * the caller intended. Fail loudly instead so the mistake is obvious.
 *
 * @param {string[]} forwardArgs
 */
export function assertForwardPathArgsExpanded(forwardArgs) {
  for (const arg of forwardArgs) {
    if (!isPathLikeArg(arg)) continue;
    if (!hasGlobMetacharacters(arg)) continue;
    throw new CliError(
      `Forwarded path "${arg}" contains unexpanded glob metacharacters (*, ?, or [...]).\n` +
        'Your shell did not expand the pattern, so the runner cannot infer which project owns it.\n' +
        'Fix by either:\n' +
        '  - passing a concrete path (e.g. packages/api/src/__tests__/Foo.test.ts), or\n' +
        '  - selecting the project explicitly with --project=<name> and letting Vitest resolve the glob itself.',
    );
  }
}

/**
 * Normalize a path-like arg to a POSIX, repo-relative form so we can prefix-
 * match it against a project's `rootPath`. Absolute paths inside the repo get
 * re-rooted; `./` prefixes and trailing slashes are stripped.
 *
 * @param {string} arg
 * @param {{ repoRoot?: string }} [options]
 * @returns {string}
 */
export function normalizePathArg(arg, { repoRoot = defaultRepoRoot } = {}) {
  let normalized = arg;
  if (path.isAbsolute(normalized)) {
    const relative = path.relative(repoRoot, normalized);
    normalized = relative || '.';
  }
  normalized = normalized.split(path.sep).join('/');
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  if (normalized.endsWith('/') && normalized !== '/') {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Pick the single project that most specifically owns a normalized path.
 * The longest matching root wins so nested project roots beat broader ones.
 *
 * @param {string} normalizedPath
 * @param {import('./common.mjs').Project[]} projects
 * @returns {import('./common.mjs').Project | null}
 */
function findBestProjectForPath(normalizedPath, projects) {
  /** @type {import('./common.mjs').Project | null} */
  let best = null;
  /** @type {number} */
  let bestLength = -1;

  for (const project of projects) {
    const root = project.rootPath;
    const isMatch = normalizedPath === root || normalizedPath.startsWith(`${root}/`);
    if (!isMatch || root.length <= bestLength) continue;
    best = project;
    bestLength = root.length;
  }

  return best;
}

/**
 * Infer which projects own the forwarded path args. Only path-like args
 * constrain the inference; everything else (flags, bare filter strings) is
 * ignored here and still forwarded verbatim to Vitest.
 *
 * For each path, the most specific (longest matching root) project wins.
 * That matters wherever one project's root is a prefix of another's: an MFE
 * path like `src/mfe_packages/demo-mfe/foo.test.ts` matches both a host rooted
 * at `src/` and `demo-mfe` itself, and without longest-prefix precedence the
 * runner would raise the multi-project error even though a single, more
 * specific project clearly owns the file.
 *
 * @param {string[]} forwardArgs
 * @param {import('./common.mjs').Project[]} projects
 * @param {{ repoRoot?: string }} [options]
 * @returns {import('./common.mjs').Project[]}
 */
export function inferProjectsFromForwardArgs(forwardArgs, projects, options = {}) {
  /** @type {Map<string, import('./common.mjs').Project>} */
  const matched = new Map();

  for (const raw of forwardArgs) {
    if (!isPathLikeArg(raw)) continue;
    const normalized = normalizePathArg(raw, options);
    const best = findBestProjectForPath(normalized, projects);
    if (!best) continue;
    matched.set(best.name, best);
  }

  return [...matched.values()];
}

/**
 * Rewrite path-like args so they're relative to the project's Vitest root.
 *
 * Host projects run Vitest with root = repo root, so repo-relative paths
 * already resolve correctly. Workspace and MFE projects run Vitest with root =
 * their package directory, so a repo-relative path like
 *   src/mfe_packages/demo-mfe/src/api/foo.test.ts
 * would be resolved against
 *   /repo/src/mfe_packages/demo-mfe/
 * and point at a non-existent nested duplicate. Strip the project prefix for
 * those cases; leave flags and non-project paths untouched.
 *
 * @param {import('./common.mjs').Project} project
 * @param {string[]} forwardArgs
 * @param {{ repoRoot?: string }} [options]
 * @returns {string[]}
 */
export function rewriteForwardArgsForProject(project, forwardArgs, options = {}) {
  if (project.kind === 'host') return forwardArgs;

  return forwardArgs.map((arg) => {
    if (!isPathLikeArg(arg)) return arg;
    const normalized = normalizePathArg(arg, options);
    if (normalized === project.rootPath) return '.';
    if (normalized.startsWith(`${project.rootPath}/`)) {
      return normalized.slice(project.rootPath.length + 1);
    }
    return arg;
  });
}
