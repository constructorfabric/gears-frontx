#!/usr/bin/env node

/**
 * FrontX Architecture Validation Script (Monorepo)
 * Self-contained after Phase 11 template-move (packages/cli deleted).
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'node:path';
import { join } from 'path';
import { pathToFileURL } from 'node:url';

// ─── Standalone helpers (previously in packages/cli/template-sources) ───────

interface Colors {
  red: string;
  green: string;
  yellow: string;
  blue: string;
  reset: string;
}

const colors: Colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

export function log(message: string, color: keyof Colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ValidationResult {
  passed: number;
  total: number;
  success: boolean;
}

export interface ArchCheck {
  command: string;
  description: string;
}

type PackageManager = 'npm' | 'pnpm' | 'yarn';

// @cpt-begin:cpt-frontx-algo-cli-tooling-package-manager-policy:p1:inst-detect-package-manager
function detectPackageManager(): PackageManager {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
    ) as { packageManager?: string };
    const managerId = packageJson.packageManager?.split('@')[0];
    if (managerId === 'pnpm' || managerId === 'yarn') {
      return managerId;
    }
  } catch {
    // ignore and use default
  }
  return 'npm';
}
// @cpt-end:cpt-frontx-algo-cli-tooling-package-manager-policy:p1:inst-detect-package-manager

// @cpt-begin:cpt-frontx-algo-cli-tooling-package-manager-policy:p1:inst-build-package-manager-commands
function runScriptCommand(packageManager: PackageManager, scriptName: string): string {
  if (packageManager === 'yarn') {
    return `yarn ${scriptName}`;
  }
  return `${packageManager} run ${scriptName}`;
}
// @cpt-end:cpt-frontx-algo-cli-tooling-package-manager-policy:p1:inst-build-package-manager-commands

export function runCommand(command: string, description: string): boolean {
  log(`🔍 ${description}...`, 'blue');
  try {
    execSync(command, { stdio: 'inherit' });
    log(`✅ ${description} - PASSED`, 'green');
    return true;
  } catch (error: unknown) {
    log(`❌ ${description} - FAILED`, 'red');
    const err = error as { stdout?: Buffer; stderr?: Buffer };
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    return false;
  }
}

export function getStandaloneChecks(packageManager: PackageManager = detectPackageManager()): ArchCheck[] {
  const checks: ArchCheck[] = [
    { command: runScriptCommand(packageManager, 'lint'), description: 'ESLint rules' },
    { command: runScriptCommand(packageManager, 'type-check'), description: 'TypeScript type check' },
  ];

  const nodeVersion = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion >= 24) {
    checks.push({ command: runScriptCommand(packageManager, 'arch:deps'), description: 'Dependency rules' });
  } else {
    log(`⚠️  Dependency rules - SKIPPED (requires Node >= 24, current: ${process.versions.node})`, 'yellow');
  }

  return checks;
}

export function runValidation(checks: ArchCheck[], title: string): ValidationResult {
  log(`🏗️ ${title}`, 'blue');
  log('='.repeat(title.length + 4), 'blue');

  const results: boolean[] = [];
  for (const check of checks) {
    results.push(runCommand(check.command, check.description));
  }

  const passed = results.filter((r) => r === true).length;
  const total = results.length;
  return { passed, total, success: passed === total };
}

export function displayResults({ passed, total, success }: ValidationResult): void {
  if (success) {
    log(`🎉 ALL CHECKS PASSED (${passed}/${total})`, 'green');
    log('Architecture is compliant! 🏛️', 'green');
    process.exit(0);
  } else {
    log(`💥 ${total - passed} CHECKS FAILED (${passed}/${total})`, 'red');
    log('Architecture violations detected! 🚨', 'red');
    process.exit(1);
  }
}

// ─── Monorepo-specific checks ────────────────────────────────────────────────

/**
 * Monorepo-specific architecture checks
 * Order: clean build -> standalone checks -> unused exports
 */
function getMonorepoChecks(): ArchCheck[] {
  return [
    { command: 'npm run clean:build', description: 'Clean build (packages + app)' },
  ];
}

function getMonorepoPostChecks(): ArchCheck[] {
  return [
    { command: 'npm run arch:unused', description: 'Unused exports check' },
  ];
}

/**
 * FrontX ecosystem boundary checks (Phase 10 — full enforcement).
 *
 * Boundary invariants covered:
 *   cpt-frontx-constraint-mfes-no-type-format-literals     (MFES-1) — ESLint eslint.config.js
 *   cpt-frontx-constraint-mfes-no-solution-shared-properties (MFES-2) — ESLint eslint.config.js
 *   cpt-frontx-constraint-mfes-no-layout-domain-values      (MFES-3) — ESLint eslint.config.js
 *   cpt-frontx-constraint-mfes-no-type-format-dependency    (MFES-4) — dep-cruiser
 *   cpt-frontx-constraint-mfes-opaque-schema-surface        (MFES-5) — grep check below
 *   cpt-frontx-constraint-gts-plugin-owns-infra-schemas     (GTS-PLUGIN-1) — dep-cruiser
 *   cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2) — dep-cruiser
 *   cpt-frontx-constraint-api-no-solution-content           (API-1) — dep-cruiser
 */
function getEcosystemBoundaryChecks(): ArchCheck[] {
  return [
    // @cpt-begin:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/mfes/src --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'MFES-4 (cpt-frontx-constraint-mfes-no-type-format-dependency): mfes boundary — no concrete type-format import',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/gts-plugin/src packages/mfes/src packages/api/src --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'GTS-PLUGIN-1 (cpt-frontx-constraint-gts-plugin-owns-infra-schemas): infra schema ownership',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/gts-plugin/src --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'GTS-PLUGIN-2 (cpt-frontx-constraint-gts-plugin-excludes-solution-schemas): gts-plugin boundary',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-api-no-solution-content:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/api/src --exclude __tests__ --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'API-1 (cpt-frontx-constraint-api-no-solution-content): api boundary — no solution content',
    },
    // @cpt-end:cpt-frontx-constraint-api-no-solution-content:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-mfes-opaque-schema-surface:p10:inst-arch-check
    {
      command:
        "bash -c '! grep -rl \"import.*JSONSchema\" packages/mfes/src/'",
      description:
        'MFES-5 (cpt-frontx-constraint-mfes-opaque-schema-surface): mfes has no JSONSchema shape import',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-opaque-schema-surface:p10:inst-arch-check
  ];
}

export function validateMonorepoArchitecture(): ValidationResult {
  const allChecks = [
    ...getMonorepoChecks(),
    ...getStandaloneChecks(),
    ...getMonorepoPostChecks(),
    ...getEcosystemBoundaryChecks(),
  ];
  return runValidation(allChecks, 'Gears FrontX Monorepo Architecture Validation');
}

// Main execution
function main(): void {
  const results = validateMonorepoArchitecture();
  displayResults(results);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  main();
}
