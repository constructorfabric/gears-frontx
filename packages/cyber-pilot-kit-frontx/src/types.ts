export interface KitResourceEntry {
  id: string;
  /** Canonical resource taxonomy slot (skill, rule, template, script, ...). */
  kind?: string;
  source: string;
  install_path: string;
  type: 'file' | 'directory';
  user_modifiable?: boolean;
  /** Whether `generate-agents` surfaces this resource to agent hosts. */
  public?: boolean;
  description?: string;
}

export interface KitDefinition {
  slug: string;
  name?: string;
  version: string;
  resources: KitResourceEntry[];
}

/**
 * Canonical Constructor Studio kit manifest (`.cf-studio-kit.toml`). Replaces
 * the legacy Cypilot `manifest.toml` model, which used a single `[manifest]`
 * table plus a flat `[[resources]]` array keyed on `default_path`.
 */
export interface KitManifest {
  manifest_version: string;
  kits: KitDefinition[];
}

export interface ValidationViolation {
  field: string;
  code: string;
  message: string;
}

export type ValidationResult =
  | { status: 'PASS'; violations: [] }
  | { status: 'FAIL'; violations: ValidationViolation[] };

export interface KitRegistration {
  format: string;
  path: string;
  version: string;
  source: string;
}

export interface KitCapability {
  id: string;
  path: string;
  type: 'file' | 'directory';
}

export interface KitSessionResult {
  state: 'PACKAGED' | 'INSTALLED' | 'SESSION_ACTIVE';
  capabilities: KitCapability[];
  errors: string[];
  warnings: string[];
}

/**
 * Reads the actual shipped body text of a declared kit resource
 * (cpt-frontx-adr-solution-ai-content-placement self-validation). For a
 * `directory` resource, returns one string per file found recursively under
 * the resource's source path.
 */
export interface ResourceBodyReader {
  read(entry: KitResourceEntry): string[];
}
