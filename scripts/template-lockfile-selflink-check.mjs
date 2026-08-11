/**
 * Template Lockfile Self-Link Guard (#524).
 *
 * A self-contained template depends on itself: the workspace packages depend
 * on the template by name (`packages/framework` declares
 * `"@gears-frontx/frontx-template-shell": "file:../.."`), and the template's
 * root manifest pins that name's resolution to its own directory via
 * `"overrides": { "@gears-frontx/frontx-template-shell": "file:." }`, so the
 * template's own library build is resolvable through `node_modules`. npm
 * records that resolution in the lockfile as
 *
 *   "node_modules/@gears-frontx/frontx-template-shell": {
 *     "resolved": "",
 *     "link": true
 *   }
 *
 * and `npm ci` refuses to install without it ("Missing: <name>@<version> from
 * lock file").
 *
 * The trap (#524): when `npm install` has to RECONCILE a manifest change — a
 * lockfile out of sync with `package.json`, exactly the state a pin bump that
 * skipped the lockfile leaves behind — the lockfile it writes back omits this
 * entry. And reconciling with `npm install` is what `npm ci`'s own out-of-sync
 * error message tells the developer to do, so the documented remediation
 * produces a second broken lockfile, red in every job that runs `npm ci` in
 * the template, with nothing naming the entry that vanished. This guard is
 * that name: it fails on the exact missing lockfile entry, before the commit
 * lands (observed on npm 11.7.0 / node 25.4.0, the pair CI's `25.x` jobs get).
 *
 * Discovery mirrors the sibling guards (`template-pin-drift-check.mjs`,
 * `validate-templates.mjs`): a template is a top-level directory carrying
 * `frontx-template.json` (ADR-0018 manifest presence, never a `template-*`
 * name guess), and zero templates found — or zero templates actually checked —
 * is a hard failure, never a vacuous pass. WHAT to assert is read from each
 * template's own root manifest — every
 * dependency declared at the `file:.` self-path — so a renamed template or a
 * second self-linking template is covered with no change here. An overlay
 * template (no root `package.json`, e.g. `template-mfe/`) or one without a
 * lockfile has no `npm ci` contract to protect and is skipped.
 *
 * CLI entry: `node scripts/template-lockfile-selflink-check.mjs` (exit 0 on
 * success). Core logic is exported for unit tests in
 * `scripts/template-lockfile-selflink-check.test.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILENAME, findTemplateDirs } from './template-discovery.mjs';

// Re-exported for the zero-templates failure message, same as the pin-drift
// guard: the filename is owned by `template-discovery.mjs`.
export { MANIFEST_FILENAME };

/**
 * The dependency fields npm materialises into the install tree. `peerDependencies`
 * is deliberately absent: a peer declaration alone produces no `node_modules`
 * entry of its own to lose. `overrides` is scanned separately
 * (`selfLinkDependenciesOf`) because its values can be nested objects, and it
 * is where the real tree declares its self-link today: `template-shell`'s root
 * manifest carries `"overrides": { "@gears-frontx/frontx-template-shell": "file:." }`,
 * redirecting the workspace packages' dependency on that name
 * (`packages/framework` declares it at `file:../..`) to the template root.
 */
const INSTALLED_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * A `file:` specifier that resolves to the manifest's own directory — the
 * self-link shape npm's reconciliation drops from the lockfile (#524).
 * `file:.` is what the repo declares; the normalised variants are accepted so
 * a formatting change in the manifest cannot silently take the dependency out
 * of the guard's view.
 *
 * @param {string} spec
 * @returns {boolean}
 */
export function isSelfLinkSpec(spec) {
  if (typeof spec !== 'string' || !spec.startsWith('file:')) return false;
  const target = spec.slice('file:'.length);
  return target === '.' || target === './' || target === '';
}

/**
 * @typedef {{ name: string; field: string; spec: string }} SelfLinkDependency
 */

/**
 * Every dependency the manifest declares at its own directory.
 *
 * @param {unknown} manifest parsed root `package.json` of a template
 * @returns {SelfLinkDependency[]}
 */
export function selfLinkDependenciesOf(manifest) {
  if (typeof manifest !== 'object' || manifest === null) return [];

  /** @type {SelfLinkDependency[]} */
  const found = [];
  for (const field of INSTALLED_DEPENDENCY_FIELDS) {
    const section = /** @type {Record<string, unknown>} */ (manifest)[field];
    if (typeof section !== 'object' || section === null) continue;
    for (const [name, spec] of Object.entries(section)) {
      if (typeof spec === 'string' && isSelfLinkSpec(spec)) {
        found.push({ name, field, spec });
      }
    }
  }

  // An `overrides` self-link produces the same lockfile entry as a direct
  // dependency once anything in the tree depends on the name - which is the
  // point of declaring it there (the workspace packages depend on the template
  // by name; the override pins the resolution to the template root). A nested
  // override object carries its own spec under the "." key.
  const overrides = /** @type {Record<string, unknown>} */ (manifest).overrides;
  if (typeof overrides === 'object' && overrides !== null) {
    for (const [name, value] of Object.entries(overrides)) {
      const spec =
        typeof value === 'string'
          ? value
          : typeof value === 'object' && value !== null
            ? /** @type {Record<string, unknown>} */ (value)['.']
            : undefined;
      if (typeof spec === 'string' && isSelfLinkSpec(spec)) {
        found.push({ name, field: 'overrides', spec });
      }
    }
  }

  return found;
}

/**
 * @typedef {{
 *   templateName: string;
 *   dependency: SelfLinkDependency;
 *   lockfilePath: string;
 *   problem: 'entry-missing' | 'entry-not-link';
 * }} SelfLinkFinding
 */

/**
 * Checks one template's lockfile against the self-link dependencies its
 * manifest declares.
 *
 * @param {{ manifest: unknown; lockfile: unknown; templateName: string; lockfilePath: string }} input
 * @returns {SelfLinkFinding[]}
 */
export function findMissingSelfLinks({ manifest, lockfile, templateName, lockfilePath }) {
  const declared = selfLinkDependenciesOf(manifest);
  if (declared.length === 0) return [];

  const packages =
    typeof lockfile === 'object' && lockfile !== null
      ? /** @type {Record<string, unknown>} */ (lockfile).packages
      : undefined;

  /** @type {SelfLinkFinding[]} */
  const findings = [];
  for (const dependency of declared) {
    const entry =
      typeof packages === 'object' && packages !== null
        ? /** @type {Record<string, unknown>} */ (packages)[`node_modules/${dependency.name}`]
        : undefined;

    if (entry === undefined) {
      findings.push({ templateName, dependency, lockfilePath, problem: 'entry-missing' });
    } else if (
      typeof entry !== 'object' ||
      entry === null ||
      /** @type {Record<string, unknown>} */ (entry).link !== true
    ) {
      // An entry that exists but is not a link would make npm install the name
      // from the registry over the template's own build — a different corruption
      // of the same contract, reported distinctly so the fix is obvious.
      findings.push({ templateName, dependency, lockfilePath, problem: 'entry-not-link' });
    }
  }
  return findings;
}

/**
 * @param {string} filePath
 * @param {string} description named in the fail-closed error
 * @returns {unknown}
 */
function readJsonFailClosed(filePath, description) {
  /** @type {string} */
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`${description} ${filePath} is unreadable (${error instanceof Error ? error.message : String(error)})`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${description} ${filePath} is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

/**
 * @param {{ rootDir: string; log: (line: string) => void; logError: (line: string) => void }} context
 * @returns {number}
 */
function check({ rootDir, log, logError }) {
  const templateDirs = findTemplateDirs(rootDir);

  // Same rule as the sibling guards: zero templates found means discovery is
  // broken or the repo lost its templates, and either needs a human — a
  // vacuous pass would hide both.
  if (templateDirs.length === 0) {
    logError(
      `[template-lockfile-selflink-check] FAIL: no template found under ${rootDir} (looked for a top-level directory carrying ${MANIFEST_FILENAME}).`,
    );
    return 1;
  }

  /** @type {SelfLinkFinding[]} */
  const findings = [];
  let checkedCount = 0;

  for (const templateDir of templateDirs) {
    const templateName = path.basename(templateDir);
    const manifestPath = path.join(templateDir, 'package.json');
    const lockfilePath = path.join(templateDir, 'package-lock.json');

    // No root package.json: an add-only overlay (template-mfe) — nothing is
    // ever `npm ci`-installed at its root, so there is no lockfile contract
    // to protect. No lockfile: same conclusion from the other side.
    if (!fs.existsSync(manifestPath) || !fs.existsSync(lockfilePath)) continue;

    const manifest = readJsonFailClosed(manifestPath, 'template manifest');
    const lockfile = readJsonFailClosed(lockfilePath, 'template lockfile');
    findings.push(
      ...findMissingSelfLinks({
        manifest,
        lockfile,
        templateName,
        lockfilePath: path.relative(rootDir, lockfilePath),
      }),
    );
    checkedCount += 1;
  }

  // Same rule extended to "zero templates CHECKED": every discovered template
  // being skipped (no root package.json or no lockfile) leaves nothing
  // asserted, and a lockfile rename or move would otherwise disarm the guard
  // while it still reports success.
  if (checkedCount === 0) {
    logError(
      `[template-lockfile-selflink-check] FAIL: ${templateDirs.length} template(s) discovered under ${rootDir}, ` +
        'but none carries both a root package.json and a package-lock.json, so nothing was checked. ' +
        'If a template intentionally lost its lockfile contract, update this guard alongside it.',
    );
    return 1;
  }

  if (findings.length > 0) {
    logError(`[template-lockfile-selflink-check] FAIL: ${findings.length} self-link lockfile entr(y/ies) broken:`);
    for (const { templateName, dependency, lockfilePath, problem } of findings) {
      logError(
        problem === 'entry-missing'
          ? `  ${lockfilePath}: packages["node_modules/${dependency.name}"] is missing, but ${templateName}/package.json ${dependency.field} declares "${dependency.name}": "${dependency.spec}"`
          : `  ${lockfilePath}: packages["node_modules/${dependency.name}"] exists but is not a link entry ("link": true), so npm would install a registry copy over the template's own build`,
      );
    }
    logError(
      '\nThis is the #524 npm quirk: `npm install` reconciling an out-of-sync lockfile drops the\n' +
        'file:. self-link entry, producing a lockfile its own `npm ci` rejects ("Missing: <name> from\n' +
        'lock file"). Restore the entry —\n' +
        '\n' +
        '  "node_modules/<name>": { "resolved": "", "link": true }\n' +
        '\n' +
        '— or make the intended lockfile change surgically instead of regenerating (see\n' +
        'https://github.com/constructorfabric/gears-frontx/issues/524). Do NOT re-run `npm install`\n' +
        'to fix this: it is what removed the entry.',
    );
    return 1;
  }

  log(
    `Template lockfile self-link check passed: ${checkedCount} installable template(s) of ${templateDirs.length} ` +
      'discovered carry every self-link entry their manifest requires.',
  );
  return 0;
}

/**
 * CI entry point. Wired into `npm run policy:template-lockfile-selflink` and
 * `.github/workflows/main.yml`.
 *
 * Fail-closed throws (unreadable or malformed JSON) are caught here and turned
 * into an exit code with the message naming the offending file, same as the
 * sibling guards: a guard whose own crash looks different from its own failure
 * teaches developers to read a red build as "the script is broken".
 *
 * @param {{
 *   rootDir?: string;
 *   log?: (line: string) => void;
 *   logError?: (line: string) => void;
 * }} [options]
 * @returns {number} 0 on success, 1 on failure.
 */
export function runCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;

  try {
    return check({ rootDir, log, logError });
  } catch (error) {
    logError(`[template-lockfile-selflink-check] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  // `process.exitCode` rather than `process.exit()`: the latter can truncate
  // buffered output on some platforms, and there is nothing here that needs a
  // hard stop.
  process.exitCode = runCli();
}
