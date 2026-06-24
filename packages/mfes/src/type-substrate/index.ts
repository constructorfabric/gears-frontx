/**
 * Opaque Type-Substrate Port
 *
 * Defines the `TypeSystemPlugin` port contract for the MFE Runtime.
 * The runtime treats type identifiers as opaque strings and delegates ALL
 * schema registration, instance validation, and type-hierarchy operations
 * to an injected provider through this interface.
 *
 * Boundary invariants enforced by existing CI tooling:
 *   MFES-1 — no type-format literals in the MFE Runtime
 *   MFES-4 — no concrete type-format dependency in the MFE Runtime
 *   MFES-5 — opaque schema surface in the MFE Runtime
 *
 * @packageDocumentation
 */

// @cpt-dod:cpt-frontx-dod-type-substrate-port-port-contract-extraction:p1
// @cpt-dod:cpt-frontx-dod-type-substrate-port-opaque-boundary:p1
// @cpt-dod:cpt-frontx-dod-type-substrate-port-validation-delegation:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-type-system-plugin:p1

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

/**
 * Type System Plugin interface — the opaque type-substrate port.
 *
 * Abstracts type system operations for MFE contracts.
 * The MFE Runtime treats type IDs as OPAQUE STRINGS.
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
 * `JSONSchema`, on purpose: the JSON Schema shape is GTS-specific and
 * must not be the contract's implicit identity.
 *
 * @example
 * ```typescript
 * // The built-in GTS plugin declares its concrete schema shape explicitly
 * class GtsPlugin implements TypeSystemPlugin<JSONSchema> { ... }
 *
 * // A CTI/RAML-based plugin declares its own schema shape
 * interface CtiSchema { cti: string; ... }
 * class CtiPlugin implements TypeSystemPlugin<CtiSchema> { ... }
 * ```
 */
// @cpt-flow:cpt-frontx-flow-type-substrate-port-register-validate:p1
// @cpt-algo:cpt-frontx-algo-type-substrate-port-schema-validation-delegation:p2
// @cpt-algo:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2
// @cpt-state:cpt-frontx-state-type-substrate-port-schema-lifecycle:p2
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
   * Note: First-class citizen schemas are built into the plugin and do not
   * need to be registered. This method is for vendor/dynamic schemas only.
   *
   * @param schema - Schema to register; shape is plugin-defined via `TSchema`
   * @throws Error if the schema lacks the plugin's required type-id field
   */
  // @cpt-begin:cpt-frontx-flow-type-substrate-port-register-validate:p1:inst-port-register
  // @cpt-begin:cpt-frontx-state-type-substrate-port-schema-lifecycle:p2:inst-transition-register
  // @cpt-begin:cpt-frontx-state-type-substrate-port-schema-lifecycle:p2:inst-transition-supersede
  registerSchema(schema: TSchema): void;
  // @cpt-end:cpt-frontx-state-type-substrate-port-schema-lifecycle:p2:inst-transition-supersede
  // @cpt-end:cpt-frontx-state-type-substrate-port-schema-lifecycle:p2:inst-transition-register
  // @cpt-end:cpt-frontx-flow-type-substrate-port-register-validate:p1:inst-port-register

  /**
   * Get the schema registered for a type ID.
   *
   * @param typeId - Type ID identifying the schema (opaque string)
   * @returns Schema in the plugin's `TSchema` shape if found, undefined otherwise
   */
  getSchema(typeId: string): TSchema | undefined;

  // === Instance Registry ===

  /**
   * Register a GTS instance with the type system.
   * The instance is validated against its schema as part of registration;
   * on validation failure `register()` throws before returning.
   *
   * @param entity - The instance to register
   * @throws Error if schema validation fails
   */
  register(entity: unknown): void;

  /**
   * Validate a previously registered instance by its instance ID.
   * For anonymous registrations (e.g. actions), the store key is often `''`.
   */
  // @cpt-begin:cpt-frontx-flow-type-substrate-port-register-validate:p1:inst-delegate-validate
  // @cpt-begin:cpt-frontx-algo-type-substrate-port-schema-validation-delegation:p2:inst-call-validate
  validateInstance(instanceId: string): ValidationResult;
  // @cpt-end:cpt-frontx-algo-type-substrate-port-schema-validation-delegation:p2:inst-call-validate
  // @cpt-end:cpt-frontx-flow-type-substrate-port-register-validate:p1:inst-delegate-validate

  // === Type Hierarchy ===

  /**
   * Check if a type ID is of (or derived from) a base type.
   * Used by MfeHandler.canHandle() for type hierarchy matching.
   *
   * @param typeId - The type ID to check (opaque string)
   * @param baseTypeId - The base type ID to check against (opaque string)
   * @returns true if typeId is the same as or derived from baseTypeId
   */
  // @cpt-begin:cpt-frontx-flow-type-substrate-port-register-validate:p1:inst-delegate-is-type-of
  // @cpt-begin:cpt-frontx-algo-type-substrate-port-schema-validation-delegation:p2:inst-call-is-type-of
  // @cpt-begin:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2:inst-delegate-hierarchy
  isTypeOf(typeId: string, baseTypeId: string): boolean;
  // @cpt-end:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2:inst-delegate-hierarchy
  // @cpt-end:cpt-frontx-algo-type-substrate-port-schema-validation-delegation:p2:inst-call-is-type-of
  // @cpt-end:cpt-frontx-flow-type-substrate-port-register-validate:p1:inst-delegate-is-type-of
}
