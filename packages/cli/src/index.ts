#!/usr/bin/env node
/**
 * FrontX CLI Entry Point
 *
 * Commands:
 *   frontx create <project-name>              Create a new FrontX project
 *   frontx update                             Update CLI and project packages
 *   frontx validate components [path]         Validate component structure
 *   frontx migrate [version]                  Apply codemod migrations
 */
// @cpt-dod:cpt-frontx-dod-cli-tooling-package:p1

import { Command } from 'commander';
import { registry, executeCommand } from './core/index.js';
import {
  createCommand,
  updateCommand,
  validateComponentsCommand,
  scaffoldLayoutCommand,
  aiSyncCommand,
  updateLayoutCommand,
  migrateCommand,
  screensetCreateCommand,
} from './commands/index.js';

// CLI version
const VERSION = '0.1.0';

// Register all commands
registry.register(createCommand);
registry.register(updateCommand);
registry.register(validateComponentsCommand);
registry.register(scaffoldLayoutCommand);
registry.register(aiSyncCommand);
registry.register(updateLayoutCommand);
registry.register(migrateCommand);
registry.register(screensetCreateCommand);

// Create Commander program
const program = new Command();

const parsePortOption = (value: string): number => {
  const normalizedValue = value.trim();

  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error('Port must be a number');
  }

  return parseInt(normalizedValue, 10);
};

program
  .name('frontx')
  .description('FrontX CLI - Project scaffolding and package management')
  .version(VERSION);

// Global quiet flag
program.option('-q, --quiet', 'Suppress non-essential output');

// frontx create <project-name>
program
  .command('create <project-name>')
  .description('Create a new FrontX project or layer package')
  .option('--studio', 'Include Studio package')
  .option('--no-studio', 'Exclude Studio package')
  .option('--uikit <type>', "UI components ('shadcn' for shadcn/ui, 'none' for no UI components)")
  .option(
    '--package-manager <manager>',
    "Package manager to use ('npm', 'pnpm', 'yarn')"
  )
  .option('-l, --layer <type>', 'Create a package for a specific SDK layer (sdk, framework, react)')
  .option('--local', 'Use local @gears-frontx packages from monorepo (file:) instead of npm')
  .option('--tests <variant>', "Test scaffold ('unit' or 'none' to skip Vitest scaffolding)")
  .action(async (projectName: string, options: Record<string, unknown>) => {
    const result = await executeCommand(
      createCommand,
      {
        projectName,
        studio: options.studio as boolean | undefined,
        uikit: options.uikit as 'shadcn' | 'none' | undefined,
        packageManager: options.packageManager as 'npm' | 'pnpm' | 'yarn' | undefined,
        layer: options.layer as 'sdk' | 'framework' | 'react' | 'app' | undefined,
        local: options.local as boolean | undefined,
        tests: options.tests as 'unit' | 'none' | undefined,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// frontx update subcommand
const updateCmd = program
  .command('update')
  .description('Update commands for FrontX projects');

// frontx update (default - updates CLI and packages)
updateCmd
  .command('packages', { isDefault: true })
  .description('Update FrontX CLI and project packages')
  .option('-a, --alpha', 'Update to latest alpha/prerelease version')
  .option('-s, --stable', 'Update to latest stable version')
  .option('--templates-only', 'Only sync templates (skip CLI and package updates)')
  .option('--skip-ai-sync', 'Skip running AI sync after update')
  .action(async (options: Record<string, unknown>) => {
    const result = await executeCommand(
      updateCommand,
      {
        alpha: options.alpha as boolean | undefined,
        stable: options.stable as boolean | undefined,
        templatesOnly: options.templatesOnly as boolean | undefined,
        skipAiSync: options.skipAiSync as boolean | undefined,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// frontx update layout
updateCmd
  .command('layout')
  .description('Update layout components from templates')
  .option('-f, --force', 'Force update without prompting')
  .action(async (options: Record<string, unknown>) => {
    const result = await executeCommand(
      updateLayoutCommand,
      {
        force: options.force as boolean,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// frontx validate subcommand
const validateCmd = program
  .command('validate')
  .description('Validation commands');

// frontx validate components [path]
validateCmd
  .command('components [path]')
  .description('Validate component structure and placement')
  .action(async (targetPath: string | undefined) => {
    const result = await executeCommand(
      validateComponentsCommand,
      { path: targetPath },
      { interactive: true }
    );

    if (!result.success || !result.data?.passed) {
      process.exit(1);
    }
  });

// frontx scaffold subcommand
const scaffoldCmd = program
  .command('scaffold')
  .description('Generate project components from templates');

// frontx scaffold layout
scaffoldCmd
  .command('layout')
  .description('Generate HAI3 layout components in your project')
  .option('-f, --force', 'Overwrite existing layout files')
  .action(async (options: Record<string, unknown>) => {
    const result = await executeCommand(
      scaffoldLayoutCommand,
      {
        force: options.force as boolean,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// frontx ai subcommand
const aiCmd = program
  .command('ai')
  .description('AI assistant configuration commands');

// frontx ai sync
aiCmd
  .command('sync')
  .description('Sync AI assistant configuration files')
  .option(
    '-t, --tool <tool>',
    'Specific tool to sync (claude, copilot, cursor, windsurf, all)',
    'all'
  )
  .option('-d, --detect-packages', 'Detect installed @gears-frontx packages')
  .option('--diff', 'Show diff of changes without writing files')
  .action(async (options: Record<string, unknown>) => {
    const result = await executeCommand(
      aiSyncCommand,
      {
        tool: options.tool as 'claude' | 'copilot' | 'cursor' | 'windsurf' | 'all',
        detectPackages: options.detectPackages as boolean,
        diff: options.diff as boolean,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// frontx screenset subcommand
const screensetCmd = program
  .command('screenset')
  .description('Screenset management commands');

// frontx screenset create <name>
screensetCmd
  .command('create <name>')
  .description('Create a new MFE screenset package')
  .option('-p, --port <number>', 'MFE dev server port (auto-assigned if omitted)', parsePortOption)
  .action(async (name: string, options: Record<string, unknown>) => {
    const result = await executeCommand(
      screensetCreateCommand,
      {
        name,
        port: options.port as number | undefined,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// frontx migrate [version]
program
  .command('migrate [targetVersion]')
  .description('Apply codemod migrations to update FrontX projects')
  .option('-d, --dry-run', 'Preview changes without applying')
  .option('-l, --list', 'List available migrations')
  .option('-s, --status', 'Show migration status')
  .option('-p, --path <path>', 'Target directory to migrate')
  .option('--include <patterns>', 'Include glob patterns (comma-separated)')
  .option('--exclude <patterns>', 'Exclude glob patterns (comma-separated)')
  .action(async (targetVersion: string | undefined, options: Record<string, unknown>) => {
    const result = await executeCommand(
      migrateCommand,
      {
        targetVersion,
        dryRun: options.dryRun as boolean,
        list: options.list as boolean,
        status: options.status as boolean,
        targetPath: options.path as string | undefined,
        include: options.include as string | undefined,
        exclude: options.exclude as string | undefined,
      },
      { interactive: true }
    );

    if (!result.success) {
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
