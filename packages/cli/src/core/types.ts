/**
 * Core type definitions for HAI3 CLI
 */
// @cpt-dod:cpt-hai3-dod-cli-tooling-command-infra:p1
// @cpt-dod:cpt-hai3-dod-cli-tooling-layer-variants:p1

/**
 * Layer types for SDK architecture
 */
export type LayerType = 'sdk' | 'framework' | 'react' | 'app';
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/**
 * Theme configuration for Studio / generated theme files.
 * Used by uikit bridge and generic theme generation.
 */
export interface ThemeConfig {
  id: string;
  name: string;
  default?: boolean;
  variables: Record<string, string>;
}

/**
 * HAI3 project configuration stored in frontx.config.json
 * This file serves as a project marker for CLI detection.
 */
export interface Hai3Config {
  /** Marker to identify HAI3 projects */
  hai3: true;
  /** Project layer (SDK architecture tier) */
  layer?: LayerType;
  /** UI components: 'shadcn' for shadcn/ui, 'none' for no UI components, or an npm package name */
  uikit?: string;
  /** Selected package manager for this project */
  packageManager?: PackageManager;
  /**
   * Optional legacy package manager version.
   * Kept for backwards compatibility with older generated configs.
   */
  packageManagerVersion?: string;
  /** Optional linker mode (used by yarn) */
  linkerMode?: 'node-modules' | 'pnp';
}

/**
 * Screenset category enum matching uicore's ScreensetCategory
 */
export type ScreensetCategory = 'drafts' | 'mockups' | 'production';

/**
 * Argument definition for commands
 */
export interface ArgDefinition {
  name: string;
  description: string;
  required: boolean;
}

/**
 * Option definition for commands
 */
export interface OptionDefinition {
  name: string;
  shortName?: string;
  description: string;
  type: 'string' | 'boolean';
  defaultValue?: string | boolean;
  choices?: string[];
}

/**
 * Validation error with code for programmatic handling
 */
export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Result of command validation
 */
export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

/**
 * Successful validation result
 */
export function validationOk(): ValidationResult {
  return { ok: true, errors: [] };
}

/**
 * Failed validation result
 */
export function validationError(code: string, message: string): ValidationResult {
  return { ok: false, errors: [{ code, message }] };
}

/**
 * Command execution result
 */
export type CommandResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/**
 * Execution mode for commands
 */
export interface ExecutionMode {
  /** If false, skip interactive prompts and use provided answers */
  interactive: boolean;
  /** Pre-filled answers for prompts (used when interactive: false) */
  answers?: Record<string, unknown>;
}

/**
 * Result of loading a HAI3 config file.
 * Discriminated union so callers handle every outcome without surprise throws.
 */
export type ConfigLoadResult =
  | { ok: true; config: Hai3Config }
  | { ok: false; error: 'not_found'; message: string }
  | { ok: false; error: 'invalid'; message: string };

/**
 * Generated file output
 */
export interface GeneratedFile {
  path: string;
  content: string;
}
