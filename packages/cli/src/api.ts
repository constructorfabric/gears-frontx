/**
 * HAI3 CLI Programmatic API
 *
 * This module exports the CLI functionality for programmatic use by AI agents
 * and other tools that need to invoke CLI commands without interactive prompts.
 *
 * @example
 * ```typescript
 * import { executeCommand, commands } from '@gears-frontx/cli';
 *
 * // Create a project programmatically
 * const result = await executeCommand(
 *   commands.create,
 *   { projectName: 'my-app' },
 *   { interactive: false }
 * );
 *
 * if (result.success) {
 *   console.log('Created project:', result.data.projectPath);
 * }
 * ```
 */
// @cpt-dod:cpt-hai3-dod-cli-tooling-package:p1

// Import commands for the commands object
import {
  createCommand as _createCommand,
  updateCommand as _updateCommand,
} from './commands/index.js';

// Core infrastructure
export {
  executeCommand,
  buildCommandContext,
  registry,
  CommandRegistry,
  Logger,
  validationOk,
  validationError,
} from './core/index.js';

// Types
export type {
  CommandContext,
  CommandDefinition,
  Hai3Config,
  ConfigLoadResult,
  ScreensetCategory,
  ArgDefinition,
  OptionDefinition,
  ValidationError,
  ValidationResult,
  CommandResult,
  ExecutionMode,
  GeneratedFile,
  PromptFn,
  PromptQuestion,
} from './core/index.js';

// Commands
export {
  createCommand,
  updateCommand,
} from './commands/index.js';

// Command types
export type {
  CreateCommandArgs,
  CreateCommandResult,
  UpdateCommandArgs,
  UpdateCommandResult,
} from './commands/index.js';

// Generators (for advanced use cases)
export {
  generateProject,
  generateI18nStubs,
  toPascalCase,
  toCamelCase,
  toScreamingSnake,
  toKebabCase,
  parseIdsFile,
  generateTransformationMap,
  transformContent,
  transformFileName,
} from './generators/index.js';

// Generator types
export type {
  ProjectGeneratorInput,
  I18nGeneratorInput,
  IdTransformation,
} from './generators/index.js';

// Utilities
export {
  findProjectRoot,
  loadConfig,
  saveConfig,
  isInsideProject,
  getScreensetsDir,
  screensetExists,
  writeGeneratedFiles,
  isValidPackageName,
  isCamelCase,
  isPascalCase,
} from './utils/index.js';

/**
 * Pre-configured command objects for easy access
 */
export const commands = {
  create: _createCommand,
  update: _updateCommand,
} as const;
