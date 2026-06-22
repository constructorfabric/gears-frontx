/**
 * Type System Plugin for MFE contracts
 *
 * The @gears-frontx/screensets package treats type IDs as OPAQUE STRINGS.
 * All type ID understanding (parsing, format validation, building) is delegated to the plugin.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-type-system-plugin:p1

/**
 * JSON Schema type (simplified for type system plugin interface)
 */
/**
 * Single validation issue from {@link TypeSystemPlugin.validateInstance}.
 */
export interface ValidationErrorItem {
  path: string;
  message: string;
  keyword?: string;
}

/**
 * Result of validating a registered instance by ID.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorItem[];
}

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
 * Type System Plugin interface
 *
 * Abstracts type system operations for MFE contracts.
 * The screensets package treats type IDs as OPAQUE STRINGS.
 * All type ID understanding is delegated to the plugin.
 *
 * Generic over `TSchema` — the schema shape the plugin accepts and returns.
 * Concrete plugins state their own shape: the built-in GTS plugin is
 * `TypeSystemPlugin<JSONSchema>`; a CTI/RAML-based plugin would be
 * `TypeSystemPlugin<CtiSchema>`.
 *
 * TEMPORARY DEFAULT: `TSchema` defaults to `unknown` to keep this change
 * minimal and non-breaking — many schema-agnostic consumers (registry,
 * mediator, config, framework wiring, @gears-frontx/react bindings) spell
 * `TypeSystemPlugin` with no type argument. A deliberate stopgap ahead of the
 * in-flight template/framework separation, to be removed/updated there so
 * every consumer states its schema shape explicitly. It is `unknown`, NOT
 * {@link JSONSchema}, on purpose: the JSON Schema shape is GTS-specific and
 * must not be the contract's implicit identity.
 *
 * @example
 * ```typescript
 * // The built-in GTS plugin declares the JSON Schema shape explicitly
 * class GtsPlugin implements TypeSystemPlugin<JSONSchema> { ... }
 *
 * // A CTI/RAML-based plugin declares its own schema shape
 * interface CtiSchema { cti: string; ... }                  // RAML-shaped
 * class CtiPlugin implements TypeSystemPlugin<CtiSchema> { ... }
 * ```
 */
export interface TypeSystemPlugin<TSchema = unknown> {
  /** Plugin identifier */
  readonly name: string;

  /** Plugin version */
  readonly version: string;

  // === Schema Registry ===

  /**
   * Register a schema for validation.
   * The type ID is extracted from the schema in a plugin-specific way
   * (for the GTS plugin's JSON Schema shape, from the `$id` field).
   *
   * Note: First-class citizen schemas (MfeEntry, ExtensionDomain, Extension,
   * SharedProperty, Action, ActionsChain, LifecycleStage, LifecycleHook,
   * MfManifest, MfeEntryMF) are built into the plugin and do not need
   * to be registered. This method is for vendor/dynamic schemas only.
   *
   * @param schema - Schema to register; shape is plugin-defined via the
   *   `TSchema` generic parameter (e.g. {@link JSONSchema} for the GTS plugin)
   * @throws Error if the schema lacks the plugin's required type-id field
   */
  registerSchema(schema: TSchema): void;

  /**
   * Get the schema registered for a type ID.
   *
   * @param typeId - Type ID identifying the schema
   * @returns Schema in the plugin's `TSchema` shape if found, undefined otherwise
   */
  getSchema(typeId: string): TSchema | undefined;

  // === Instance Registry (GTS-Native Approach) ===

  /**
   * Register a GTS instance with the type system. The instance is validated
   * against its schema as part of registration; on validation failure
   * `register()` throws before returning, and the caller cannot rely on the
   * entity having been accepted. Implementations MAY persist the instance in
   * the underlying store before validating (gts-ts does); the throw is the
   * authoritative signal that the instance is unusable, and a subsequent
   * successful `register()` with the same deterministic id supersedes it.
   *
   * Named instance pattern: the schema is resolved from the chained instance
   * ID automatically.
   * - Example: `{ id: "gts.frontx.mfes.ext.extension.v1~acme.widget.v1", ... }`
   * - Schema resolved: `gts.frontx.mfes.ext.extension.v1~`
   *
   * For ephemeral runtime validation (e.g., shared property values), construct
   * a chained instance ID that encodes the schema:
   * - Example: `{ id: "${propertyTypeId}frontx.mfes.comm.runtime.v1", value: "dark" }`
   * - Schema resolved: `${propertyTypeId}` (the derived shared property schema)
   *
   * For anonymous instances (no `id` field — used by action payloads), the
   * schema reference comes from the `type` field.
   *
   * Schema-vs-instance determination is the type system's responsibility
   * (per gts-spec, the authoritative marker is the trailing `~` on the
   * identifier). This interface does not impose a plugin-layer check;
   * implementations delegate the decision to `gts-ts` unchanged.
   *
   * @param entity - The GTS instance to register; use `registerSchema()`
   *   for schemas
   * @throws Error if schema validation fails. The error message includes
   *   the instance ID, the instance JSON, the resolved schema JSON, and
   *   the validation reason.
   */
  register(entity: unknown): void;

  /**
   * Validate a previously registered instance by its GTS instance ID.
   * For anonymous registrations (e.g. actions), the store key is often `''`.
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
