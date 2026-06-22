// @cpt-flow:cpt-frontx-flow-cli-tooling-update-project:p1
// @cpt-algo:cpt-frontx-algo-cli-tooling-detect-release-channel:p1
// @cpt-dod:cpt-frontx-dod-cli-tooling-package:p1
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CommandDefinition } from '../../core/command.js';
import { validationOk, validationError } from '../../core/types.js';
import { syncTemplates } from '../../core/templates.js';
import {
  DEFAULT_PACKAGE_MANAGER,
  detectPackageManager,
  getAddPackagesCommand,
  getGlobalInstallCommand,
} from '../../core/packageManager.js';
import { aiSyncCommand } from '../ai/sync.js';

/**
 * Arguments for update command
 */
export interface UpdateCommandArgs {
  alpha?: boolean;
  stable?: boolean;
  templatesOnly?: boolean;
  skipAiSync?: boolean;
}

/**
 * Result of update command
 */
export interface UpdateCommandResult {
  cliUpdated: boolean;
  projectUpdated: boolean;
  updatedPackages: string[];
  templatesUpdated: boolean;
  syncedTemplates: string[];
  channel: 'alpha' | 'stable';
  aiSyncRun: boolean;
  aiSyncFiles: string[];
}

/**
 * Detect the current release channel based on installed CLI version
 * @returns 'alpha' if version contains prerelease identifier, 'stable' otherwise
 */
function detectCurrentChannel(): 'alpha' | 'stable' {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    let searchDir = path.dirname(currentFile);
    let version = '';

    // @cpt-begin:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-read-cli-package-version
    while (searchDir !== path.dirname(searchDir)) {
      const packageJsonPath = path.join(searchDir, 'package.json');
      if (fs.pathExistsSync(packageJsonPath)) {
        const packageJson = fs.readJsonSync(packageJsonPath);
        // @cpt-begin:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-read-cli-version-string
        if (packageJson.name === '@gears-frontx/cli' && typeof packageJson.version === 'string') {
          version = packageJson.version;
          break;
        }
        // @cpt-end:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-read-cli-version-string
      }
      searchDir = path.dirname(searchDir);
    }
    // @cpt-end:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-read-cli-package-version

    // @cpt-begin:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-check-prerelease-tag
    // Check for prerelease identifiers (alpha, beta, rc, etc.)
    if (version.includes('-alpha') || version.includes('-beta') || version.includes('-rc')) {
      return 'alpha';
    }
    // @cpt-end:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-check-prerelease-tag

    // @cpt-begin:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-return-stable
    return 'stable';
    // @cpt-end:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-return-stable
  } catch {
    // @cpt-begin:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-catch-detect-error
    // If detection fails, default to stable (safer)
    return 'stable';
    // @cpt-end:cpt-frontx-algo-cli-tooling-detect-release-channel:p1:inst-catch-detect-error
  }
}

/**
 * Update command implementation
 */
// @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-invoke-update
export const updateCommand: CommandDefinition<
  UpdateCommandArgs,
  UpdateCommandResult
> = {
  name: 'update',
  description: 'Update FrontX CLI and project packages',
  args: [],
  options: [
    {
      name: 'alpha',
      shortName: 'a',
      description: 'Update to latest alpha/prerelease version',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'stable',
      shortName: 's',
      description: 'Update to latest stable version',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'templates-only',
      description: 'Only sync templates (skip CLI and package updates)',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'skip-ai-sync',
      description: 'Skip running AI sync after update',
      type: 'boolean',
      defaultValue: false,
    },
  ],

  // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-check-conflicting-update-flags
  validate(args) {
    // Cannot specify both --alpha and --stable
    if (args.alpha && args.stable) {
      return validationError('CONFLICTING_OPTIONS', 'Cannot specify both --alpha and --stable');
    }
    return validationOk();
  },
  // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-check-conflicting-update-flags

  async execute(args, ctx): Promise<UpdateCommandResult> {
    const { logger, projectRoot } = ctx;
    const packageManagerCtx = projectRoot
      ? await detectPackageManager(projectRoot, ctx.config)
      : { manager: DEFAULT_PACKAGE_MANAGER };

    let cliUpdated = false;
    let projectUpdated = false;
    let templatesUpdated = false;
    let aiSyncRun = false;
    const updatedPackages: string[] = [];
    const syncedTemplates: string[] = [];
    const aiSyncFiles: string[] = [];

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-run-detect-channel
    // Determine which channel to use
    let channel: 'alpha' | 'stable';
    if (args.alpha) {
      channel = 'alpha';
    } else if (args.stable) {
      channel = 'stable';
    } else {
      // Auto-detect based on current installation
      channel = detectCurrentChannel();
    }

    const tag = channel === 'alpha' ? '@alpha' : '@latest';
    // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-run-detect-channel

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-update-cli-global
    // Skip CLI and package updates if --templates-only
    if (!args.templatesOnly) {
      logger.info(`Update channel: ${channel}`);
      logger.newline();

      // Update CLI
      logger.info('Checking for CLI updates...');
      try {
        const cliUpdateTarget = `@gears-frontx/cli${tag}`;
        const globalInstallCmd = getGlobalInstallCommand(
          packageManagerCtx.manager,
          cliUpdateTarget
        );

        if (!globalInstallCmd) {
          logger.warn(
            `Global CLI update is not supported for ${packageManagerCtx.manager}. Skipping global update.`
          );
        } else {
          execSync(globalInstallCmd, { stdio: 'pipe' });
          cliUpdated = true;
          logger.success(`@gears-frontx/cli updated (${channel})`);
        }
      } catch {
        logger.info('@gears-frontx/cli is already up to date');
      }
      // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-update-cli-global

      // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-update-project-packages
      // If inside a project, update project packages
      if (projectRoot) {
        logger.newline();
        logger.info('Updating project Gears FrontX packages...');

        const packageJsonPath = path.join(projectRoot, 'package.json');
        const packageJson = await fs.readJson(packageJsonPath);

        const frontxPackages: string[] = [];

        // Find all @gears-frontx/* packages
        for (const dep of Object.keys(packageJson.dependencies || {})) {
          if (dep.startsWith('@gears-frontx/')) {
            frontxPackages.push(dep);
          }
        }
        for (const dep of Object.keys(packageJson.devDependencies || {})) {
          if (dep.startsWith('@gears-frontx/')) {
            frontxPackages.push(dep);
          }
        }

        if (frontxPackages.length > 0) {
          const packagesToUpdate = [...new Set(frontxPackages)];
          logger.info(`Found ${packagesToUpdate.length} Gears FrontX packages to update`);

          try {
            // Install each package with the appropriate tag
            const packagesWithTag = packagesToUpdate.map(pkg => `${pkg}${tag}`);
            const updateCmd = getAddPackagesCommand(
              packageManagerCtx.manager,
              packagesWithTag
            );
            execSync(updateCmd, { cwd: projectRoot, stdio: 'inherit' });
            projectUpdated = true;
            updatedPackages.push(...packagesToUpdate);
            logger.success(`Project packages updated (${channel})`);
          } catch {
            logger.warn('Failed to update some packages');
          }
        } else {
          logger.info('No Gears FrontX packages found in project');
        }
      } else {
        logger.newline();
        logger.info('Not inside a FrontX project. Only CLI was updated.');
        logger.info('Run `frontx update` from a project directory to update project packages.');
      }
      // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-update-project-packages
    }

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-run-sync-templates
    // Sync project templates if inside a project
    if (projectRoot) {
      logger.newline();
      logger.info('Syncing project templates...');

      // Read layer from config, default to 'app' if not found
      const layer = ctx.config?.layer ?? 'app';
      if (!ctx.config || !ctx.config.layer) {
        logger.info(`Info: No layer found in config, assuming 'app' layer`);
      }

      const synced = await syncTemplates(projectRoot, logger, layer);
      if (synced.length > 0) {
        templatesUpdated = true;
        syncedTemplates.push(...synced);
        logger.success(`Templates updated: ${synced.length} directories`);
        for (const file of synced) {
          logger.info(`  - ${file}`);
        }
        logger.info(
          `Tip: run \`${packageManagerCtx.manager} install\` to refresh workspace dependencies after template sync.`
        );
      } else {
        logger.info('Templates are already up to date');
      }
      // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-run-sync-templates

      // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-run-ai-sync-after-update
      // Run AI sync unless skipped
      if (!args.skipAiSync) {
        logger.newline();
        logger.info('Syncing AI assistant configurations...');

        try {
          const aiSyncResult = await aiSyncCommand.execute(
            { tool: 'all', detectPackages: true },
            ctx
          );
          aiSyncRun = true;
          aiSyncFiles.push(...aiSyncResult.filesGenerated);
          if (aiSyncResult.filesGenerated.length > 0) {
            logger.success(`AI configs updated: ${aiSyncResult.filesGenerated.length} files`);
            for (const file of aiSyncResult.filesGenerated) {
              logger.info(`  - ${file}`);
            }
          } else {
            logger.info('AI configs are already up to date');
          }
        } catch (_error) {
          logger.warn('AI sync skipped (no .ai directory found)');
        }
      }
      // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-run-ai-sync-after-update
    }

    logger.newline();
    logger.success('Update complete!');

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-project:p1:inst-return-update
    return {
      cliUpdated,
      projectUpdated,
      updatedPackages,
      templatesUpdated,
      syncedTemplates,
      channel,
      aiSyncRun,
      aiSyncFiles,
    };
    // @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-return-update
  },
};
// @cpt-end:cpt-frontx-flow-cli-tooling-update-project:p1:inst-invoke-update
