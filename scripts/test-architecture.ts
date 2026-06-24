#!/usr/bin/env node

/**
 * FrontX Architecture Validation Script (Monorepo)
 * Extends standalone checks with monorepo-specific validations
 *
 * This extends packages/cli/template-sources/project/scripts/test-architecture.ts
 * Root scripts/test-architecture.ts re-exports this for the monorepo
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runValidation,
  getStandaloneChecks,
  displayResults,
} from '../packages/cli/template-sources/project/scripts/test-architecture';
import type { ArchCheck, ValidationResult } from '../packages/cli/template-sources/project/scripts/test-architecture';

/**
 * Monorepo-specific architecture checks
 * Order: clean build -> standalone checks -> unused exports
 */
function getMonorepoChecks(): ArchCheck[] {
  return [
    { command: 'npm run clean:build', description: 'Clean build (packages + app)' },
  ];
}

/**
 * Monorepo-specific post checks (run after standalone)
 */
function getMonorepoPostChecks(): ArchCheck[] {
  return [
    { command: 'npm run arch:unused', description: 'Unused exports check' },
  ];
}

/**
 * FrontX ecosystem boundary checks (stubs — full enforcement added in Phase 10).
 *
 * Boundary invariants covered:
 *   cpt-frontx-constraint-mfes-no-type-format-literals     (MFES-1)
 *   cpt-frontx-constraint-mfes-no-solution-shared-properties (MFES-2)
 *   cpt-frontx-constraint-mfes-no-layout-domain-values      (MFES-3)
 *   cpt-frontx-constraint-mfes-no-type-format-dependency    (MFES-4)
 *   cpt-frontx-constraint-mfes-opaque-schema-surface        (MFES-5)
 *   cpt-frontx-constraint-gts-plugin-owns-infra-schemas     (GTS-PLUGIN-1)
 *   cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2)
 *   cpt-frontx-constraint-api-no-solution-content           (API-1)
 */
function getEcosystemBoundaryChecks(): ArchCheck[] {
  // TODO(Phase 10 — pillar1-verify): replace stubs with concrete depcruise/lint commands
  // that enforce the MFES-1..5, GTS-PLUGIN-1..2, and API-1 invariants listed above.
  return [];
}

/**
 * Run monorepo architecture validation
 */
function validateMonorepoArchitecture(): ValidationResult {
  // Order: monorepo (clean build) -> standalone -> monorepo post (unused)
  const allChecks = [...getMonorepoChecks(), ...getStandaloneChecks(), ...getMonorepoPostChecks()];
  return runValidation(allChecks, 'Gears FrontX Monorepo Architecture Validation');
}

// Main execution
function main(): void {
  const results = validateMonorepoArchitecture();
  displayResults(results);
}

// Execute if run directly. `pathToFileURL(path.resolve(argv[1]))` is
// Windows-safe (handles drive letters + backslashes) and symlink-safe,
// where the hand-rolled `file://${argv[1]}` form silently mismatches.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  main();
}

export { validateMonorepoArchitecture, getMonorepoChecks, displayResults };
