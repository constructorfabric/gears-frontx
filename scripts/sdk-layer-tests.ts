#!/usr/bin/env node

/**
 * FrontX SDK Layer Architecture Tests
 * Tests that the SDK layer packages follow the 3-layer architecture
 *
 * These tests verify:
 * - SDK packages (L1) have ZERO @gears-frontx dependencies
 * - Framework package (L2) only imports SDK packages
 * - React package (L3) only imports framework
 * - No package depends on deprecated packages (@gears-frontx/uikit-contracts, @gears-frontx/uicore, @gears-frontx/layout)
 * - Layer configs include all parent layer rules
 */

import { existsSync, readFileSync } from 'fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Load the layer partitioning from the same source that the depcruise rules
// consume. `sdk-layer-tests.ts` asserts package.json edges while depcruise
// asserts import-graph edges; pulling the lists from one CJS module means the
// two checks cannot drift apart (see internal/depcruise-config/layer-constants.cjs).
const require = createRequire(import.meta.url);
const LAYER_CONSTANTS = require('../internal/depcruise-config/layer-constants.cjs') as {
  SDK_PACKAGES: readonly string[];
  ALLOWED_FRAMEWORK_SDK_DEPS: readonly string[];
  DEPRECATED_PACKAGES: readonly string[];
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  skipped?: boolean;
}

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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

function readPackageJson(packagePath: string): PackageJson | null {
  const pkgPath = path.resolve(packagePath, 'package.json');
  const relative = path.relative(path.resolve(packagePath), pkgPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  if (!existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(readFileSync(pkgPath, 'utf-8'));
}

function getHai3Dependencies(pkg: PackageJson): string[] {
  // Merge `devDependencies` too — otherwise a deprecated package listed only
  // under devDeps (a common pattern for types / test-only packages) would
  // slip past the deprecation and layer-boundary guards. The SDK layer
  // contract applies regardless of which dependency group declares the pin.
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  };
  return Object.keys(allDeps).filter((dep) => dep.startsWith('@gears-frontx/'));
}

// Layer partitioning — re-exposed under the historic names used in this file
// so the helper functions below stay readable. The single source lives in
// `internal/depcruise-config/layer-constants.cjs` (see loader above).
const SDK_PACKAGES = LAYER_CONSTANTS.SDK_PACKAGES;
const ALLOWED_SDK_DEPS = LAYER_CONSTANTS.ALLOWED_FRAMEWORK_SDK_DEPS;
const DEPRECATED_PACKAGES = LAYER_CONSTANTS.DEPRECATED_PACKAGES;

/**
 * Test: SDK packages have zero @gears-frontx dependencies
 */
function testSdkZeroDependencies(): TestResult[] {
  const results: TestResult[] = [];

  for (const pkgName of SDK_PACKAGES) {
    const pkgPath = path.join(process.cwd(), 'packages', pkgName);
    const pkg = readPackageJson(pkgPath);

    if (!pkg) {
      results.push({
        name: `SDK @gears-frontx/${pkgName}: Zero @gears-frontx deps`,
        passed: true,
        message: `Package not yet created (will be created in Phase 3)`,
        skipped: true,
      });
      continue;
    }

    const frontxDeps = getHai3Dependencies(pkg);
    const passed = frontxDeps.length === 0;

    results.push({
      name: `SDK @gears-frontx/${pkgName}: Zero @gears-frontx deps`,
      passed,
      message: passed
        ? 'No @gears-frontx dependencies found'
        : `Found @gears-frontx dependencies: ${frontxDeps.join(', ')}`,
    });
  }

  return results;
}

/**
 * Test: Framework package only imports SDK packages
 */
function testFrameworkOnlySdkDeps(): TestResult {
  const pkgPath = path.join(process.cwd(), 'packages', 'framework');
  const pkg = readPackageJson(pkgPath);

  if (!pkg) {
    return {
      name: 'Framework: Only SDK dependencies',
      passed: true,
      message: 'Package not yet created (will be created in Phase 4)',
      skipped: true,
    };
  }

  const frontxDeps = getHai3Dependencies(pkg);
  const invalidDeps = frontxDeps.filter((dep) => !ALLOWED_SDK_DEPS.includes(dep));
  const passed = invalidDeps.length === 0;

  return {
    name: 'Framework: Only SDK dependencies',
    passed,
    message: passed
      ? `Valid deps: ${frontxDeps.join(', ') || 'none'}`
      : `Invalid deps: ${invalidDeps.join(', ')}`,
  };
}

/**
 * Test: React package only imports framework
 */
function testReactOnlyFrameworkDep(): TestResult {
  const pkgPath = path.join(process.cwd(), 'packages', 'react');
  const pkg = readPackageJson(pkgPath);

  if (!pkg) {
    return {
      name: 'React: Only framework dependency',
      passed: true,
      message: 'Package not yet created (will be created in Phase 4)',
      skipped: true,
    };
  }

  const frontxDeps = getHai3Dependencies(pkg);
  const invalidDeps = frontxDeps.filter((dep) => dep !== '@gears-frontx/framework');
  const passed = invalidDeps.length === 0;

  return {
    name: 'React: Only framework dependency',
    passed,
    message: passed
      ? `Valid deps: ${frontxDeps.join(', ') || 'none'}`
      : `Invalid deps: ${invalidDeps.join(', ')}`,
  };
}

/**
 * Test: No package depends on deprecated packages
 */
function testNoDeprecatedDependencies(): TestResult[] {
  const results: TestResult[] = [];
  const packagesToCheck = [...SDK_PACKAGES, 'framework', 'react'];

  for (const pkgName of packagesToCheck) {
    const pkgPath = path.join(process.cwd(), 'packages', pkgName);
    const pkg = readPackageJson(pkgPath);

    if (!pkg) {
      results.push({
        name: `@gears-frontx/${pkgName}: No deprecated deps`,
        passed: true,
        message: 'Package not yet created',
        skipped: true,
      });
      continue;
    }

    const frontxDeps = getHai3Dependencies(pkg);
    const deprecatedDeps = frontxDeps.filter((dep) =>
      DEPRECATED_PACKAGES.includes(dep)
    );
    const passed = deprecatedDeps.length === 0;

    results.push({
      name: `@gears-frontx/${pkgName}: No deprecated deps`,
      passed,
      message: passed
        ? 'No deprecated dependencies'
        : `Found deprecated deps: ${deprecatedDeps.join(', ')}`,
    });
  }

  return results;
}

/**
 * Test: Layered config packages exist
 */
function testLayeredConfigsExist(): TestResult[] {
  const results: TestResult[] = [];

  // ESLint config package (in internal/, compiled to dist/)
  const eslintConfigPath = path.join(process.cwd(), 'internal', 'eslint-config', 'dist');
  const eslintConfigFiles = ['base.js', 'sdk.js', 'framework.js', 'react.js', 'screenset.js'];

  for (const file of eslintConfigFiles) {
    const filePath = path.join(eslintConfigPath, file);
    const exists = existsSync(filePath);
    results.push({
      name: `ESLint config: ${file}`,
      passed: exists,
      message: exists ? 'File exists' : 'File not found',
    });
  }

  // Depcruise config package (in internal/)
  const depcruiseConfigPath = path.join(process.cwd(), 'internal', 'depcruise-config');
  const depcruiseConfigFiles = ['base.cjs', 'sdk.cjs', 'framework.cjs', 'react.cjs', 'screenset.cjs'];

  for (const file of depcruiseConfigFiles) {
    const filePath = path.join(depcruiseConfigPath, file);
    const exists = existsSync(filePath);
    results.push({
      name: `Depcruise config: ${file}`,
      passed: exists,
      message: exists ? 'File exists' : 'File not found',
    });
  }

  return results;
}

/**
 * Run all SDK layer tests
 */
function runSdkLayerTests(): { results: TestResult[]; summary: { passed: number; failed: number; skipped: number } } {
  const allResults: TestResult[] = [];

  log('\n🔬 SDK Layer Architecture Tests', 'blue');
  log('='.repeat(40), 'blue');

  // Run all tests
  allResults.push(...testSdkZeroDependencies());
  allResults.push(testFrameworkOnlySdkDeps());
  allResults.push(testReactOnlyFrameworkDep());
  allResults.push(...testNoDeprecatedDependencies());
  allResults.push(...testLayeredConfigsExist());

  // Display results
  for (const result of allResults) {
    if (result.skipped) {
      log(`⏭️  ${result.name}: SKIPPED - ${result.message}`, 'yellow');
    } else if (result.passed) {
      log(`✅ ${result.name}: ${result.message}`, 'green');
    } else {
      log(`❌ ${result.name}: ${result.message}`, 'red');
    }
  }

  const summary = {
    passed: allResults.filter((r) => r.passed && !r.skipped).length,
    failed: allResults.filter((r) => !r.passed && !r.skipped).length,
    skipped: allResults.filter((r) => r.skipped).length,
  };

  return { results: allResults, summary };
}

// Main execution
function main(): void {
  const { summary } = runSdkLayerTests();

  log('\n📊 Summary', 'blue');
  log(`  ✅ Passed: ${summary.passed}`, 'green');
  log(`  ❌ Failed: ${summary.failed}`, summary.failed > 0 ? 'red' : 'green');
  log(`  ⏭️  Skipped: ${summary.skipped}`, 'yellow');

  if (summary.failed > 0) {
    log('\n💥 SDK Layer tests failed!', 'red');
    process.exit(1);
  } else {
    log('\n🎉 SDK Layer tests passed!', 'green');
    process.exit(0);
  }
}

// Execute if run directly. Use `pathToFileURL` instead of a hand-rolled
// `file://${argv[1]}` — the hand-rolled form fails on Windows (drive letters
// / backslashes need escaping) and on symlinks where argv[1] resolves
// differently from import.meta.url. `pathToFileURL(path.resolve(argv[1]))`
// produces the canonical form the runtime compares against.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  main();
}

export { runSdkLayerTests, testSdkZeroDependencies, testFrameworkOnlySdkDeps, testReactOnlyFrameworkDep };
