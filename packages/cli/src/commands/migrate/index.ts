/**
 * Migrate Command
 *
 * Applies codemod migrations to update FrontX projects to new versions.
 *
 * Usage:
 *   frontx migrate                    # Interactive - show available migrations
 *   frontx migrate 0.2.0              # Apply all migrations up to version
 *   frontx migrate --dry-run          # Preview changes without applying
 *   frontx migrate --list             # List applied and pending migrations
 *   frontx migrate --status           # Show migration status
 *   frontx migrate --path <dir>       # Target specific directory
 */
// @cpt-flow:cpt-frontx-flow-cli-tooling-migrate:p2
// @cpt-dod:cpt-frontx-dod-cli-tooling-migrations:p2

import path from 'path';
import type { CommandDefinition } from '../../core/command.js';
import { validationOk } from '../../core/types.js';
import {
  getMigrations,
  getMigrationStatus,
  runMigrations,
  formatResult,
} from '../../migrations/index.js';
import type {
  MigrationLogger,
  MigrationResult,
} from '../../migrations/index.js';

/**
 * Arguments for migrate command
 */
export interface MigrateCommandArgs {
  /** Target version to migrate to (e.g., "0.2.0") */
  targetVersion?: string;
  /** Preview changes without applying */
  dryRun?: boolean;
  /** List applied and pending migrations */
  list?: boolean;
  /** Show migration status */
  status?: boolean;
  /** Target directory to migrate */
  targetPath?: string;
  /** Include glob patterns (comma-separated string) */
  include?: string;
  /** Exclude glob patterns (comma-separated string) */
  exclude?: string;
}

/**
 * Result of migrate command
 */
export interface MigrateCommandResult {
  /** Whether the migration(s) succeeded */
  success: boolean;
  /** Number of migrations applied */
  migrationsApplied: number;
  /** Total files modified */
  filesModified: number;
  /** Per-migration results */
  results: MigrationResult[];
}

/**
 * Create a migration logger from the command context logger
 */
function createMigrationLogger(ctx: {
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    success: (msg: string) => void;
    debug: (msg: string) => void;
  };
}): MigrationLogger {
  return {
    info: ctx.logger.info.bind(ctx.logger),
    warn: ctx.logger.warn.bind(ctx.logger),
    error: ctx.logger.error.bind(ctx.logger),
    success: ctx.logger.success.bind(ctx.logger),
    debug: ctx.logger.debug.bind(ctx.logger),
  };
}

/**
 * Migrate command implementation
 */
// @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-invoke-migrate
export const migrateCommand: CommandDefinition<
  MigrateCommandArgs,
  MigrateCommandResult
> = {
  name: 'migrate',
  description: 'Apply codemod migrations to update FrontX projects',
  args: [
    {
      name: 'targetVersion',
      description: 'Target version to migrate to (e.g., "0.2.0")',
      required: false,
    },
  ],
  options: [
    {
      name: 'dryRun',
      shortName: 'd',
      description: 'Preview changes without applying',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'list',
      shortName: 'l',
      description: 'List applied and pending migrations',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'status',
      shortName: 's',
      description: 'Show migration status',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'targetPath',
      shortName: 'p',
      description: 'Target directory to migrate',
      type: 'string',
    },
    {
      name: 'include',
      description: 'Include glob patterns (comma-separated)',
      type: 'string',
    },
    {
      name: 'exclude',
      description: 'Exclude glob patterns (comma-separated)',
      type: 'string',
    },
  ],

  validate(_args, _ctx) {
    // Validation will be done in execute since we need async fs check
    return validationOk();
  },

  async execute(args, ctx): Promise<MigrateCommandResult> {
    const { logger, projectRoot } = ctx;
    const migrationLogger = createMigrationLogger(ctx);

    // Resolve target path
    const targetPath = args.targetPath
      ? path.resolve(args.targetPath)
      : projectRoot || process.cwd();

    // @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-handle-list
    // Handle --list flag
    if (args.list) {
      logger.newline();
      logger.info('Available Migrations:');
      logger.newline();

      const migrations = getMigrations();
      for (const migration of migrations) {
        logger.log(`  ${migration.id}`);
        logger.log(`    Version: ${migration.version}`);
        logger.log(`    Name: ${migration.name}`);
        logger.log(`    Transforms: ${migration.transforms.length}`);
        for (const transform of migration.transforms) {
          logger.log(`      - ${transform.name}`);
        }
        logger.newline();
      }

      return {
        success: true,
        migrationsApplied: 0,
        filesModified: 0,
        results: [],
      };
    }
    // @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-handle-list

    // @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-handle-status
    // Handle --status flag
    if (args.status) {
      logger.newline();
      logger.info(`Migration Status for: ${targetPath}`);
      logger.newline();

      const status = await getMigrationStatus(targetPath);

      if (status.currentVersion) {
        logger.log(`  Current Gears FrontX Version: ${status.currentVersion}`);
        logger.newline();
      }

      if (status.applied.length > 0) {
        logger.log('  Applied Migrations:');
        for (const applied of status.applied) {
          logger.log(`    - ${applied.id} (${applied.appliedAt})`);
          logger.log(`      Files modified: ${applied.filesModified}`);
        }
        logger.newline();
      } else {
        logger.log('  No migrations have been applied yet.');
        logger.newline();
      }

      if (status.pending.length > 0) {
        logger.log('  Pending Migrations:');
        for (const pending of status.pending) {
          logger.log(`    - ${pending.id}`);
        }
        logger.newline();
      } else {
        logger.log('  All migrations have been applied.');
        logger.newline();
      }

      return {
        success: true,
        migrationsApplied: 0,
        filesModified: 0,
        results: [],
      };
    }
    // @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-handle-status

    // Parse include/exclude patterns
    const include = args.include?.split(',').map((s: string) => s.replace(/^\s+|\s+$/g, ''));
    const exclude = args.exclude?.split(',').map((s: string) => s.replace(/^\s+|\s+$/g, ''));

    // @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-run-resolve-pending
    // Run migrations
    logger.newline();
    if (args.dryRun) {
      logger.info('Running migrations in dry-run mode (no changes will be made)');
    } else {
      logger.info('Running migrations...');
    }
    logger.newline();

    const results = await runMigrations(
      {
        targetPath,
        targetVersion: args.targetVersion,
        dryRun: args.dryRun,
        include,
        exclude,
      },
      migrationLogger
    );
    // @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-run-resolve-pending

    // @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-dry-run-preview
    // Display results
    for (const result of results) {
      if (args.dryRun) {
        logger.log(`Preview for ${result.migrationId}:`);
        logger.log(`  Files that would be modified: ${result.filesModified}`);
        logger.log(`  Total changes: ${result.totalChanges}`);
        logger.newline();

        if (result.files.length > 0) {
          logger.log('  Files:');
          for (const file of result.files) {
            logger.log(`    ${file.path} (${file.changesApplied} changes)`);
          }
          logger.newline();
        }
      } else {
        // @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-apply-migrations
        logger.log(formatResult(result));
        // @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-apply-migrations
      }
    }
    // @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-dry-run-preview

    const totalFilesModified = results.reduce(
      (sum, r) => sum + r.filesModified,
      0
    );
    const allSuccess = results.every((r) => r.success);

    if (results.length === 0) {
      logger.info('No migrations to apply.');
    } else if (args.dryRun) {
      logger.success(
        `Dry-run complete. ${totalFilesModified} files would be modified.`
      );
    } else if (allSuccess) {
      logger.success(
        `${results.length} migration(s) applied successfully. ${totalFilesModified} files modified.`
      );
    } else {
      logger.error('Some migrations failed. Check the output above for details.');
    }

    // @cpt-begin:cpt-frontx-flow-cli-tooling-migrate:p2:inst-return-migrate
    return {
      success: allSuccess,
      migrationsApplied: results.length,
      filesModified: totalFilesModified,
      results,
    };
    // @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-return-migrate
  },
};
// @cpt-end:cpt-frontx-flow-cli-tooling-migrate:p2:inst-invoke-migrate
