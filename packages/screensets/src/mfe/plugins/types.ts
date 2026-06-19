/**
 * Type System Plugin for MFE contracts
 *
 * The @gears-frontx/screensets package treats type IDs as OPAQUE STRINGS.
 * All type ID understanding (parsing, format validation, building) is delegated to the plugin.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-hai3-dod-screenset-registry-type-system-plugin:p1

/**
 * JSON Schema type (simplified for type system plugin interface)
 */
export interface JSONSchema {
  $id?: string;
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  $ref?: string;
  items?: JSONSchema | JSONSchema[];
  [key: string]: unknown;
}

/**
 * Single validation error
 */
export interface ValidationError {
  /** Path to the property that failed validation */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Schema keyword that caused the error */
  keyword: string;
}

/**
 * Result of schema validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: ValidationError[];
}

/**
 * Type System Plugin interface
 *
 * Abstracts type system operations for MFE contracts.
 * The screensets package treats type IDs as OPAQUE STRINGS.
 * All type ID understanding is delegated to the plugin.
 *
 * @example
 * ```typescript
 * // Using the GTS plugin (default)
 * import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
 *
 * const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
 * registry.registerDomain(myDomain, containerProvider);
 * ```
 */
export interface TypeSystemPlugin {
  /** Plugin identifier */
  readonly name: string;

  /** Plugin version */
  readonly version: string;

  // === Schema Registry ===

  /**
   * Register a JSON Schema for validation.
   * The type ID is extracted from the schema's $id field.
   *
   * Note: First-class citizen schemas (MfeEntry, ExtensionDomain, Extension,
   * SharedProperty, Action, ActionsChain, LifecycleStage, LifecycleHook,
   * MfManifest, MfeEntryMF) are built into the plugin and do not need
   * to be registered. This method is for vendor/dynamic schemas only.
   *
   * @param schema - JSON Schema to register
   * @throws Error if schema does not have a $id field
   */
  registerSchema(schema: JSONSchema): void;

  /**
   * Get the schema registered for a type ID.
   *
   * @param typeId - Type ID identifying the schema
   * @returns JSON Schema if found, undefined otherwise
   */
  getSchema(typeId: string): JSONSchema | undefined;

  // === Instance Registry (GTS-Native Approach) ===

  /**
   * Register any GTS entity (schema or instance) with the type system.
   * For instances, the entity must have an `id` field containing the instance ID.
   *
   * All instances use the **named instance pattern** — the schema is extracted from
   * the chained instance ID automatically. No explicit `type` field is needed or supported.
   *
   * - Example: `{ id: "gts.frontx.mfes.ext.extension.v1~acme.widget.v1", ... }`
   * - Schema resolved: `gts.frontx.mfes.ext.extension.v1~`
   *
   * For ephemeral runtime validation (e.g., shared property values), construct a
   * chained instance ID that encodes the schema:
   * - Example: `{ id: "${propertyTypeId}frontx.mfes.comm.runtime.v1", value: "dark" }`
   * - Schema resolved: `${propertyTypeId}` (the derived shared property schema)
   *
   * @param entity - The GTS entity to register (must have an `id` field)
   */
  register(entity: unknown): void;

  /**
   * Validate a registered instance by its instance ID.
   * The instance must be registered first via register().
   *
   * gts-ts extracts the schema from the chained instance ID automatically
   * (named instance pattern — see register() for details):
   * - Instance ID: `gts.frontx.mfes.ext.extension.v1~acme.widget.v1`
   * - Schema ID:   `gts.frontx.mfes.ext.extension.v1~`
   *
   * @param instanceId - The instance ID (does NOT end with ~)
   * @returns Validation result
   */
  validateInstance(instanceId: string): ValidationResult;

  // === Type Hierarchy ===

  /**
   * Check if a type ID is of (or derived from) a base type.
   * Used by MfeHandler.canHandle() for type hierarchy matching.
   *
   * @param typeId - The type ID to check
   * @param baseTypeId - The base type ID to check against
   * @returns true if typeId is the same as or derived from baseTypeId
   */
  isTypeOf(typeId: string, baseTypeId: string): boolean;
}
