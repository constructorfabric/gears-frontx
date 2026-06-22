// @cpt-flow:cpt-frontx-flow-cli-tooling-update-layout:p2
// @cpt-dod:cpt-frontx-dod-cli-tooling-package:p1
import path from 'path';
import fs from 'fs-extra';
import type { CommandDefinition } from '../../core/command.js';
import { validationOk, validationError } from '../../core/types.js';
import { copyLayoutTemplates } from '../../generators/layoutFromTemplate.js';
import { writeGeneratedFiles } from '../../utils/fs.js';

/**
 * Arguments for update layout command
 */
export interface UpdateLayoutArgs {
  force?: boolean;
}

/**
 * Result of update layout command
 */
export interface UpdateLayoutResult {
  layoutPath: string;
  files: string[];
}

/**
 * Update layout command implementation
 *
 * Updates layout components from FrontX layout templates.
 */
// @cpt-begin:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-invoke-update-layout
export const updateLayoutCommand: CommandDefinition<
  UpdateLayoutArgs,
  UpdateLayoutResult
> = {
  name: 'update:layout',
  description: 'Update layout components from templates',
  args: [],
  options: [
    {
      name: 'force',
      shortName: 'f',
      description: 'Force update without prompting',
      type: 'boolean',
      defaultValue: false,
    },
  ],

  // @cpt-begin:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-check-project-root-update-layout
  validate(_args, ctx) {
    if (!ctx.projectRoot) {
      return validationError(
        'NOT_IN_PROJECT',
        'Not inside a FrontX project. Run this command from a project root.'
      );
    }

    return validationOk();
  },
  // @cpt-end:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-check-project-root-update-layout

  async execute(args, ctx): Promise<UpdateLayoutResult> {
    const { logger, projectRoot, prompt } = ctx;
    const force = args.force ?? false;

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-compare-layout-files
    // Check for existing layout
    const layoutDir = path.join(projectRoot!, 'src', 'app', 'layout');
    if (await fs.pathExists(layoutDir)) {
      const existingFiles = await fs.readdir(layoutDir);
      // @cpt-end:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-compare-layout-files

      // @cpt-begin:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-prompt-confirm-layout-overwrite
      if (existingFiles.length > 0 && !force) {
        logger.warn('Existing layout files will be overwritten:');
        for (const file of existingFiles.slice(0, 5)) {
          logger.log(`  ${file}`);
        }
        if (existingFiles.length > 5) {
          logger.log(`  ... and ${existingFiles.length - 5} more`);
        }
        logger.newline();

        const answers = await prompt<{ confirm: boolean }>([
          {
            name: 'confirm',
            message: 'Do you want to continue and overwrite these files?',
            type: 'confirm',
            default: false,
          },
        ]);

        if (!answers.confirm) {
          logger.info('Update cancelled');
          return {
            layoutPath: layoutDir,
            files: [],
          };
        }
      }
      // @cpt-end:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-prompt-confirm-layout-overwrite
    }

    logger.newline();
    logger.info('Updating layout components from Gears FrontX layout templates...');
    logger.newline();

    // Generate files from template
    const files = await copyLayoutTemplates({
      projectRoot: projectRoot!,
      force: true, // Already confirmed above
    });

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-write-updated-layout
    // Write files
    const writtenFiles = await writeGeneratedFiles(projectRoot!, files);
    // @cpt-end:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-write-updated-layout

    logger.success(`Updated ${writtenFiles.length} layout files`);
    logger.newline();
    logger.log('Files updated:');
    for (const file of writtenFiles) {
      logger.log(`  ${file}`);
    }
    logger.newline();

    // @cpt-begin:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-return-update-layout
    return {
      layoutPath: layoutDir,
      files: writtenFiles,
    };
    // @cpt-end:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-return-update-layout
  },
};
// @cpt-end:cpt-frontx-flow-cli-tooling-update-layout:p2:inst-invoke-update-layout
