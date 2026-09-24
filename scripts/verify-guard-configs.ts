#!/usr/bin/env node

/**
 * FrontX Guard Config Verification Script
 * Verifies that the shared ESLint and dependency-cruiser configs in `internal/`
 * are correctly structured and still carry the rules the boundary guards
 * depend on. Running a guard cannot detect the guard being weakened — a rule
 * deleted or renamed in the config produces no violation, only silence — so
 * this script asserts the rules exist by name (see #476).
 *
 * This script:
 * 1. Loads each config and verifies it's a valid config array/object
 * 2. Checks that derived configs extend base configs correctly
 * 3. Verifies expected rules are present in each config
 * 4. Verifies the rules that do exist are still pointed at something — that
 *    `arch:deps:core` cruises every core published library, and that no
 *    artifact-registry `[[ignore]]` names a path that is gone. A rule aimed at
 *    nothing is as silent as a rule that was deleted, and both read as green.
 * 5. Verifies the member artifact chain is registered for enforcement
 *    (`cpt-frontx-constraint-member-artifact-chain`, root DESIGN §2.2): every
 *    FrontX-owned layer member is registered in the artifacts registry as a
 *    child system in the autodetect form with DESIGN and FEATURE required, or
 *    is covered by a package-shaped `[[ignore]]` that records the debt.
 *
 * Layer *membership* and package.json edges are `npm run arch:edges`
 * (scripts/package-edge-tests.ts), not this script.
 *
 * Reads the ESLint configs from `internal/eslint-config/dist/`, so invoke it via
 * `npm run arch:guards`, which builds that package first. Run bare on a tree
 * where the package has never been built and every ESLint assertion fails on a
 * missing file — `dist/` is gitignored and `npm install` does not produce it.
 *
 * The dependency-cruiser side is ecosystem-only (base + core) after the
 * framework/template split: the retired framework/react/screenset configs
 * described packages that emigrated to the templates repository, which now
 * enforces its own internal layering in its self-owned
 * `.dependency-cruiser.cjs`. The ESLint side still ships the full set
 * because the templates in that other repository consume
 * `@gears-frontx/eslint-config/{framework,react}.js` directly as a published
 * contract, and this script is the only ecosystem-side check that those
 * published configs still build and load — ecosystem CI does not lint any
 * template.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

interface IgnoreEntry {
  reason: string;
  patterns: string[];
}

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Repo root from this file's own location, not `process.cwd()`: the check must
 * report the same thing whether it runs via `npm run arch:guards` from the root,
 * from a pre-commit hook, or from inside a package directory. Under cwd
 * resolution the last two report every config as a missing file.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ESLINT_CONFIG_DIR = join(REPO_ROOT, 'internal', 'eslint-config', 'dist');
const DEPCRUISE_CONFIG_DIR = join(REPO_ROOT, 'internal', 'depcruise-config');

// ESLint configs shipped by @gears-frontx/eslint-config. `framework`, `react`,
// and `screenset` serve template packages in the templates repository,
// which import them directly; `base` and `sdk` serve the ecosystem's own
// packages.
const ESLINT_CONFIG_NAMES = ['base', 'sdk', 'framework', 'react', 'screenset'];

// Depcruise configs shipped by @gears-frontx/depcruise-config. Ecosystem-only.
const DEPCRUISE_CONFIG_NAMES = ['base', 'core'];

/**
 * Verify ESLint configs can be imported and have correct structure
 */
async function verifyEslintConfigs(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const configs = ESLINT_CONFIG_NAMES;

  for (const configName of configs) {
    const configPath = join(ESLINT_CONFIG_DIR, `${configName}.js`);

    try {
      // Check file exists
      if (!existsSync(configPath)) {
        results.push({
          name: `ESLint ${configName}: File exists`,
          passed: false,
          message: `File not found: ${configPath}`,
        });
        continue;
      }

      // Try to import the config
      const configModule = await import(configPath);
      const config = configModule.default || configModule[`${configName}Config`];

      if (!config) {
        results.push({
          name: `ESLint ${configName}: Export found`,
          passed: false,
          message: 'No default or named export found',
        });
        continue;
      }

      // For screenset, check if it's a function (createScreensetConfig) or array
      if (configName === 'screenset') {
        const hasCreateFunction = typeof configModule.createScreensetConfig === 'function';
        const hasDefaultConfig = Array.isArray(config);

        results.push({
          name: `ESLint ${configName}: Valid structure`,
          passed: hasCreateFunction && hasDefaultConfig,
          message: hasCreateFunction && hasDefaultConfig
            ? 'Has createScreensetConfig function and default array'
            : 'Missing createScreensetConfig or default array',
        });
      } else {
        // Check it's an array (flat config format)
        const isArray = Array.isArray(config);
        results.push({
          name: `ESLint ${configName}: Valid array`,
          passed: isArray,
          message: isArray ? `Config has ${config.length} entries` : 'Config is not an array',
        });
      }

      results.push({
        name: `ESLint ${configName}: Loads successfully`,
        passed: true,
        message: 'Config loaded without errors',
      });
    } catch (error) {
      results.push({
        name: `ESLint ${configName}: Loads successfully`,
        passed: false,
        message: `Import error: ${(error as Error).message}`,
      });
    }
  }

  return results;
}

/**
 * Verify dependency-cruiser configs can be loaded and have correct structure
 */
function verifyDepcruiseConfigs(): TestResult[] {
  const results: TestResult[] = [];
  const configs = DEPCRUISE_CONFIG_NAMES;

  for (const configName of configs) {
    const configPath = join(DEPCRUISE_CONFIG_DIR, `${configName}.cjs`);

    try {
      // Check file exists
      if (!existsSync(configPath)) {
        results.push({
          name: `Depcruise ${configName}: File exists`,
          passed: false,
          message: `File not found: ${configPath}`,
        });
        continue;
      }

      // Try to require the config
      const config = require(configPath);

      // Check it has forbidden array
      const hasForbidden = Array.isArray(config.forbidden);
      results.push({
        name: `Depcruise ${configName}: Has forbidden array`,
        passed: hasForbidden,
        message: hasForbidden
          ? `${config.forbidden.length} forbidden rules`
          : 'Missing forbidden array',
      });

      // Check it has options
      const hasOptions = typeof config.options === 'object';
      results.push({
        name: `Depcruise ${configName}: Has options`,
        passed: hasOptions,
        message: hasOptions ? 'Options present' : 'Missing options object',
      });

      results.push({
        name: `Depcruise ${configName}: Loads successfully`,
        passed: true,
        message: 'Config loaded without errors',
      });
    } catch (error) {
      results.push({
        name: `Depcruise ${configName}: Loads successfully`,
        passed: false,
        message: `Require error: ${(error as Error).message}`,
      });
    }
  }

  return results;
}

/**
 * Verify the core config carries the boundary restrictions.
 *
 * Rule names are asserted literally, so a rename in core.cjs without a matching
 * update here fails the check. That is deliberate: the previous version of this
 * script asserted a name (`sdk-no-frontx-imports`) that the config had since
 * renamed, and because nothing ran the script the mismatch sat undetected (#476).
 * The fix for a failure here is to reconcile the two, never to loosen the check.
 */
function verifyCoreRestrictions(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const coreConfig = require(join(DEPCRUISE_CONFIG_DIR, 'core.cjs'));

    const requiredRules: [string, string][] = [
      // Core packages carry no @gears-frontx imports...
      ['core-no-gears-frontx-imports', 'Core isolation'],
      // ...except the one type-substrate port edge, itself narrowed to the runtime.
      ['core-port-provider-only-imports-runtime', 'Type-substrate port narrowing'],
      // The substrate stays UI-framework-agnostic.
      ['core-no-react', 'UI-framework agnosticism'],
      // Inherited from base.cjs.
      ['no-circular', 'Inherited base rule'],
    ];

    for (const [ruleName, description] of requiredRules) {
      const hasRule = coreConfig.forbidden.some(
        (rule: { name: string }) => rule.name === ruleName
      );
      results.push({
        name: `Core config: Has ${ruleName} (${description})`,
        passed: hasRule,
        message: hasRule ? 'Rule present' : 'RULE MISSING - boundary enforcement lost!',
      });
    }
  } catch (error) {
    results.push({
      name: 'Core config: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify `arch:deps:core` still cruises exactly the core membership.
 *
 * `layer-constants.cjs` calls itself the single source of truth for layer
 * membership, and the depcruise rules do derive their path patterns from it —
 * but the npm script that *invokes* dependency-cruiser names the source roots
 * literally on the command line, so membership is duplicated there in a place
 * no rule can see. A package whose `core` property is set in
 * `PUBLISHED_LIBRARY_PROPERTIES` but is missing from the script gets the core
 * rules compiled and then never applied to it: the cruise passes because that
 * package's files were never in the set being cruised. That is the shape this
 * whole script exists for, and it is the exact shape that let
 * `packages/telemetry` land unguarded (#495) — an enumeration standing in for
 * the membership list, failing open.
 */
function verifyCoreCruiseTargets(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const { CORE_PACKAGES } = require(
      join(DEPCRUISE_CONFIG_DIR, 'layer-constants.cjs')
    ) as { CORE_PACKAGES: readonly string[] };

    const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const script = rootPkg.scripts?.['arch:deps:core'];

    if (script === undefined) {
      return [
        {
          name: 'arch:deps:core: Script present',
          passed: false,
          message:
            'No `arch:deps:core` script in the root package.json — the core ' +
            'import-graph rules have no invocation, so they enforce nothing.',
        },
      ];
    }

    // Positional source roots only: every token shaped like a package src root.
    // Flags and their values never take this shape.
    const cruised = script.split(/\s+/).filter((token) => /^packages\/[^/]+\/src$/.test(token));
    const expected = CORE_PACKAGES.map((name) => `packages/${name}/src`);

    const missing = expected.filter((dir) => !cruised.includes(dir));
    const extra = cruised.filter((dir) => !expected.includes(dir));

    results.push({
      name: 'arch:deps:core: Cruises exactly the core membership',
      passed: missing.length === 0 && extra.length === 0,
      message:
        missing.length === 0 && extra.length === 0
          ? `All ${expected.length} core src roots cruised`
          : [
              missing.length > 0
                ? `Not cruised, so unguarded: ${missing.join(', ')}`
                : undefined,
              extra.length > 0 ? `Cruised but not a member: ${extra.join(', ')}` : undefined,
              'Reconcile the `arch:deps:core` script with the core property in ' +
                'internal/depcruise-config/layer-constants.cjs (PUBLISHED_LIBRARY_PROPERTIES).',
            ]
              .filter(Boolean)
              .join('. '),
    });
  } catch (error) {
    results.push({
      name: 'arch:deps:core: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify the ecosystem-wide sole-engine cruise in `scripts/test-architecture.ts`
 * still scans every `packages/*` directory, not the nine members it happened to
 * list when it was written.
 *
 * `frontx-routing-tanstack-3-sole-engine-import` is deliberately ecosystem-wide —
 * every package other than `@gears-frontx/routing-tanstack` is where the leak
 * would show up — but the `npm run arch:check` invocation that actually cruises
 * it names its source roots literally in that file's own command string
 * (see the ROUTING-1..3 / ROUTING-TANSTACK-1..3 block), the same way
 * `arch:deps:core`'s roots are named literally in the root `package.json` script
 * `verifyCoreCruiseTargets` above pins. A `packages/*` directory added after
 * that command was written is never passed to dependency-cruiser, so the rule
 * silently never fires against it — the exact "correct rule, unenforced scope"
 * gap #495 already proved once for the core cruise, one level up for the
 * ecosystem-wide one.
 */
async function verifyEcosystemCruiseTargets(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const ecosystemPackagesModule = (await import(
      pathToFileURL(join(REPO_ROOT, 'scripts', 'ecosystem-packages.mjs')).href
    )) as { readEcosystemPackages: (rootDir: string) => Array<{ dir: string }> };

    const expected = ecosystemPackagesModule
      .readEcosystemPackages(REPO_ROOT)
      .map((pkg) => `packages/${pkg.dir}/src`);

    const testArchitectureSource = readFileSync(
      join(REPO_ROOT, 'scripts', 'test-architecture.ts'),
      'utf-8'
    );

    // The cruise command sits between these marker comments (one instance
    // covering all four ROUTING-1..3 / ROUTING-TANSTACK-1..3 constraints) —
    // slicing on them, rather than scanning the whole file, keeps this check
    // from picking up an unrelated `packages/<name>/src` token from one of the
    // file's other, narrower dependency-cruiser invocations.
    const beginMarker =
      '@cpt-begin:cpt-frontx-constraint-routing-tanstack-sole-engine-import:p2:inst-arch-check';
    const endMarker =
      '@cpt-end:cpt-frontx-constraint-routing-tanstack-sole-engine-import:p2:inst-arch-check';
    const beginIndex = testArchitectureSource.indexOf(beginMarker);
    const endIndex = testArchitectureSource.indexOf(endMarker);

    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
      return [
        {
          name: 'scripts/test-architecture.ts: Ecosystem sole-engine cruise block present',
          passed: false,
          message:
            'RULE MISSING - could not find the ROUTING-TANSTACK-3 sole-engine cruise ' +
            'block by its cpt markers, so the cruise scope cannot be verified.',
        },
      ];
    }

    const cruiseBlock = testArchitectureSource.slice(beginIndex, endIndex);
    const cruised = Array.from(
      new Set(Array.from(cruiseBlock.matchAll(/packages\/[^/'"\s]+\/src/g), (m) => m[0]))
    );

    const missing = expected.filter((dir) => !cruised.includes(dir));
    const extra = cruised.filter((dir) => !expected.includes(dir));

    results.push({
      name: 'scripts/test-architecture.ts: Ecosystem sole-engine cruise scans every packages/* directory',
      passed: missing.length === 0 && extra.length === 0,
      message:
        missing.length === 0 && extra.length === 0
          ? `All ${expected.length} ecosystem src roots cruised`
          : [
              missing.length > 0
                ? `Not cruised, so unguarded: ${missing.join(', ')}`
                : undefined,
              extra.length > 0
                ? `Cruised but no longer a packages/* directory: ${extra.join(', ')}`
                : undefined,
              'Reconcile the ROUTING-TANSTACK-3 cruise command in scripts/test-architecture.ts ' +
                'with the packages/* directories on disk.',
            ]
              .filter(Boolean)
              .join('. '),
    });
  } catch (error) {
    results.push({
      name: 'scripts/test-architecture.ts: Ecosystem cruise target verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify `frontx-routing-3-no-engine-leak`'s router-name patterns actually
 * catch a scoped router engine, not just an unscoped one.
 *
 * `[^/]*router[^/]*` alone only ever tests a bare specifier's first path
 * segment, so for a scoped package (`@remix-run/router`) that segment is the
 * npm scope, not the package name — "router" never appears there, so the
 * unscoped pattern silently let every scoped engine through while the rule's
 * own comment named `@remix-run/router` as covered. Running the cruise
 * cannot surface that gap: an unmatched import produces no violation, only
 * silence, the same failure shape this script exists to catch elsewhere
 * (#476, #523). Checked against the bare-specifier and `node_modules`-
 * relative forms dependency-cruiser resolves an import to (the same two
 * forms the rule's own patterns test), and against names that must keep
 * passing through unmatched — a router-name pattern has no business
 * touching an unrelated TanStack or third-party package.
 */
const ROUTER_ENGINE_PACKAGE_NAMES = [
  'react-router',
  '@remix-run/router',
  '@tanstack/react-router',
  '@tanstack/router-core',
];
// Every name below must not be caught by the router-name patterns — but the
// rule also carries a separate blanket ban on the entire `@tanstack/` scope
// (`.dependency-cruiser.cjs`, same rule, two additional `path` entries), so
// the two `@tanstack/*` names here are still blocked by the rule as a whole,
// just not by the router-name patterns this script isolates above. Only
// `lodash` and `react` are unblocked by every part of the rule.
const NON_ROUTER_PACKAGE_NAMES = ['@tanstack/react-table', '@tanstack/react-query', 'lodash', 'react'];
const TANSTACK_SCOPE_PACKAGE_NAMES = ['@tanstack/react-table', '@tanstack/react-query'];
const RULE_UNBLOCKED_PACKAGE_NAMES = ['lodash', 'react'];

function verifyRoutingEngineLeakPattern(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const rootConfig = require(join(REPO_ROOT, '.dependency-cruiser.cjs'));
    const rule = (
      rootConfig.forbidden as Array<{ name: string; to?: { path?: string | string[] } }>
    ).find((r) => r.name === 'frontx-routing-3-no-engine-leak');

    if (!rule) {
      results.push({
        name: 'frontx-routing-3-no-engine-leak: Rule present',
        passed: false,
        message: 'RULE MISSING - the no-engine-leak boundary is gone!',
      });
      return results;
    }

    const allPaths = Array.isArray(rule.to?.path)
      ? rule.to.path
      : rule.to?.path
        ? [rule.to.path]
        : [];
    // Isolate the router-name patterns from the rule's separate blanket
    // `@tanstack/` ban: only the former claims to catch "any package whose
    // name contains router", so only the former is asserted below to not
    // over-match. Neither blanket-ban entry contains the substring "router".
    const routerNamePatterns = allPaths.filter((p) => p.includes('router'));
    const blanketTanstackBanPatterns = allPaths.filter((p) => !p.includes('router'));

    for (const engineName of ROUTER_ENGINE_PACKAGE_NAMES) {
      const matchesBare = routerNamePatterns.some((p) => new RegExp(p).test(engineName));
      const matchesNodeModules = routerNamePatterns.some((p) =>
        new RegExp(p).test(`node_modules/${engineName}`)
      );
      const passed = matchesBare && matchesNodeModules;
      results.push({
        name: `frontx-routing-3-no-engine-leak: catches ${engineName}`,
        passed,
        message: passed
          ? 'Matched in both bare-specifier and node_modules forms'
          : `PATTERN GAP - ${engineName} not caught (bare=${matchesBare}, node_modules=${matchesNodeModules})`,
      });
    }

    for (const packageName of NON_ROUTER_PACKAGE_NAMES) {
      const matches = routerNamePatterns.some((p) => new RegExp(p).test(packageName));
      results.push({
        name: `frontx-routing-3-no-engine-leak: router-name patterns do not match ${packageName}`,
        passed: !matches,
        message: matches
          ? `OVER-MATCH - ${packageName} incorrectly caught by the router-name pattern`
          : 'Not matched',
      });
    }

    // The two `@tanstack/*` names above pass the assertion above for the
    // wrong reason if the blanket ban were ever removed — assert separately
    // that the rule as a whole still blocks them, via that other pattern
    // pair, not the router-name one.
    for (const packageName of TANSTACK_SCOPE_PACKAGE_NAMES) {
      const matchesBare = blanketTanstackBanPatterns.some((p) => new RegExp(p).test(packageName));
      const matchesNodeModules = blanketTanstackBanPatterns.some((p) =>
        new RegExp(p).test(`node_modules/${packageName}`),
      );
      const passed = matchesBare && matchesNodeModules;
      results.push({
        name: `frontx-routing-3-no-engine-leak: the blanket @tanstack/ ban still blocks ${packageName}`,
        passed,
        message: passed
          ? 'Matched in both bare-specifier and node_modules forms'
          : `PATTERN GAP - ${packageName} not blocked by the blanket @tanstack/ ban (bare=${matchesBare}, node_modules=${matchesNodeModules})`,
      });
    }

    // `lodash` and `react` sit outside both the router-name patterns and the
    // `@tanstack/` scope — nothing in this rule should match them.
    for (const packageName of RULE_UNBLOCKED_PACKAGE_NAMES) {
      const matches = allPaths.some((p) => new RegExp(p).test(packageName));
      results.push({
        name: `frontx-routing-3-no-engine-leak: no part of the rule blocks ${packageName}`,
        passed: !matches,
        message: matches ? `OVER-MATCH - ${packageName} incorrectly caught by the rule` : 'Not matched',
      });
    }
  } catch (error) {
    results.push({
      name: 'frontx-routing-3-no-engine-leak: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify `frontx-routing-2-no-intra-ecosystem-dependency` forbids
 * @gears-frontx/routing from importing its own provider,
 * @gears-frontx/routing-tanstack. Checked in all three resolved shapes
 * `pkgTargets` produces (`.dependency-cruiser.cjs`'s own header comment: a
 * `to` pattern that covers only one of the three is a pattern that silently
 * never fires for the other two), plus a regression guard over the six
 * packages the rule already forbade — widening it to also name
 * routing-tanstack must not be the change that silently narrows it to
 * *only* routing-tanstack.
 */
const ROUTING_TANSTACK_RESOLVED_FORMS = [
  'packages/routing-tanstack/src/index.ts',
  'node_modules/@gears-frontx/routing-tanstack/dist/index.js',
  '@gears-frontx/routing-tanstack',
];
const OTHER_INTRA_ECOSYSTEM_FORBIDDEN_PACKAGES = [
  'mfes',
  'gts-plugin',
  'api',
  'cli',
  'cyber-pilot-kit-frontx',
  'ui-kit',
  'telemetry',
  'calendar-kit',
];

function verifyRoutingCoreProviderIsolation(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const rootConfig = require(join(REPO_ROOT, '.dependency-cruiser.cjs'));
    const rule = (
      rootConfig.forbidden as Array<{ name: string; to?: { path?: string | string[] } }>
    ).find((r) => r.name === 'frontx-routing-2-no-intra-ecosystem-dependency');

    if (!rule) {
      results.push({
        name: 'frontx-routing-2-no-intra-ecosystem-dependency: Rule present',
        passed: false,
        message: 'RULE MISSING - @gears-frontx/routing has no intra-ecosystem-dependency boundary!',
      });
      return results;
    }

    const allPaths = Array.isArray(rule.to?.path)
      ? rule.to.path
      : rule.to?.path
        ? [rule.to.path]
        : [];

    for (const form of ROUTING_TANSTACK_RESOLVED_FORMS) {
      const matches = allPaths.some((p) => new RegExp(p).test(form));
      results.push({
        name: `frontx-routing-2-no-intra-ecosystem-dependency: blocks the core importing its provider (${form})`,
        passed: matches,
        message: matches
          ? 'Matched'
          : `PATTERN GAP - @gears-frontx/routing can import routing-tanstack unresolved through this shape: ${form}`,
      });
    }

    for (const packageName of OTHER_INTRA_ECOSYSTEM_FORBIDDEN_PACKAGES) {
      const sample = `packages/${packageName}/src/index.ts`;
      const matches = allPaths.some((p) => new RegExp(p).test(sample));
      results.push({
        name: `frontx-routing-2-no-intra-ecosystem-dependency: still blocks ${packageName}`,
        passed: matches,
        message: matches ? 'Matched' : `REGRESSION - ${packageName} no longer blocked (${sample})`,
      });
    }
  } catch (error) {
    results.push({
      name: 'frontx-routing-2-no-intra-ecosystem-dependency: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify `frontx-routing-tanstack-3-sole-engine-import` bans a concrete
 * non-TanStack router engine — `react-router`, `react-router-dom`,
 * `vue-router`, `@remix-run/router` — ecosystem-wide, not just `@tanstack/*`,
 * and that its `from` still binds every ecosystem package except the
 * provider package itself (the entire point of the rule: a concrete engine
 * is only permitted from *inside* @gears-frontx/routing-tanstack). Mirrors
 * `verifyRoutingEngineLeakPattern` above for the mirror-image rule.
 */
const NON_TANSTACK_ENGINE_PACKAGE_NAMES = [
  'react-router',
  'react-router-dom',
  'vue-router',
  '@remix-run/router',
];
const SOLE_ENGINE_BOUND_PACKAGES = [
  'mfes',
  'gts-plugin',
  'api',
  'cli',
  'cyber-pilot-kit-frontx',
  'ui-kit',
  'telemetry',
  'routing',
  'calendar-kit',
];

function verifySoleEngineImportPattern(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const rootConfig = require(join(REPO_ROOT, '.dependency-cruiser.cjs'));
    const rule = (
      rootConfig.forbidden as Array<{
        name: string;
        from?: { path?: string };
        to?: { path?: string | string[]; pathNot?: string | string[] };
      }>
    ).find((r) => r.name === 'frontx-routing-tanstack-3-sole-engine-import');

    if (!rule) {
      results.push({
        name: 'frontx-routing-tanstack-3-sole-engine-import: Rule present',
        passed: false,
        message: 'RULE MISSING - the sole-engine-import boundary is gone!',
      });
      return results;
    }

    const fromPattern = rule.from?.path ?? '';
    for (const packageName of SOLE_ENGINE_BOUND_PACKAGES) {
      const matches = new RegExp(fromPattern).test(`packages/${packageName}/src/index.ts`);
      results.push({
        name: `frontx-routing-tanstack-3-sole-engine-import: from binds ${packageName}/src`,
        passed: matches,
        message: matches ? 'Matched' : `REGRESSION - ${packageName}/src no longer bound by this rule`,
      });
    }
    const excludesProvider = !new RegExp(fromPattern).test('packages/routing-tanstack/src/index.ts');
    results.push({
      name: 'frontx-routing-tanstack-3-sole-engine-import: from excludes the provider package itself',
      passed: excludesProvider,
      message: excludesProvider
        ? 'Excluded, as intended - the provider is the one package allowed a concrete engine'
        : 'REGRESSION - the rule now forbids the provider its own sole engine',
    });

    const allPaths = Array.isArray(rule.to?.path) ? rule.to.path : rule.to?.path ? [rule.to.path] : [];
    const allPathNot = Array.isArray(rule.to?.pathNot)
      ? rule.to.pathNot
      : rule.to?.pathNot
        ? [rule.to.pathNot]
        : [];

    for (const engineName of NON_TANSTACK_ENGINE_PACKAGE_NAMES) {
      const matchesBare = allPaths.some((p) => new RegExp(p).test(engineName));
      const matchesNodeModules = allPaths.some((p) => new RegExp(p).test(`node_modules/${engineName}`));
      const passed = matchesBare && matchesNodeModules;
      results.push({
        name: `frontx-routing-tanstack-3-sole-engine-import: blocks ${engineName} outside the provider package`,
        passed,
        message: passed
          ? 'Matched in both bare-specifier and node_modules forms'
          : `PATTERN GAP - ${engineName} not caught (bare=${matchesBare}, node_modules=${matchesNodeModules})`,
      });
    }

    const reactTableForms = ['@tanstack/react-table', 'node_modules/@tanstack/react-table'];
    const reactTableAllowed = reactTableForms.every((form) =>
      allPathNot.some((p) => new RegExp(p).test(form))
    );
    results.push({
      name: 'frontx-routing-tanstack-3-sole-engine-import: still carves out @tanstack/react-table',
      passed: reactTableAllowed,
      message: reactTableAllowed
        ? 'react-table carve-out intact'
        : 'REGRESSION - @tanstack/react-table is no longer carved out of the ban',
    });
  } catch (error) {
    results.push({
      name: 'frontx-routing-tanstack-3-sole-engine-import: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify `frontx-telemetry-1-no-template-content` carries the
 * `couldNotResolve: false` guard the routing "no template content" rules
 * already carry. Without it, any unresolved bare specifier — an uninstalled
 * npm package, not just template content — keeps its bare form as `resolved`
 * and reads as "imports template territory" for the wrong reason (the exact
 * false-positive this rule's sibling routing rules were already patched
 * against). A cruise cannot detect this gap by running: an unresolved import
 * from an uninstalled package DOES trip the rule, just not for the reason
 * its name claims — the same "passes for the wrong reason" shape every other
 * check in this file exists to catch.
 */
function verifyTelemetryTemplateContentResolutionGuard(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const rootConfig = require(join(REPO_ROOT, '.dependency-cruiser.cjs'));
    const rule = (
      rootConfig.forbidden as Array<{ name: string; to?: { couldNotResolve?: boolean } }>
    ).find((r) => r.name === 'frontx-telemetry-1-no-template-content');

    if (!rule) {
      results.push({
        name: 'frontx-telemetry-1-no-template-content: Rule present',
        passed: false,
        message: 'RULE MISSING - the telemetry template-content boundary is gone!',
      });
      return results;
    }

    const passed = rule.to?.couldNotResolve === false;
    results.push({
      name: 'frontx-telemetry-1-no-template-content: guards against unresolved-specifier false positives',
      passed,
      message: passed
        ? 'couldNotResolve: false present - an uninstalled npm package is no longer mistaken for a template-content violation'
        : 'GUARD MISSING - any unresolved bare specifier (e.g. an uninstalled router package) trips this rule for the wrong reason',
    });
  } catch (error) {
    results.push({
      name: 'frontx-telemetry-1-no-template-content: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify `doNotFollow` bounds `node_modules` at any depth in both depcruise
 * configs that cruise the ecosystem tree.
 *
 * The pattern is asserted literally: npm nests a `node_modules` under a
 * workspace whenever its pins conflict with the root's, and an anchored
 * `^node_modules` lets traversal descend into those until dependency-cruiser
 * OOMs in CI (#523). Running the cruise cannot detect a regression here — a
 * loosened pattern produces no violation, only a silently growing graph — so
 * this is asserted the same way the rule names are. The root config lives
 * outside `internal/`, but it is a boundary guard all the same.
 */
const NODE_MODULES_ANY_DEPTH = '(^|/)node_modules/';

function verifyDoNotFollowPatterns(): TestResult[] {
  const results: TestResult[] = [];

  const targets: [string, string][] = [
    [join(DEPCRUISE_CONFIG_DIR, 'base.cjs'), 'Depcruise base'],
    [join(REPO_ROOT, '.dependency-cruiser.cjs'), 'Depcruise root'],
  ];

  for (const [configPath, label] of targets) {
    try {
      const config = require(configPath);
      const doNotFollow = config.options?.doNotFollow;
      const paths =
        typeof doNotFollow === 'string'
          ? [doNotFollow]
          : Array.isArray(doNotFollow?.path)
            ? doNotFollow.path
            : [doNotFollow?.path];
      const hasPattern = paths.includes(NODE_MODULES_ANY_DEPTH);
      results.push({
        name: `${label}: doNotFollow matches node_modules at any depth`,
        passed: hasPattern,
        message: hasPattern
          ? `Pattern ${NODE_MODULES_ANY_DEPTH} present`
          : `PATTERN MISSING - an anchored node_modules regresses to the #523 CI OOM! Got: ${JSON.stringify(doNotFollow)}`,
      });
    } catch (error) {
      results.push({
        name: `${label}: doNotFollow verification`,
        passed: false,
        message: `Error: ${(error as Error).message}`,
      });
    }
  }

  return results;
}

/**
 * Every `[[ignore]]` entry in the Studio artifact registry, in file order.
 *
 * A deliberately narrow reader rather than a TOML dependency: it needs one
 * table kind with two string-bearing keys. Every departure from the shape it
 * expects throws instead of being skipped, because a parser that silently
 * understood less than the file says would make these checks pass by finding
 * nothing — the same fail-open they exist to detect.
 */
function ignoreEntries(tomlPath: string): IgnoreEntry[] {
  const entries: IgnoreEntry[] = [];
  let inIgnoreTable = false;
  let sawPatterns = false;
  let sawReason = false;
  let pendingPatterns: string | null = null;
  let currentEntry: IgnoreEntry | null = null;

  const finalizeCurrentEntry = (lineNo: number): void => {
    if (!inIgnoreTable) return;
    if (!sawReason) {
      throw new Error(
        `${tomlPath}:${lineNo}: an [[ignore]] table with no reason key. The registry's ignore ` +
          `shape has changed; update this reader.`
      );
    }
    if (!sawPatterns) {
      throw new Error(
        `${tomlPath}:${lineNo}: an [[ignore]] table with no patterns key. The registry's ` +
          `ignore shape has changed; update this reader.`
      );
    }
    if (currentEntry === null || currentEntry.reason.trim() === '') {
      throw new Error(
        `${tomlPath}:${lineNo}: an [[ignore]] reason must be a non-empty double-quoted string.`
      );
    }
    if (currentEntry.patterns.length === 0) {
      throw new Error(
        `${tomlPath}:${lineNo}: an [[ignore]] patterns array must contain at least one pattern.`
      );
    }
  };

  const collect = (raw: string, lineNo: number): void => {
    const quoted = raw.match(/"[^"]*"/g);
    if (quoted === null) {
      throw new Error(
        `${tomlPath}:${lineNo}: an [[ignore]] patterns array with no double-quoted entries. ` +
          `This reader handles double-quoted strings only; extend it rather than letting ` +
          `patterns go unchecked.`
      );
    }
    currentEntry?.patterns.push(...quoted.map((entry) => entry.slice(1, -1)));
  };

  const readReason = (text: string, lineNo: number): void => {
    const match = text.match(/^reason\s*=\s*"([^"]*)"\s*(#.*)?$/);
    if (match === null) {
      throw new Error(
        `${tomlPath}:${lineNo}: an [[ignore]] reason must be a double-quoted string on one line.`
      );
    }
    const reason = match[1].trim();
    if (reason === '') {
      throw new Error(`${tomlPath}:${lineNo}: an [[ignore]] reason must not be blank.`);
    }
    if (currentEntry === null) {
      throw new Error(`${tomlPath}:${lineNo}: internal error: missing [[ignore]] entry state.`);
    }
    currentEntry.reason = reason;
  };

  const lines = readFileSync(tomlPath, 'utf-8').split('\n');

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const text = line.trim();

    if (pendingPatterns !== null) {
      pendingPatterns += text;
      if (text.includes(']')) {
        collect(pendingPatterns, lineNo);
        pendingPatterns = null;
      }
      return;
    }

    if (text.startsWith('[')) {
      if (inIgnoreTable) {
        finalizeCurrentEntry(lineNo);
      }
      inIgnoreTable = text === '[[ignore]]';
      sawPatterns = false;
      sawReason = false;
      if (inIgnoreTable) {
        currentEntry = { reason: '', patterns: [] };
        entries.push(currentEntry);
      } else {
        currentEntry = null;
      }
      return;
    }

    if (!inIgnoreTable || text === '' || text.startsWith('#')) return;

    if (/^reason\s*=/.test(text)) {
      sawReason = true;
      readReason(text, lineNo);
      return;
    }

    if (/^patterns\s*=/.test(text)) {
      sawPatterns = true;
      if (text.includes(']')) {
        collect(text, lineNo);
      } else {
        pendingPatterns = text;
      }
    }
  });

  if (pendingPatterns !== null) {
    throw new Error(`${tomlPath}: unterminated patterns array at end of file.`);
  }
  if (inIgnoreTable) {
    finalizeCurrentEntry(lines.length);
  }

  return entries;
}

function ignorePatterns(tomlPath: string): string[] {
  return ignoreEntries(tomlPath).flatMap((entry) => entry.patterns);
}

function literalPrefix(pattern: string): string | null {
  if (/^[*?[]/.test(pattern)) return null;
  const wildcard = pattern.search(/[*?[]/);
  const literal = (wildcard === -1 ? pattern : pattern.slice(0, wildcard)).replace(/\/+$/, '');
  return literal === '' ? null : literal;
}

function memberDebtReasonStatus(reason: string): { ok: boolean; missing: string[] } {
  const normalized = reason.trim();
  const recordsDebt =
    /\b(no|missing|without)\b[\s\S]{0,120}\b(backing|active)?\s*(cdsl|artifact)\b/i.test(normalized) ||
    /\bno\b[\s\S]{0,120}\bartifact\b[\s\S]{0,80}\b(backs?|backing)\b/i.test(normalized);
  const recordsRemovalCriterion =
    /\bRemoval criterion\b/i.test(normalized) &&
    /\bregister(?:ed|ing)?\b/i.test(normalized) &&
    /\bPRD\b/.test(normalized) &&
    /\bDESIGN\b/.test(normalized) &&
    /\bFEATURE\b/.test(normalized);

  return {
    ok: recordsDebt && recordsRemovalCriterion,
    missing: [
      ...(recordsDebt ? [] : ['current artifact-chain debt']),
      ...(recordsRemovalCriterion ? [] : ['objective removal criterion']),
    ],
  };
}

function matchingMemberDebtIgnore(
  dir: string,
  entries: readonly IgnoreEntry[]
): { reason: string; missing: string[] } | null {
  for (const entry of entries) {
    for (const pattern of entry.patterns) {
      if (literalPrefix(pattern) !== dir) continue;
      const status = memberDebtReasonStatus(entry.reason);
      if (status.ok) return { reason: entry.reason, missing: [] };
      return { reason: entry.reason, missing: status.missing };
    }
  }
  return null;
}

/**
 * Verify no `[[ignore]]` names a path that cannot match anything.
 *
 * An ignore is an assertion that some code needs no traceability. Once the code
 * it named is gone, the entry stops being an assertion and becomes a rule that
 * can never fire — indistinguishable from an active exemption when read, and
 * carrying a stale reason nobody will revisit. `packages/docs/*` and
 * `packages/auth/*` sat here long after both directories were deleted.
 *
 * Checked by existence rather than by an expiry date, because a date needs a
 * human to notice it passed, and the thing that makes these entries rot is
 * precisely that nobody looks. Only the literal prefix is checked, so the
 * *structural* ignores — the leading-wildcard patterns for dist, node_modules,
 * test files, build configs and demos — are correctly left alone: they are
 * permanent by nature and name no single location. That split is the one
 * decided for the registry, and it falls out of each pattern's own shape rather
 * than needing a second list to maintain.
 */
function verifyIgnoreFreshness(): TestResult[] {
  const tomlPath = join(REPO_ROOT, '.cf-studio', 'config', 'artifacts.toml');

  if (!existsSync(tomlPath)) {
    return [
      {
        name: 'Artifact registry: Present',
        passed: false,
        message: `Not found: ${tomlPath}`,
      },
    ];
  }

  try {
    const anchored = ignorePatterns(tomlPath).filter((pattern) => !/^[*?[]/.test(pattern));
    const stale = anchored.filter((pattern) => {
      const wildcard = pattern.search(/[*?[]/);
      const literal = (wildcard === -1 ? pattern : pattern.slice(0, wildcard)).replace(/\/+$/, '');
      return literal !== '' && !existsSync(join(REPO_ROOT, literal));
    });

    return [
      {
        name: 'Artifact registry: No ignore names a path that is gone',
        passed: stale.length === 0,
        message:
          stale.length === 0
            ? `All ${anchored.length} path-anchored ignore pattern(s) still name something on disk`
            : `Stale ignore pattern(s): ${stale.join(', ')} — delete the entry, or correct the ` +
              `path if the code moved. An ignore for code that no longer exists cannot fire.`,
      },
    ];
  } catch (error) {
    return [
      {
        name: 'Artifact registry: Ignore patterns readable',
        passed: false,
        message: (error as Error).message,
      },
    ];
  }
}

interface ChildSystem {
  slug: string | null;
  artifactsDir: string | null;
  /** Artifact kinds declared under the child's autodetect block: kind -> required. */
  autodetectKinds: Record<string, boolean>;
  /** True if the child declares artifacts outside an autodetect block. */
  hasExplicitArtifacts: boolean;
}

/**
 * Every `[[systems.children]]` node in the Studio artifact registry, with the
 * artifact kinds its autodetect block declares and their `required` flags.
 *
 * The same deliberately narrow reader philosophy as `ignorePatterns`: it needs
 * the child tables and three keys, and a parser that silently understood less
 * than the file says would make the registration check pass by finding nothing.
 * An unspecified `required` is `true` — that is the kit's own default (the root
 * system's PRD/DESIGN/DECOMPOSITION carry no flag and are required).
 */
function childSystems(tomlPath: string): ChildSystem[] {
  const children: ChildSystem[] = [];
  let current: ChildSystem | null = null;
  // Which table the following key lines belong to.
  let context: 'child' | 'autodetect-kind' | 'explicit-artifacts' | 'other' = 'other';
  let currentKind: string | null = null;

  const lines = readFileSync(tomlPath, 'utf-8').split('\n');

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const text = line.trim();
    if (text === '' || text.startsWith('#')) return;

    if (text.startsWith('[')) {
      currentKind = null;
      if (text === '[[systems.children]]') {
        current = { slug: null, artifactsDir: null, autodetectKinds: {}, hasExplicitArtifacts: false };
        children.push(current);
        context = 'child';
        return;
      }
      if (text === '[[systems.children.autodetect]]' || text === '[systems.children.autodetect.artifacts]') {
        context = 'other';
        return;
      }
      const kindHeader = text.match(/^\[systems\.children\.autodetect\.artifacts\.([A-Za-z0-9_-]+)\]$/);
      if (kindHeader !== null) {
        if (current === null) {
          throw new Error(
            `${tomlPath}:${lineNo}: a child autodetect artifact table before any [[systems.children]].`
          );
        }
        currentKind = kindHeader[1];
        current.autodetectKinds[currentKind] = true;
        context = 'autodetect-kind';
        return;
      }
      if (/^\[\[systems\.children\.artifacts\]\]$/.test(text)) {
        if (current === null) {
          throw new Error(
            `${tomlPath}:${lineNo}: a child artifacts table before any [[systems.children]].`
          );
        }
        current.hasExplicitArtifacts = true;
        context = 'explicit-artifacts';
        return;
      }
      // Any other table (root systems tables, children codebase, ignore, ...).
      context = 'other';
      return;
    }

    if (current === null) return;

    if (context === 'child') {
      const slugMatch = text.match(/^slug\s*=\s*"([^"]*)"/);
      if (slugMatch !== null) current.slug = slugMatch[1];
      const dirMatch = text.match(/^artifacts_dir\s*=\s*"([^"]*)"/);
      if (dirMatch !== null) current.artifactsDir = dirMatch[1];
      return;
    }

    if (context === 'autodetect-kind' && currentKind !== null) {
      const requiredMatch = text.match(/^required\s*=\s*(true|false)\s*(#.*)?$/);
      if (requiredMatch !== null) {
        current.autodetectKinds[currentKind] = requiredMatch[1] === 'true';
      }
    }
  });

  return children;
}

/**
 * Verify the member artifact chain is registered for enforcement.
 *
 * Root DESIGN §2.2, `cpt-frontx-constraint-member-artifact-chain` (LAYER-2):
 * every layer member owned by this repository owns the artifacts that describe
 * it, registered as its own child system with DESIGN and at least one FEATURE
 * required — in the autodetect form, because `required` flags do not inherit
 * and the explicit-artifact-list form validates while enforcing nothing. A
 * member registered the unenforcing way, or not registered at all, silently
 * reproduces the gap federation exists to close: `cfs validate` stays green
 * because it was never asked to look.
 *
 * Scope is exactly the constraint's: FrontX-owned layer members — published
 * libraries and projects orchestration, both read from layer-constants.cjs.
 * Build internals are exempt from the chain by DESIGN §1.3, and templates are
 * hosted outside this repository. A member whose package is still covered by a
 * path-anchored `[[ignore]]` is accepted as recorded debt: the ignore's reason
 * carries the removal criterion, `verifyIgnoreFreshness` keeps it honest, and
 * lifting the ignore is what arms this check for that member (autodetect
 * cannot see a member's artifacts through the ignore anyway — measured on
 * telemetry, #495).
 */
// @cpt-dod:cpt-frontx-dod-ecosystem-governance-member-registration-enforced:p1
// @cpt-algo:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1
function verifyMemberRegistrationInRegistry(
  tomlPath: string,
  members: readonly string[],
  packageDirs: Readonly<Record<string, string>>
): TestResult[] {
  try {
    // @cpt-begin:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-members
    const memberList = [...members];
    // @cpt-end:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-members
    // @cpt-begin:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-read
    const children = childSystems(tomlPath);
    const ignores = ignoreEntries(tomlPath);
    // @cpt-end:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-read

    return memberList.map((member) => {
      const dir = packageDirs[member];
      const testName = `Member ${member}: Artifact chain registered for enforcement`;

      // @cpt-begin:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-debt
      const ignored = matchingMemberDebtIgnore(dir, ignores);
      if (ignored?.missing.length === 0) {
        return {
          name: testName,
          passed: true,
          message:
            `Recorded debt: ${dir} is covered by a path-anchored [[ignore]] whose reason ` +
            `carries the removal criterion. Lifting the ignore arms this check.`,
        };
      }
      if (ignored !== null) {
        return {
          name: testName,
          passed: false,
          message:
            `Ignored member debt for ${dir} is undocumented: the matching path-anchored [[ignore]] ` +
            `reason is missing ${ignored.missing.join(' and ')}. Record both in the reason, or ` +
            `register the member's PRD, DESIGN and FEATURE chain now.`,
        };
      }
      // @cpt-end:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-debt

      // @cpt-begin:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-unregistered
      const child = children.find(
        (candidate) =>
          candidate.artifactsDir !== null && candidate.artifactsDir.startsWith(`${dir}/`)
      );

      if (child === undefined) {
        return {
          name: testName,
          passed: false,
          message:
            `No [[systems.children]] node with artifacts_dir under ${dir}/ in the artifact ` +
            `registry, and no [[ignore]] recording the debt. An unregistered member's chain ` +
            `is an honour system (cpt-frontx-constraint-member-artifact-chain).`,
        };
      }
      // @cpt-end:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-unregistered

      // @cpt-begin:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-unenforcing
      const declaredKinds = Object.keys(child.autodetectKinds);
      if (declaredKinds.length === 0) {
        return {
          name: testName,
          passed: false,
          message:
            `Child '${child.slug ?? dir}' declares no autodetect artifact kinds` +
            (child.hasExplicitArtifacts
              ? ' — the explicit-artifact-list form validates while enforcing nothing; use the autodetect form with required flags.'
              : ' — nothing is enforced for this member.'),
        };
      }

      const unenforced = ['DESIGN', 'FEATURE', 'PRD'].filter(
        (kind) => child.autodetectKinds[kind] !== true
      );
      // @cpt-end:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-unenforcing

      // @cpt-begin:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-pass
      return {
        name: testName,
        passed: unenforced.length === 0,
        message:
          unenforced.length === 0
            ? `Child '${child.slug ?? dir}' requires ${declaredKinds
                .filter((kind) => child.autodetectKinds[kind])
                .sort()
                .join(', ')} via autodetect`
            : `Child '${child.slug ?? dir}' does not require: ${unenforced.join(', ')} — the ` +
              `member artifact chain needs PRD, DESIGN and FEATURE declared with ` +
              `required = true in the autodetect form.`,
      };
      // @cpt-end:cpt-frontx-algo-ecosystem-governance-member-registration-gate:p1:inst-mrg-pass
    });
  } catch (error) {
    return [
      {
        name: 'Member registration: Registry readable',
        passed: false,
        message: (error as Error).message,
      },
    ];
  }
}

function verifyMemberRegistration(): TestResult[] {
  const tomlPath = join(REPO_ROOT, '.cf-studio', 'config', 'artifacts.toml');

  if (!existsSync(tomlPath)) {
    return [
      {
        name: 'Artifact registry: Present',
        passed: false,
        message: `Not found: ${tomlPath}`,
      },
    ];
  }

  const { PUBLISHED_LIBRARY_PACKAGES, PROJECTS_ORCHESTRATION_PACKAGES, ECOSYSTEM_PACKAGE_DIRS } =
    require(join(DEPCRUISE_CONFIG_DIR, 'layer-constants.cjs')) as {
      PUBLISHED_LIBRARY_PACKAGES: readonly string[];
      PROJECTS_ORCHESTRATION_PACKAGES: readonly string[];
      ECOSYSTEM_PACKAGE_DIRS: Readonly<Record<string, string>>;
    };

  return verifyMemberRegistrationInRegistry(
    tomlPath,
    [...PUBLISHED_LIBRARY_PACKAGES, ...PROJECTS_ORCHESTRATION_PACKAGES],
    ECOSYSTEM_PACKAGE_DIRS
  );
}

/**
 * Run all verification tests
 */
async function runVerification(): Promise<void> {
  log('\n🔍 Guard Config Verification', 'blue');
  log('='.repeat(40), 'blue');

  const allResults: TestResult[] = [];

  // ESLint configs
  log('\n📝 ESLint Configs', 'blue');
  const eslintResults = await verifyEslintConfigs();
  allResults.push(...eslintResults);
  for (const result of eslintResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Depcruise configs
  log('\n📦 Dependency Cruiser Configs', 'blue');
  const depcruiseResults = verifyDepcruiseConfigs();
  allResults.push(...depcruiseResults);
  for (const result of depcruiseResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Core boundary restrictions
  log('\n🔒 Core Boundary Restrictions', 'blue');
  const coreResults = verifyCoreRestrictions();
  allResults.push(...coreResults);
  for (const result of coreResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Guard invocation: rules that exist but are never pointed at anything
  log('\n🎯 Guard Reach', 'blue');
  const reachResults = [
    ...verifyCoreCruiseTargets(),
    ...(await verifyEcosystemCruiseTargets()),
    ...verifyIgnoreFreshness(),
  ];
  allResults.push(...reachResults);
  for (const result of reachResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Member artifact chain: registered for enforcement, not on honour
  log('\n🧾 Member Artifact Chain', 'blue');
  // @cpt-begin:cpt-frontx-flow-ecosystem-governance-ci-guard-run:p1:inst-cgr-guards
  const registrationResults = verifyMemberRegistration();
  // @cpt-end:cpt-frontx-flow-ecosystem-governance-ci-guard-run:p1:inst-cgr-guards
  allResults.push(...registrationResults);
  for (const result of registrationResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // doNotFollow patterns
  log('\n🕳️ doNotFollow Depth Guards', 'blue');
  const doNotFollowResults = verifyDoNotFollowPatterns();
  allResults.push(...doNotFollowResults);
  for (const result of doNotFollowResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Routing engine-leak pattern coverage
  log('\n🚦 Routing Engine-Leak Pattern', 'blue');
  const engineLeakResults = verifyRoutingEngineLeakPattern();
  allResults.push(...engineLeakResults);
  for (const result of engineLeakResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Core-does-not-import-provider, ecosystem-wide sole-engine import, and the
  // unresolved-specifier false-positive guard
  log('\n🔌 Routing Provider & Sole-Engine Boundary', 'blue');
  const providerIsolationResults = [
    ...verifyRoutingCoreProviderIsolation(),
    ...verifySoleEngineImportPattern(),
    ...verifyTelemetryTemplateContentResolutionGuard(),
  ];
  allResults.push(...providerIsolationResults);
  for (const result of providerIsolationResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Summary
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;

  log('\n📊 Summary', 'blue');
  log(`  ✅ Passed: ${passed}`, 'green');
  log(`  ❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');

  if (failed > 0) {
    log('\n💥 Guard config verification failed!', 'red');
    process.exit(1);
  } else {
    // @cpt-begin:cpt-frontx-flow-ecosystem-governance-ci-guard-run:p1:inst-cgr-pass
    log('\n🎉 Guard config verification passed!', 'green');
    process.exit(0);
    // @cpt-end:cpt-frontx-flow-ecosystem-governance-ci-guard-run:p1:inst-cgr-pass
  }
}

// Execute if run directly. `pathToFileURL` rather than a hand-rolled
// `file://${argv[1]}`: the hand-rolled form fails on Windows (drive letters and
// backslashes need escaping) and on symlinks where argv[1] resolves differently
// from import.meta.url.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  runVerification();
}

export {
  runVerification,
  verifyEslintConfigs,
  verifyDepcruiseConfigs,
  verifyCoreRestrictions,
  verifyCoreCruiseTargets,
  verifyEcosystemCruiseTargets,
  verifyIgnoreFreshness,
  verifyMemberRegistration,
  verifyMemberRegistrationInRegistry,
  ignoreEntries,
  memberDebtReasonStatus,
  verifyDoNotFollowPatterns,
  verifyRoutingEngineLeakPattern,
  verifyRoutingCoreProviderIsolation,
  verifySoleEngineImportPattern,
  verifyTelemetryTemplateContentResolutionGuard,
};
