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
        'MFES-4 (cpt-frontx-constraint-mfes-no-type-format-dependency): mfes boundary — no concrete type-format import (gts-plugin / @globaltypesystem)',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/gts-plugin/src packages/mfes/src packages/api/src --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'GTS-PLUGIN-1 (cpt-frontx-constraint-gts-plugin-owns-infra-schemas): infra schema ownership — no external package imports gts-plugin schema internals',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/gts-plugin/src --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'GTS-PLUGIN-2 (cpt-frontx-constraint-gts-plugin-excludes-solution-schemas): gts-plugin boundary — no solution schema imports (frontx-template-standard)',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-api-no-solution-content:p10:inst-arch-check
    {
      command:
        'npx dependency-cruiser packages/api/src --exclude __tests__ --config .dependency-cruiser.cjs --output-type err-long',
      description:
        'API-1 (cpt-frontx-constraint-api-no-solution-content): api boundary — no solution content in production surface (frontx-template-standard / auth)',
    },
    // @cpt-end:cpt-frontx-constraint-api-no-solution-content:p10:inst-arch-check
    // @cpt-begin:cpt-frontx-constraint-mfes-opaque-schema-surface:p10:inst-arch-check
    {
      command:
        "bash -c '! grep -rl \"import.*JSONSchema\" packages/mfes/src/'",
      description:
        'MFES-5 (cpt-frontx-constraint-mfes-opaque-schema-surface): mfes has no JSONSchema shape import — schema surface is opaque (TSchema=unknown)',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-opaque-schema-surface:p10:inst-arch-check
  ];
}

/**
 * Run monorepo architecture validation
 */
function validateMonorepoArchitecture(): ValidationResult {
  // Order: monorepo (clean build) -> standalone -> monorepo post (unused) -> ecosystem boundaries
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
