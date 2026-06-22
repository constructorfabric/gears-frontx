/**
 * Migration Runner
 *
 * Executes migrations in order, tracks applied migrations,
 * and handles dry-run mode.
 */
// @cpt-algo:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2
// @cpt-algo:cpt-frontx-algo-cli-tooling-apply-migration:p2
// @cpt-state:cpt-frontx-state-cli-tooling-migration-tracker:p2
// @cpt-dod:cpt-frontx-dod-cli-tooling-migrations:p2

import path from 'path';
import fs from 'fs-extra';
import { Project } from 'ts-morph';
import type {
  Migration,
  MigrationOptions,
  MigrationResult,
  MigrationPreview,
  MigrationStatus,
  MigrationTracker,
  MigrationLogger,
  FilePreview,
  FileResult,
  AppliedMigration,
  AppliedTransformRecord,
  TransformChange,
} from './types.js';
import { getMigrations } from './registry.js';

/** Default tracker file path */
const TRACKER_FILE = '.frontx/migrations.json';

/** Default include patterns */
const DEFAULT_INCLUDE = ['**/*.ts', '**/*.tsx'];

/** Default exclude patterns */
const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/*.d.ts'];

/**
 * Load the migration tracker from disk
 */
async function loadTracker(targetPath: string): Promise<MigrationTracker> {
  const trackerPath = path.join(targetPath, TRACKER_FILE);
  try {
    const content = await fs.readFile(trackerPath, 'utf-8');
    return JSON.parse(content) as MigrationTracker;
  } catch {
    // @cpt-begin:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-init
    // .frontx/migrations.json absent — initialise in-memory tracker with empty applied list
    return {
      version: '1.0.0',
      applied: [],
    };
    // @cpt-end:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-init
  }
}

/**
 * Save the migration tracker to disk
 */
async function saveTracker(
  targetPath: string,
  tracker: MigrationTracker
): Promise<void> {
  const trackerPath = path.join(targetPath, TRACKER_FILE);
  await fs.ensureDir(path.dirname(trackerPath));
  await fs.writeFile(trackerPath, JSON.stringify(tracker, null, 2), 'utf-8');
}

/**
 * Get migration status for a project
 */
export async function getMigrationStatus(
  targetPath: string
): Promise<MigrationStatus> {
  const tracker = await loadTracker(targetPath);
  const allMigrations = getMigrations();

  // Get list of applied migration IDs
  const appliedIds = new Set(tracker.applied.map((m) => m.id));

  // Filter pending migrations
  const pending = allMigrations.filter((m) => !appliedIds.has(m.id));

  // Try to detect current version from package.json
  let currentVersion: string | undefined;
  try {
    const pkgPath = path.join(targetPath, 'package.json');
    const pkg = await fs.readJson(pkgPath);
    // Check for FrontX packages
    const frontxDeps = Object.keys(pkg.dependencies || {}).filter((d) =>
      d.startsWith('@gears-frontx/')
    );
    if (frontxDeps.length > 0) {
      const firstDep = pkg.dependencies[frontxDeps[0]];
      // Extract version from semver range
      currentVersion = firstDep.replace(/^[\^~]/, '');
    }
  } catch {
    // Package.json not found or invalid
  }

  return {
    applied: tracker.applied,
    pending,
    currentVersion,
  };
}

/**
 * Preview a migration (dry-run)
 */
export async function previewMigration(
  migration: Migration,
  options: MigrationOptions,
  logger: MigrationLogger
): Promise<MigrationPreview> {
  const targetPath = options.targetPath || process.cwd();
  const include = options.include || DEFAULT_INCLUDE;
  const exclude = options.exclude || DEFAULT_EXCLUDE;

  logger.info(`Previewing migration: ${migration.name}`);
  logger.info(`Target: ${targetPath}`);

  // Create ts-morph project
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      declaration: false,
      noEmit: true,
    },
  });

  // Add source files
  const sourceFiles = project.addSourceFilesAtPaths(
    include.map((pattern) => path.join(targetPath, pattern))
  );

  // Filter out excluded files
  const filteredFiles = sourceFiles.filter((sf) => {
    const relativePath = path.relative(targetPath, sf.getFilePath());
    return !exclude.some((pattern) => {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      return regex.test(relativePath);
    });
  });

  logger.info(`Found ${filteredFiles.length} source files`);

  const filesPreviews: FilePreview[] = [];

  for (const sourceFile of filteredFiles) {
    const relativePath = path.relative(targetPath, sourceFile.getFilePath());
    const changes: TransformChange[] = [];
    const transforms: string[] = [];

    for (const transform of migration.transforms) {
      if (transform.canApply(sourceFile)) {
        const transformChanges = transform.preview(sourceFile);
        if (transformChanges.length > 0) {
          changes.push(...transformChanges);
          transforms.push(transform.id);
        }
      }
    }

    if (changes.length > 0) {
      filesPreviews.push({
        path: relativePath,
        changes,
        transforms,
      });
    }
  }

  return {
    migrationId: migration.id,
    files: filesPreviews,
    totalFilesAffected: filesPreviews.length,
    totalChanges: filesPreviews.reduce((sum, f) => sum + f.changes.length, 0),
  };
}

/**
 * Apply a migration
 */
export async function applyMigration(
  migration: Migration,
  options: MigrationOptions,
  logger: MigrationLogger
): Promise<MigrationResult> {
  const targetPath = options.targetPath || process.cwd();
  const include = options.include || DEFAULT_INCLUDE;
  const exclude = options.exclude || DEFAULT_EXCLUDE;

  logger.info(`Applying migration: ${migration.name}`);
  logger.info(`Target: ${targetPath}`);

  // @cpt-begin:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-check-already-applied
  // Load tracker to check if already applied
  const tracker = await loadTracker(targetPath);
  // @cpt-begin:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-idempotent
  if (tracker.applied.some((m) => m.id === migration.id)) {
    logger.warn(`Migration ${migration.id} has already been applied`);
    return {
      success: false,
      migrationId: migration.id,
      filesModified: 0,
      totalChanges: 0,
      files: [],
      warnings: [`Migration ${migration.id} has already been applied`],
      errors: [],
      appliedAt: new Date().toISOString(),
    };
  }
  // @cpt-end:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-idempotent
  // @cpt-end:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-check-already-applied

  // @cpt-begin:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-init-ts-morph
  // Create ts-morph project
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      declaration: false,
      noEmit: true,
    },
  });

  // Add source files
  const sourceFiles = project.addSourceFilesAtPaths(
    include.map((pattern) => path.join(targetPath, pattern))
  );

  // Filter out excluded files
  const filteredFiles = sourceFiles.filter((sf) => {
    const relativePath = path.relative(targetPath, sf.getFilePath());
    return !exclude.some((pattern) => {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      return regex.test(relativePath);
    });
  });

  logger.info(`Processing ${filteredFiles.length} source files`);
  // @cpt-end:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-init-ts-morph

  // @cpt-begin:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-apply-transforms
  const filesResults: FileResult[] = [];
  const allWarnings: string[] = [];
  const allErrors: string[] = [];
  const transformStats: Map<string, number> = new Map();

  for (const sourceFile of filteredFiles) {
    const relativePath = path.relative(targetPath, sourceFile.getFilePath());
    let fileChanges = 0;
    const appliedTransforms: string[] = [];

    for (const transform of migration.transforms) {
      if (transform.canApply(sourceFile)) {
        logger.debug(`Applying ${transform.id} to ${relativePath}`);
        const result = transform.apply(sourceFile);

        if (result.success && result.changesApplied > 0) {
          fileChanges += result.changesApplied;
          appliedTransforms.push(transform.id);
          transformStats.set(
            transform.id,
            (transformStats.get(transform.id) || 0) + 1
          );
        }

        allWarnings.push(...result.warnings.map((w) => `${relativePath}: ${w}`));
        allErrors.push(...result.errors.map((e) => `${relativePath}: ${e}`));
      }
    }

    if (fileChanges > 0) {
      filesResults.push({
        path: relativePath,
        success: true,
        changesApplied: fileChanges,
        transforms: appliedTransforms,
      });
    }
  }
  // @cpt-end:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-apply-transforms

  // @cpt-begin:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-save-project
  // Save modified files
  await project.save();
  // @cpt-end:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-save-project

  // @cpt-begin:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-update-tracker
  // Update tracker
  const appliedAt = new Date().toISOString();
  const appliedRecord: AppliedMigration = {
    id: migration.id,
    appliedAt,
    filesModified: filesResults.length,
    transforms: Array.from(transformStats.entries()).map(
      ([id, filesModified]): AppliedTransformRecord => ({
        id,
        filesModified,
      })
    ),
  };
  // @cpt-begin:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-first-entry
  // @cpt-begin:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-append-entry
  // Transitions EMPTY→HAS_APPLIED (first entry) or HAS_APPLIED→HAS_APPLIED (subsequent entries)
  tracker.applied.push(appliedRecord);
  await saveTracker(targetPath, tracker);
  // @cpt-end:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-first-entry
  // @cpt-end:cpt-frontx-state-cli-tooling-migration-tracker:p2:inst-tracker-append-entry

  logger.success(`Migration ${migration.id} applied successfully`);
  logger.info(`Files modified: ${filesResults.length}`);
  // @cpt-end:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-update-tracker

  // @cpt-begin:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-return-migration-result
  return {
    success: allErrors.length === 0,
    migrationId: migration.id,
    filesModified: filesResults.length,
    totalChanges: filesResults.reduce((sum, f) => sum + f.changesApplied, 0),
    files: filesResults,
    warnings: allWarnings,
    errors: allErrors,
    appliedAt,
  };
  // @cpt-end:cpt-frontx-algo-cli-tooling-apply-migration:p2:inst-return-migration-result
}

/**
 * Run migrations up to a target version
 */
export async function runMigrations(
  options: MigrationOptions,
  logger: MigrationLogger
): Promise<MigrationResult[]> {
  const targetPath = options.targetPath || process.cwd();

  // @cpt-begin:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-load-tracker
  const status = await getMigrationStatus(targetPath);
  // @cpt-end:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-load-tracker

  // @cpt-begin:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-collect-applied-ids
  // Filter migrations based on target version
  // @cpt-begin:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-filter-pending
  let migrationsToRun = status.pending;
  // @cpt-end:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-collect-applied-ids
  // @cpt-end:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-filter-pending

  // @cpt-begin:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-filter-by-target-version
  if (options.targetVersion) {
    migrationsToRun = migrationsToRun.filter(
      (m) => m.version <= options.targetVersion!
    );
  }
  // @cpt-end:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-filter-by-target-version

  if (migrationsToRun.length === 0) {
    logger.info('No pending migrations to apply');
    return [];
  }

  // @cpt-begin:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-sort-by-version
  // Sort by version
  migrationsToRun.sort((a, b) => a.version.localeCompare(b.version));
  // @cpt-end:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-sort-by-version

  const results: MigrationResult[] = [];

  for (const migration of migrationsToRun) {
    if (options.dryRun) {
      const preview = await previewMigration(migration, options, logger);
      // Convert preview to result format for consistency
      results.push({
        success: true,
        migrationId: migration.id,
        filesModified: preview.totalFilesAffected,
        totalChanges: preview.totalChanges,
        files: preview.files.map((f) => ({
          path: f.path,
          success: true,
          changesApplied: f.changes.length,
          transforms: f.transforms,
        })),
        warnings: [],
        errors: [],
        appliedAt: '[dry-run]',
      });
    } else {
      const result = await applyMigration(migration, options, logger);
      results.push(result);

      // Stop on error
      if (!result.success) {
        logger.error(`Migration ${migration.id} failed, stopping`);
        break;
      }
    }
  }

  // @cpt-begin:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-return-pending
  return results;
  // @cpt-end:cpt-frontx-algo-cli-tooling-resolve-pending-migrations:p2:inst-return-pending
}

/**
 * Format a migration result for display
 */
export function formatResult(result: MigrationResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('='.repeat(60));
  lines.push(`  Gears FrontX Migration Report`);
  lines.push('='.repeat(60));
  lines.push(`  Migration: ${result.migrationId}`);
  lines.push(`  Applied: ${result.appliedAt}`);
  lines.push('-'.repeat(60));
  lines.push(`  Files modified: ${result.filesModified}`);
  lines.push(`  Total changes: ${result.totalChanges}`);

  if (result.warnings.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('  Warnings:');
    for (const warning of result.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('  Errors:');
    for (const error of result.errors) {
      lines.push(`    - ${error}`);
    }
  }

  lines.push('='.repeat(60));
  lines.push(`  Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  lines.push('='.repeat(60));
  lines.push('');

  return lines.join('\n');
}
