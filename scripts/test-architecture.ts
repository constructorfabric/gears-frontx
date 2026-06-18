#!/usr/bin/env node

/**
 * HAI3 Architecture Validation Script (Monorepo)
 * Extends standalone checks with monorepo-specific validations
 *
 * This extends packages/cli/template-sources/project/scripts/test-architecture.ts
 * Root scripts/test-architecture.ts re-exports this for the monorepo
 */

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

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateMonorepoArchitecture, getMonorepoChecks, displayResults };
