// @cpt-begin:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-cmd-types
import path from 'path';
import fs from 'fs-extra';
import type { CommandDefinition } from '../../core/command.js';
import { validationOk, validationError } from '../../core/types.js';
import { isCamelCase, isReservedScreensetName, isCustomUikit, isValidPackageName } from '../../utils/validation.js';
import { generateScreenset, assignMfePort, toKebabCase } from '../../generators/screenset.js';
import { loadConfig } from '../../utils/project.js';
/**
 * Arguments for screenset create command
 */
export interface ScreensetCreateArgs {
  name: string;
  port?: number | string;
}

/**
 * Result of screenset create command
 */
export interface ScreensetCreateResult {
  mfePath: string;
  files: string[];
  port: number;
}

function parsePortArg(port: ScreensetCreateArgs['port']): number | undefined {
  if (port === undefined) {
    return undefined;
  }

  if (typeof port === 'number') {
    return Number.isInteger(port) ? port : Number.NaN;
  }

  const normalizedPort = port.trim();
  if (!/^\d+$/.test(normalizedPort)) {
    return Number.NaN;
  }

  return Number(normalizedPort);
}

function isValidPortNumber(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
// @cpt-end:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-cmd-types

/**
 * screenset create command implementation
 *
 * Scaffolds a new MFE screenset package from the _blank-mfe template.
 */
// @cpt-flow:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2
// @cpt-dod:cpt-hai3-dod-ui-libraries-choice-screenset-generation:p2
// @cpt-begin:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-cmd-definition
export const screensetCreateCommand: CommandDefinition<
  ScreensetCreateArgs,
  ScreensetCreateResult
> = {
  name: 'screenset:create',
  description: 'Create a new MFE screenset package',
  args: [
    {
      name: 'name',
      description: 'Screenset name in camelCase (e.g., contacts, dashboard)',
      required: true,
    },
  ],
  options: [
    {
      name: 'port',
      description: 'MFE dev server port (auto-assigned if omitted)',
      type: 'string',
    },
  ],
// @cpt-end:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-cmd-definition

  // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-generate-1
  validate(args, ctx) {
    const { name } = args;

    if (!name) {
      return validationError('MISSING_NAME', 'Screenset name is required.');
    }

    if (!isCamelCase(name)) {
      return validationError(
        'INVALID_NAME',
        `Invalid screenset name "${name}". Name must be camelCase (e.g., contacts, myDashboard).`
      );
    }

    if (isReservedScreensetName(name)) {
      return validationError(
        'RESERVED_NAME',
        `"${name}" is a reserved name. Choose a different screenset name.`
      );
    }

    if (!ctx.projectRoot) {
      return validationError(
        'NOT_IN_PROJECT',
        'Not inside a HAI3 project. Run this command from a project root.'
      );
    }

    if (args.port !== undefined) {
      const parsedPort = parsePortArg(args.port);
      if (parsedPort === undefined || !isValidPortNumber(parsedPort)) {
        return validationError(
          'INVALID_PORT',
          `Invalid port "${String(args.port)}". Port must be an integer between 1 and 65535.`
        );
      }
    }

    return validationOk();
  },
  // @cpt-end:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-generate-1

  // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-cmd-execute
  async execute(args, ctx): Promise<ScreensetCreateResult> {
    const { logger, projectRoot } = ctx;
    const { name } = args;

    // Derive kebab name for directory check
    const nameKebab = toKebabCase(name);
    const mfeDirName = `${nameKebab}-mfe`;
    const mfePath = path.join(projectRoot!, 'src', 'mfe_packages', mfeDirName);

    // Check for collision with existing MFE package
    if (await fs.pathExists(mfePath)) {
      throw new Error(
        `MFE package already exists at src/mfe_packages/${mfeDirName}/. Choose a different name.`
      );
    }

    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-generate-2
    const configResult = await loadConfig(projectRoot!);
    if (!configResult.ok) {
      throw new Error(configResult.message);
    }
    const config = configResult.config;
    if (!config.uikit) {
      throw new Error(
        'Missing "uikit" field in frontx.config.json. Recreate the project with `hai3 create` or add a "uikit" field ("shadcn", "none", or an npm package name).'
      );
    }
    if (isCustomUikit(config.uikit) && !isValidPackageName(config.uikit)) {
      throw new Error(
        `Invalid "uikit" value in frontx.config.json: "${config.uikit}" is not a valid npm package name.`
      );
    }
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-generate-2

    // Assign port
    const parsedPort = parsePortArg(args.port);
    const port = parsedPort ?? (await assignMfePort(projectRoot!));

    logger.info(`Creating screenset '${name}' (port: ${port})...`);
    logger.newline();

    // @cpt-begin:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-generate-6
    const result = await generateScreenset({
      name,
      port,
      projectRoot: projectRoot!,
    });
    // @cpt-end:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-generate-6

    logger.success(`Created screenset '${name}' at src/mfe_packages/${mfeDirName}/`);
    logger.newline();
    logger.log(`Files created (${result.files.length} files):`);
    for (const file of result.files.slice(0, 10)) {
      logger.log(`  ${file}`);
    }
    if (result.files.length > 10) {
      logger.log(`  ... and ${result.files.length - 10} more`);
    }
    logger.newline();
    logger.log('Next steps:');
    logger.log(`  cd src/mfe_packages/${mfeDirName}`);
    logger.log('  npm install');
    logger.log(`  npm run dev  # starts on port ${port}`);
    logger.newline();
    logger.info('MFE manifests regenerated in src/app/mfe/generated-mfe-manifests.ts.');

    return {
      mfePath: result.mfePath,
      files: result.files,
      port,
    };
  },
  // @cpt-end:cpt-hai3-flow-ui-libraries-choice-screenset-generate:p2:inst-screenset-cmd-execute
};
