#!/usr/bin/env node

/**
 * FrontX Layered Config Verification Script
 * Verifies that layered ESLint and dependency-cruiser configs are correctly structured
 *
 * This script:
 * 1. Loads each config and verifies it's a valid config array/object
 * 2. Checks that layer configs extend base configs correctly
 * 3. Verifies expected rules are present in each layer
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

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

const ESLINT_CONFIG_DIR = join(process.cwd(), 'internal', 'eslint-config', 'dist');
const DEPCRUISE_CONFIG_DIR = join(process.cwd(), 'internal', 'depcruise-config');

/**
 * Verify ESLint configs can be imported and have correct structure
 */
async function verifyEslintConfigs(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const configs = ['base', 'sdk', 'framework', 'react', 'screenset'];

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
  const configs = ['base', 'sdk', 'framework', 'react', 'screenset'];

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
 * Verify SDK config has correct restrictions
 */
function verifySdkRestrictions(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const sdkConfig = require(join(DEPCRUISE_CONFIG_DIR, 'sdk.cjs'));

    // Check for sdk-no-frontx-imports rule
    const hasNoHai3Rule = sdkConfig.forbidden.some(
      (rule: { name: string }) => rule.name === 'sdk-no-frontx-imports'
    );
    results.push({
      name: 'SDK config: Has sdk-no-frontx-imports rule',
      passed: hasNoHai3Rule,
      message: hasNoHai3Rule ? 'Rule present' : 'Rule missing',
    });

    // Check for sdk-no-react rule
    const hasNoReactRule = sdkConfig.forbidden.some(
      (rule: { name: string }) => rule.name === 'sdk-no-react'
    );
    results.push({
      name: 'SDK config: Has sdk-no-react rule',
      passed: hasNoReactRule,
      message: hasNoReactRule ? 'Rule present' : 'Rule missing',
    });

    // Check that base rules are inherited (no-circular)
    const hasNoCircular = sdkConfig.forbidden.some(
      (rule: { name: string }) => rule.name === 'no-circular'
    );
    results.push({
      name: 'SDK config: Inherits no-circular from base',
      passed: hasNoCircular,
      message: hasNoCircular ? 'Inherited' : 'Not inherited',
    });
  } catch (error) {
    results.push({
      name: 'SDK config: Verification',
      passed: false,
      message: `Error: ${(error as Error).message}`,
    });
  }

  return results;
}

/**
 * Verify screenset config has all existing rules
 */
function verifyScreensetRules(): TestResult[] {
  const results: TestResult[] = [];

  try {
    const screensetConfig = require(join(DEPCRUISE_CONFIG_DIR, 'screenset.cjs'));

    const requiredRules = [
      'no-cross-screenset-imports',
      'no-circular-screenset-deps',
      'flux-no-actions-in-effects-folder',
      'flux-no-effects-in-actions-folder',
      'no-circular',
    ];

    for (const ruleName of requiredRules) {
      const hasRule = screensetConfig.forbidden.some(
        (rule: { name: string }) => rule.name === ruleName
      );
      results.push({
        name: `Screenset config: Has ${ruleName}`,
        passed: hasRule,
        message: hasRule ? 'Rule present' : 'RULE MISSING - Protection lost!',
      });
    }
  } catch (error) {
    results.push({
      name: 'Screenset config: Verification',
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
  log('\n🔍 Layered Config Verification', 'blue');
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

  // SDK restrictions
  log('\n🔒 SDK Layer Restrictions', 'blue');
  const sdkResults = verifySdkRestrictions();
  allResults.push(...sdkResults);
  for (const result of sdkResults) {
    log(
      `${result.passed ? '✅' : '❌'} ${result.name}: ${result.message}`,
      result.passed ? 'green' : 'red'
    );
  }

  // Screenset rules (protection verification)
  log('\n🛡️ Screenset Protection Rules', 'blue');
  const screensetResults = verifyScreensetRules();
  allResults.push(...screensetResults);
  for (const result of screensetResults) {
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
    log('\n💥 Layered config verification failed!', 'red');
    process.exit(1);
  } else {
    log('\n🎉 Layered config verification passed!', 'green');
    process.exit(0);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVerification();
}

export { runVerification, verifyEslintConfigs, verifyDepcruiseConfigs };
