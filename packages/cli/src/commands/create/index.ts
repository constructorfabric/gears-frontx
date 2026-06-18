// @cpt-flow:cpt-hai3-flow-cli-tooling-create-project:p1
// @cpt-dod:cpt-hai3-dod-cli-tooling-package:p1
// @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-invoke-create
import fs from 'fs-extra';
import path from 'path';
import type { CommandDefinition } from '../../core/command.js';
import {
  validationOk,
  validationError,
  type LayerType,
  type PackageManager,
} from '../../core/types.js';
import { getTemplatesDir } from '../../core/templates.js';
import {
  DEFAULT_PACKAGE_MANAGER,
  getInstallCommand,
  getRunScriptCommand,
  isSupportedPackageManager,
} from '../../core/packageManager.js';
import { generateProject } from '../../generators/project.js';
import { generateLayerPackage } from '../../generators/layerPackage.js';
import { writeGeneratedFiles } from '../../utils/fs.js';
import {
  isValidPackageName,
  isCustomUikit,
  validateNpmPackage,
  normalizeUikit,
} from '../../utils/validation.js';
import { findMonorepoRoot } from '../../utils/project.js';
import { aiSyncCommand } from '../ai/sync.js';

/**
 * Arguments for create command
 */
export interface CreateCommandArgs {
  projectName: string;
  studio?: boolean;
  uikit?: string;
  packageManager?: PackageManager;
  layer?: LayerType;
  /** Use local monorepo packages (file:) instead of npm registry */
  local?: boolean;
}

/**
 * Result of create command
 */
export interface CreateCommandResult {
  projectPath: string;
  files: string[];
}

/**
 * Create command implementation
 */
export const createCommand: CommandDefinition<
  CreateCommandArgs,
  CreateCommandResult
> = {
  name: 'create',
  description: 'Create a new HAI3 project',
  args: [
    {
      name: 'projectName',
      description: 'Name of the project to create',
      required: true,
    },
  ],
  options: [
    {
      name: 'studio',
      description: 'Include Studio package',
      type: 'boolean',
    },
    {
      name: 'uikit',
      description: "UI components: 'shadcn' for shadcn/ui, 'none' for no UI, or an npm package name",
      type: 'string',
    },
    {
      name: 'layer',
      shortName: 'l',
      description: 'Create a package for a specific SDK layer (sdk, framework, react)',
      type: 'string',
      choices: ['sdk', 'framework', 'react', 'app'],
    },
    {
      name: 'local',
      description: 'Use local @gears-frontx packages from monorepo (file:) instead of npm; requires CLI run from linked monorepo or GEARS_FRONTX_MONOREPO_ROOT',
      type: 'boolean',
    },
    {
      name: 'package-manager',
      description: 'Package manager to use',
      type: 'string',
      choices: ['npm', 'pnpm', 'yarn'],
    },
  ],

  validate(args, ctx) {
    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-run-name-validation
    // @cpt-ref:cpt-hai3-algo-cli-tooling-validate-project-name:p1:inst-check-empty-name
    if (!args.projectName) {
      return validationError('MISSING_NAME', 'Project name is required');
    }

    if (!isValidPackageName(args.projectName)) {
      return validationError(
        'INVALID_NAME',
        'Invalid project name. Must be a valid npm package name.'
      );
    }

    // @cpt-begin:cpt-hai3-algo-cli-tooling-validate-project-name:p1:inst-check-layer-enum
    if (args.layer) {
      const validLayers: LayerType[] = ['sdk', 'framework', 'react', 'app'];
      if (!validLayers.includes(args.layer)) {
        return validationError(
          'INVALID_LAYER',
          `Invalid layer '${args.layer}'. Valid options: sdk, framework, react`
        );
      }
    }
    // @cpt-end:cpt-hai3-algo-cli-tooling-validate-project-name:p1:inst-check-layer-enum

    if (args.packageManager && !isSupportedPackageManager(args.packageManager)) {
      return validationError(
        'INVALID_PACKAGE_MANAGER',
        "Invalid package manager. Valid options: npm, pnpm, yarn"
      );
    }
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-run-name-validation

    // Check if directory exists
    const projectPath = path.join(ctx.cwd, args.projectName);
    if (fs.existsSync(projectPath)) {
      // Will prompt for overwrite in execute
    }

    return validationOk();
  },

  // @cpt-flow:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2
  // @cpt-flow:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2
  // @cpt-flow:cpt-hai3-flow-ui-libraries-choice-create-none:p2
  // @cpt-dod:cpt-hai3-dod-ui-libraries-choice-create-scaffolding:p2
  async execute(args, ctx): Promise<CreateCommandResult> {
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-1
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-1
    const { logger, prompt } = ctx;
    const projectPath = path.join(ctx.cwd, args.projectName);
    const layer = args.layer ?? 'app';
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-1
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-1
    let packageManager = args.packageManager ?? DEFAULT_PACKAGE_MANAGER;

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-check-dir-exists
    // Check for existing directory
    if (await fs.pathExists(projectPath)) {
      const { overwrite } = await prompt<{ overwrite: boolean }>([
        {
          name: 'overwrite',
          type: 'confirm',
          message: `Directory '${args.projectName}' already exists. Overwrite?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        throw new Error('Aborted.');
      }

      await fs.remove(projectPath);
    }
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-check-dir-exists

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-branch-layer
    // For layer packages (sdk, framework, react), skip uikit/studio prompts
    if (layer !== 'app') {
      logger.newline();
      logger.info(`Creating ${layer}-layer package '${args.projectName}'...`);
      logger.newline();

      // Generate layer package files
      const files = await generateLayerPackage({
        packageName: args.projectName,
        layer,
        packageManager,
      });

      // Write files
      const writtenFiles = await writeGeneratedFiles(projectPath, files);
      logger.success(`Generated ${writtenFiles.length} files`);

      // Run ai sync to generate IDE config files
      logger.newline();
      logger.info('Generating AI assistant configurations...');
      try {
        await aiSyncCommand.execute(
          { tool: 'all' },
          { ...ctx, projectRoot: projectPath }
        );
      } catch {
        // Ignore errors - ai sync is optional
      }

      // Done
      logger.newline();
      logger.success(`Package '${args.projectName}' created successfully!`);
      logger.newline();
      logger.log('Next steps:');
      logger.log(`  cd ${args.projectName}`);
      logger.log(`  ${getInstallCommand(packageManager)}`);
      logger.log(`  ${getRunScriptCommand(packageManager, 'build')}`);
      logger.newline();
      logger.log(`This is a ${layer}-layer package.`);
      logger.log('See .ai/GUIDELINES.md for layer-specific rules.');
      logger.newline();

      return {
        projectPath,
        files: writtenFiles,
      };
    }
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-branch-layer

    // App project - get configuration via prompts if not provided
    let studio = args.studio;
    let uikit = args.uikit;

    // Prompt for missing configuration
    const promptQuestions: Array<{
      name: string;
      type: 'confirm' | 'list';
      message: string;
      default?: unknown;
      choices?: Array<{ name: string; value: unknown }>;
    }> = [];

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-prompt-studio
    if (studio === undefined) {
      promptQuestions.push({
        name: 'studio',
        type: 'confirm' as const,
        message: 'Include Studio (development overlay)?',
        default: true,
      });
    }
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-prompt-studio

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-prompt-uikit
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-2
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-2
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-none:p2:inst-create-none-1
    if (uikit === undefined) {
      promptQuestions.push({
        name: 'uikit',
        type: 'list' as const,
        message: 'Select UI components:',
        choices: [
          { name: 'shadcn/ui (locally-owned components)', value: 'shadcn' },
          { name: 'Custom (enter npm package name)', value: 'custom' },
          { name: 'None (implement your own)', value: 'none' },
        ],
        default: 'shadcn',
      });
    }
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-none:p2:inst-create-none-1
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-2
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-2
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-prompt-uikit

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-prompt-package-manager
    if (args.packageManager === undefined) {
      promptQuestions.push({
        name: 'packageManager',
        type: 'list' as const,
        message: 'Select package manager:',
        choices: [
          { name: 'npm (default)', value: 'npm' },
          { name: 'pnpm', value: 'pnpm' },
          { name: 'yarn', value: 'yarn' },
        ],
        default: DEFAULT_PACKAGE_MANAGER,
      });
    }
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-prompt-package-manager

    if (promptQuestions.length > 0) {
      const answers = await prompt<{
        studio?: boolean;
        uikit?: string;
        packageManager?: PackageManager;
      }>(promptQuestions);

      if (studio === undefined) {
        studio = answers.studio;
      }
      // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-3
      if (uikit === undefined) {
        uikit = answers.uikit;
      }
      if (args.packageManager === undefined) {
        packageManager = answers.packageManager ?? DEFAULT_PACKAGE_MANAGER;
      }
      // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-3
    }

    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-3
    // Follow-up prompt for custom uikit package name
    if (uikit === 'custom') {
      const { customPackage } = await prompt<{ customPackage: string }>([
        {
          name: 'customPackage',
          type: 'input' as const,
          message: 'Enter npm package name:',
        },
      ]);
      uikit = customPackage;
    }
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-3

    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-4
    const resolvedUikit = normalizeUikit(uikit || 'shadcn');

    // Validate custom uikit package against npm registry
    if (isCustomUikit(resolvedUikit)) {
      logger.info(`Verifying package '${resolvedUikit}'...`);
      const result = await validateNpmPackage(resolvedUikit);
      if (!result.exists) {
        throw new Error(result.error || 'Package validation failed');
      }
      if (result.warning) {
        logger.warn(result.warning);
      }
    }
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-4

    logger.newline();
    logger.info(`Creating project '${args.projectName}'...`);
    logger.newline();

    // Resolve local packages when --local or GEARS_FRONTX_USE_LOCAL
    const useLocal = args.local ?? (process.env.GEARS_FRONTX_USE_LOCAL === '1' || process.env.GEARS_FRONTX_USE_LOCAL === 'true');
    let monorepoRoot: string | null = null;
    if (useLocal) {
      monorepoRoot = await findMonorepoRoot(getTemplatesDir());
      if (!monorepoRoot) {
        logger.warn(
          'Local packages requested but Gears FrontX Monorepo root not found. Set GEARS_FRONTX_MONOREPO_ROOT or run from a linked CLI inside the monorepo. Using registry versions.'
        );
      } else {
        logger.info('Using local @gears-frontx packages from monorepo (file:).');
      }
    }

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-run-generate-project
    // Generate project files (async - reads from templates)
    const files = await generateProject({
      projectName: args.projectName,
      studio: studio!,
      uikit: resolvedUikit,
      packageManager,
      layer,
      useLocalPackages: Boolean(monorepoRoot),
      monorepoRoot: monorepoRoot ?? undefined,
      projectPath,
    });
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-run-generate-project

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-write-files
    // Write files
    const writtenFiles = await writeGeneratedFiles(projectPath, files);
    logger.success(`Generated ${writtenFiles.length} files`);
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-write-files

    // Display message based on uikit selection
    if (isCustomUikit(resolvedUikit)) {
      logger.newline();
      logger.info('Library themes configured. Run `npm run dev` to see the Studio theme selector.');
      logger.log('Demo screenset excluded — create your own with `hai3 screenset create`.');
    } else if (resolvedUikit !== 'shadcn') {
      logger.newline();
      logger.warn('No UI components included.');
      logger.log('Create your own screenset with `hai3 screenset create`.');
    }

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-run-ai-sync-after-create
    // Run ai sync to generate IDE config files
    logger.newline();
    logger.info('Generating AI assistant configurations...');
    try {
      await aiSyncCommand.execute(
        { tool: 'all' },
        { ...ctx, projectRoot: projectPath }
      );
    } catch {
      // Ignore errors - ai sync is optional
    }
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-run-ai-sync-after-create

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-log-success-create
    // Done
    logger.newline();
    logger.success(`Project '${args.projectName}' created successfully!`);
    logger.newline();
    logger.log('Next steps:');
    logger.log(`  cd ${args.projectName}`);
    logger.log('  git init');
    logger.log(`  ${getInstallCommand(packageManager)}`);
    logger.log(`  ${getRunScriptCommand(packageManager, 'dev')}`);
    logger.newline();
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-log-success-create

    // @cpt-begin:cpt-hai3-flow-cli-tooling-create-project:p1:inst-return-create
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-8
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-8
    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-create-none:p2:inst-create-none-6
    return {
      projectPath,
      files: writtenFiles,
    };
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-none:p2:inst-create-none-6
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-thirdparty:p2:inst-create-thirdparty-8
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-create-shadcn:p2:inst-create-shadcn-8
    // @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-return-create
  },
};
// @cpt-end:cpt-hai3-flow-cli-tooling-create-project:p1:inst-invoke-create
