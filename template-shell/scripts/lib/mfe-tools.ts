#!/usr/bin/env node

/**
 * Shared MFE package discovery and build utilities.
 * Used by dev-all.ts (build + preview) and build-mfes.ts (build only).
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

// Resolve sibling CLIs from Node's own bin directory rather than relying on
// PATH lookup. This avoids CWE-427 (attacker-controllable PATH shadowing a
// trusted executable), even though these scripts are dev-only.
export const NODE_BIN_DIR = dirname(process.execPath);

export const MFE_PACKAGES_DIR = join(process.cwd(), 'src-app/mfe_packages');

// Packages to skip (shared libraries, hidden dirs)
const EXCLUDED_PACKAGES = new Set(['shared']);

/**
 * Whether a directory under `src-app/mfe_packages/` is not an MFE package at
 * all: the `shared` library packages import from, or a dot-directory some tool
 * left there.
 *
 * Distinct from the template-example rule, and not reported like it: this
 * answers "never was a package", where the flag answers "a package this run is
 * choosing to leave out", which is why one is announced and this one is not.
 * Shared so every scanner draws the boundary in the same place.
 */
export function isNonPackageDirectory(name: string): boolean {
  return EXCLUDED_PACKAGES.has(name) || name.startsWith('.');
}

/**
 * Environment variable that puts the template's own example packages back into
 * discovery. Off by default so an applied project runs only the packages its
 * developer added; set for a run that means to watch the shipped examples work
 * rather than read them.
 */
export const TEMPLATE_EXAMPLES_ENV_VAR = 'FRONTX_INCLUDE_TEMPLATE_EXAMPLES';

export interface MfeInfo {
  name: string;
  port: number;
}

/**
 * Whether the parsed body of an `mfe.json` declares its package as one the
 * template ships as an example or as the scaffold other packages are copied
 * from, rather than as part of the product built on top of the template.
 */
function declaresTemplateExample(mfeJson: unknown): boolean {
  return (
    typeof mfeJson === 'object' &&
    mfeJson !== null &&
    'templateExample' in mfeJson &&
    mfeJson.templateExample === true
  );
}

/**
 * The script text a package's dev-server port is declared in: its `preview`
 * script when it has one, otherwise `dev`, otherwise the empty string.
 *
 * `preview` comes first because it is the script `dev:all` actually spawns per
 * package, so its `--port` is the one the shell will reach; `dev` is the
 * fallback for a package that declares no `preview`.
 *
 * The body arrives as `unknown` straight from `JSON.parse`, so every hop down to
 * the script text is checked rather than asserted - the same narrowing
 * `declaresTemplateExample` applies to an `mfe.json` body.
 */
function portSourceScript(packageJson: unknown): string {
  if (typeof packageJson !== 'object' || packageJson === null) return '';
  if (!('scripts' in packageJson)) return '';

  const scripts = packageJson.scripts;
  if (typeof scripts !== 'object' || scripts === null) return '';

  if ('preview' in scripts && typeof scripts.preview === 'string') return scripts.preview;
  if ('dev' in scripts && typeof scripts.dev === 'string') return scripts.dev;

  return '';
}

/**
 * Whether the MFE package at `packagePath` declares itself template example
 * content via `"templateExample": true` in its `mfe.json`.
 *
 * A package that carries the flag is shipped for reading and copying, not for
 * running: an applied project inherits it along with the rest of the template's
 * territory, and leaving it in discovery is what puts screens nobody asked for
 * into the product's navigation menu (constructorfabric/gears-frontx#550).
 *
 * @param packagePath - Absolute path of the package directory, not of its `mfe.json`
 */
export function isTemplateExamplePackage(packagePath: string): boolean {
  const mfeJsonPath = join(packagePath, 'mfe.json');
  if (!existsSync(mfeJsonPath)) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(mfeJsonPath, 'utf-8'));
  } catch {
    // An `mfe.json` that does not parse is the build's failure to report: the
    // `frontxMfGts` plugin parses this same file, and its throw surfaces through
    // `buildMfesSequentially` as "MFE build failed for <name>". (Manifest
    // generation never sees it - that reads `dist/mfe-manifest.json`.) Answering
    // "not an example" leaves the package in discovery so it reaches that build,
    // rather than disappearing here under a flag it was never shown to carry.
    return false;
  }

  return declaresTemplateExample(parsed);
}

/**
 * Whether discovery includes packages that declare themselves template example
 * content. Exactly `1` opts in; anything else, set or unset, leaves the
 * product's own packages as the whole discovered set.
 *
 * One spelling on purpose. `FRONTX_CLI_FORCE_MAIN === '1'` is the ecosystem's
 * only precedent for an opt-in flag, and a second accepted spelling has to be
 * repeated on every surface that documents the flag - where the cost of one of
 * them drifting is a developer who believes examples are included and reads an
 * empty menu as a bug.
 *
 * @param env - Environment to read; defaults to the process environment
 */
export function templateExamplesIncluded(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TEMPLATE_EXAMPLES_ENV_VAR] === '1';
}

/**
 * Human-readable line naming the example packages discovery left out and the
 * variable that puts them back.
 *
 * Printed once per process, by each surface that decides to leave a package out:
 * manifest generation for the flows that build or serve, and
 * `run-mfe-type-checks.ts` for `type-check`, which generates no manifest (it
 * chains `:package`, `:package:test`, `:app`, `:packages` and `:mfe`) and so has
 * no other surface that could report it.
 *
 * Not once per npm script. `npm run build` runs `build:mfes` and then
 * `generate:mfe-manifests` as separate processes, so a project whose every
 * package is flagged sees the same four names twice - once as
 * `noDiscoveredPackagesNotice` from the build orchestrator, once from the
 * generator. Deduplicating across processes would mean passing state between
 * them, which is more machinery than a repeated informational line is worth. The
 * one repeat worth removing was inside a single process, where `dev:all` printed
 * from its own scan and again from the generator it spawns; that is why the
 * package scan returns the skipped names instead of printing them.
 */
export function templateExamplesSkippedNotice(skipped: readonly string[]): string {
  return (
    `ℹ️  Skipped ${skipped.length} template example package(s): ${skipped.join(', ')}. ` +
    `Set ${TEMPLATE_EXAMPLES_ENV_VAR}=1 to include them.`
  );
}

/**
 * The line an orchestrator prints when the scan found nothing to build or
 * serve. It names the example packages when they are the whole reason the set
 * is empty: "there are no packages here" and "every package here is an example"
 * call for different actions, and reporting both as the former after a skip
 * notice reads as a contradiction.
 */
export function noDiscoveredPackagesNotice(skippedExamples: readonly string[]): string {
  if (skippedExamples.length === 0) {
    return 'ℹ️  No MFE packages found in src-app/mfe_packages/.';
  }
  return (
    `ℹ️  No MFE packages found in src-app/mfe_packages/ beyond ${skippedExamples.length} ` +
    `template example package(s): ${skippedExamples.join(', ')}. ` +
    `Set ${TEMPLATE_EXAMPLES_ENV_VAR}=1 to include them.`
  );
}

/**
 * Outcome of one scan of an MFE packages directory. The skipped example names
 * travel with the packages because a caller reporting an empty set has to say
 * which kind of empty it is - see `noDiscoveredPackagesNotice`.
 */
export interface MfeDiscovery {
  /** Packages the shell builds, serves and aggregates, with the port each declares. */
  packages: MfeInfo[];
  /** Directory names left out because their `mfe.json` declares template example content. */
  skippedExamples: string[];
}

/**
 * Scan an MFE packages directory and extract each package's port from its
 * scripts.
 *
 * @param mfePackagesDir - Directory to scan. Defaults to this project's own
 *   `src-app/mfe_packages`; passed explicitly by tests, which cannot move the
 *   working directory the default was resolved from at import time
 */
export function getMFEPackages(mfePackagesDir: string = MFE_PACKAGES_DIR): MfeDiscovery {
  if (!existsSync(mfePackagesDir)) {
    return { packages: [], skippedExamples: [] };
  }

  const packages: MfeInfo[] = [];
  const skippedExamples: string[] = [];
  const entries = readdirSync(mfePackagesDir, { withFileTypes: true });
  const includeExamples = templateExamplesIncluded();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isNonPackageDirectory(entry.name)) continue;

    // Ahead of the port lookup: an example package is left out whether or not
    // its scripts carry a `--port`, and the "could not find --port" warning
    // below would be noise about a package nothing intends to start.
    if (!includeExamples && isTemplateExamplePackage(join(mfePackagesDir, entry.name))) {
      skippedExamples.push(entry.name);
      continue;
    }

    const pkgJsonPath = join(mfePackagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson: unknown = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const portMatch = portSourceScript(pkgJson).match(/--port\s+(\d+)/);

      if (!portMatch) {
        console.warn(`⚠️  Could not find --port in scripts for ${entry.name}, skipping`);
        continue;
      }

      packages.push({ name: entry.name, port: parseInt(portMatch[1], 10) });
    } catch (e) {
      console.warn(`⚠️  Failed to read package.json for ${entry.name}:`, e);
    }
  }

  return { packages, skippedExamples };
}

/** Build MFE packages sequentially using vite build in each package directory. */
export async function buildMfesSequentially(mfes: MfeInfo[]): Promise<void> {
  if (mfes.length === 0) return;

  console.log('📦 Building MFE packages...\n');

  // Spawn `vite build` per package with `cwd` set to that package — avoids
  // `/bin/sh -c` concatenation (which is non-portable on Windows and fragile
  // when a package path contains shell-special characters).
  for (const mfe of mfes) {
    await new Promise<void>((resolve, reject) => {
      const npxPath = join(
        NODE_BIN_DIR,
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
      );
      const proc = spawn(npxPath, ['vite', 'build'], {
        stdio: 'inherit',
        cwd: join(MFE_PACKAGES_DIR, mfe.name),
      });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`MFE build failed for ${mfe.name} with exit code ${code}`));
      });
    });
  }

  console.log('\n✅ All MFE packages built successfully.\n');
}
