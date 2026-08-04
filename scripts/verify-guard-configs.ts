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
 * described packages that emigrated to `template-shell/`, which enforces its
 * own internal layering in its self-owned `.dependency-cruiser.cjs`. The ESLint
 * side still ships the full set because `template-shell/packages/*` consume
 * `@gears-frontx/eslint-config/{framework,react}.js` directly, and this script
 * is the only ecosystem-side check that those published configs still build
 * and load — ecosystem CI does not lint the template.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
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
// and `screenset` serve `template-shell/packages/*`, which import them
// directly; `base` and `sdk` serve the ecosystem's own packages.
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
 * Verify the Core Framework config carries the boundary restrictions.
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
      // Core Framework packages carry no @gears-frontx imports...
      ['core-no-gears-frontx-imports', 'Core Framework isolation'],
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

  // Core Framework restrictions
  log('\n🔒 Core Framework Boundary Restrictions', 'blue');
  const coreResults = verifyCoreRestrictions();
  allResults.push(...coreResults);
  for (const result of coreResults) {
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
    log('\n🎉 Guard config verification passed!', 'green');
    process.exit(0);
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

export { runVerification, verifyEslintConfigs, verifyDepcruiseConfigs, verifyCoreRestrictions };
