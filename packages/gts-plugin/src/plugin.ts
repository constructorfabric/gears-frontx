/**
 * GTS Plugin Implementation
 *
 * Implements TypeSystemPlugin using @globaltypesystem/gts-ts.
 * First-class citizen schemas are registered during plugin construction.
 *
 * GTS-Native Validation Model (named instance pattern):
 * - Schemas are registered via `registerSchema()` — they define types.
 *   Schema IDs end with `~` (e.g., `gts.frontx.mfes.ext.extension.v1~`).
 * - Instances are registered via `register()` — they are values of some type.
 *   Instance IDs do NOT end with `~` (e.g., `gts.frontx.mfes.ext.extension.v1~acme.widget.v1`).
 * - `register()` validates the instance against its schema automatically and
 *   throws on failure. Invalid instances are never visible to lookups — the
 *   type system is the authority on correctness.
 * - For the anonymous instance pattern (no `id` field, schema resolved via
 *   `type` field — used by action payloads), gts-ts assigns `id = ''` and
 *   validation happens against the schema referenced by `type`.
 * - gts-ts uses Ajv INTERNALLY — we do NOT need Ajv as a direct dependency.
 *
 * @packageDocumentation
 */

import {
  GtsStore,
  createJsonEntity,
  type JsonEntity,
} from '@globaltypesystem/gts-ts';
import type { TypeSystemPlugin, ValidationResult } from '@gears-frontx/mfes';
import type { JSONSchema } from './types';
import { loadSchemas, loadLifecycleStages } from './loader';

/**
 * Concrete GTS plugin class implementing TypeSystemPlugin.
 *
 * Uses @globaltypesystem/gts-ts internally. First-class citizen schemas
 * are registered during construction -- the plugin is ready to use
 * immediately after instantiation.
 *
 * The gtsPlugin singleton constant is the only public instance.
 * Tests that need multiple isolated instances should construct new GtsPlugin() directly.
 *
 * @internal - Exported only for test usage. External code should use gtsPlugin singleton.
 */
// @cpt-flow:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1
// @cpt-state:cpt-frontx-state-gts-type-provider-init:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-infra-registration:p1
export class GtsPlugin implements TypeSystemPlugin<JSONSchema> {
  readonly name = 'gts';
  readonly version = '1.0.0';

  private readonly gtsStore: GtsStore;

  constructor() {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-01
    this.gtsStore = new GtsStore();
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-01

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-02
    const schemas = loadSchemas();
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-02

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-03
    for (const schema of schemas) {
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-03a
      const entity: JsonEntity = createJsonEntity(schema);
      this.gtsStore.register(entity);
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-03a
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-03

    // @cpt-begin:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-01
    // Transition: UNINITIALIZED → INFRA_SCHEMAS_REGISTERED (all infra schemas registered)
    // @cpt-end:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-01

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-04
    const lifecycleStages = loadLifecycleStages();
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-04

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-05
    for (const instance of lifecycleStages) {
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-05a
      const entity: JsonEntity = createJsonEntity(instance);
      this.gtsStore.register(entity);
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-05a
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-05

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06
    for (const instance of lifecycleStages) {
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06a
      const result = this.gtsStore.validateInstance(instance.id);
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06a
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06b
      if (!result.ok || !result.valid) {
        // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06b1
        throw new Error(
          `GTS validation failed for lifecycle stage '${instance.id}': ${result.error ?? 'invalid'}`
        );
        // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06b1
      }
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06b
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-06

    // @cpt-begin:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-02
    // Transition: INFRA_SCHEMAS_REGISTERED → READY (all lifecycle instances validated)
    // @cpt-end:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-02

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-07
    // Provider is now READY with all infrastructure schemas and lifecycle instances registered.
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration:p1:inst-ir-07

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-01
    // Provider is ready to accept actor-supplied extension type validation requests.
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-01
  }

  // === Schema Registry ===
  // First-class schemas are already registered during construction.
  // registerSchema is for vendor/dynamic schemas only.

  registerSchema(schema: JSONSchema): void {
    const entity: JsonEntity = createJsonEntity(schema);
    this.gtsStore.register(entity);
  }

  getSchema(typeId: string): JSONSchema | undefined {
    const entity = this.gtsStore.get(typeId);
    if (!entity) return undefined;
    if (!entity.content || typeof entity.content !== 'object') {
      return undefined;
    }
    return entity.content as JSONSchema;
  }

  // === Instance Registry (GTS-native approach) ===

  /**
   * Register a GTS instance and validate it against its schema.
   *
   * Schema-vs-instance determination is gts-ts's responsibility (per
   * gts-spec, the authoritative marker is the trailing `~` on the ID, not
   * a `$id` field heuristic). This method delegates to `gts-ts` unchanged:
   * whatever `gts-ts` accepts is accepted, whatever it rejects is rejected.
   *
   * Named instance pattern: the schema is resolved from the chained instance
   * ID automatically (`gts.frontx.mfes.ext.extension.v1~acme.widget.v1` →
   * schema `gts.frontx.mfes.ext.extension.v1~`). For anonymous instances
   * (e.g., action payloads with no `id`), gts-ts uses the `type` field to
   * resolve the schema.
   *
   * On schema validation failure `register()` throws. The underlying gts-ts
   * store writes the entity before the validation step runs, so an invalid
   * instance may transiently occupy the store; the throw prevents any caller
   * code from proceeding, and a subsequent successful `register()` with the
   * same deterministic id supersedes it. Callers that catch and continue
   * MUST NOT rely on prior registration state.
   *
   * @param entity - The GTS instance to register and validate
   * @throws Error if schema validation fails
   */
  register(entity: unknown): void {
    const jsonEntity: JsonEntity = createJsonEntity(entity);
    this.gtsStore.register(jsonEntity);
    const result = this.gtsStore.validateInstance(jsonEntity.id);
    if (!result.ok || !result.valid) {
      const reason = result.ok
        ? 'schema validation returned invalid'
        : (result.error ?? 'unknown validation error');
      const schema = jsonEntity.schemaId ? this.getSchema(jsonEntity.schemaId) : undefined;
      throw new Error(
        `GTS validation failed for instance '${jsonEntity.id || '(anonymous)'}'\n` +
          `Reason: ${reason}\n` +
          `Instance: ${JSON.stringify(entity, null, 2)}\n` +
          `Schema: ${schema ? JSON.stringify(schema, null, 2) : '(schema not resolved)'}`
      );
    }
  }

  // @cpt-algo:cpt-frontx-algo-gts-type-provider-schema-validation:p1
  validateInstance(instanceId: string): ValidationResult {
    // Flow: runtime invokes validateInstance for the extension's instance (inst-vt-05)
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-05
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-01
    const result = this.gtsStore.validateInstance(instanceId);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-01
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-05

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06
    if (!result.ok) {
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06a
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-03
      const unknownTypeResult: ValidationResult = {
        valid: false,
        errors: [{ path: '', message: result.error ?? 'validation failed', keyword: 'gts-validation' }],
      };
      // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-03
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06a
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06b
      // Provider returns unknown-type failure → runtime rejects extension (handled by caller)
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06b
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06c
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-04
      return unknownTypeResult;
      // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-04
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06c
    }
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-07
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-02
    if (result.ok && result.valid) {
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-09
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-10
      // Provider returns success; runtime proceeds to admit extension (inst-vt-10 outcome)
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-10
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-11
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-02a
      return { valid: true, errors: [] };
      // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-02a
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-11
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-09
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-02
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-07

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08a
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-03
    const failureResult: ValidationResult = {
      valid: false,
      errors: [
        {
          path: '',
          message: result.error ?? 'validation failed',
          keyword: 'gts-validation',
        },
      ],
    };
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-03
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08a

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08b
    // Provider returns failure; runtime rejects extension with reported errors (handled by caller)
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08b
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08c
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-04
    return failureResult;
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-04
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08c
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-08
  }

  // === Type Hierarchy ===

  // @cpt-algo:cpt-frontx-algo-gts-type-provider-typof-resolution:p1
  isTypeOf(typeId: string, baseTypeId: string): boolean {
    // Flow: runtime invokes isTypeOf — provider applies GTS prefix-matching (inst-vt-02, vt-03)
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-02
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-03
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-01
    // GTS derivation rule: a derived type ID always starts with its base type ID.
    // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-01
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-03
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-02

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-02
    if (typeId === baseTypeId || typeId.startsWith(baseTypeId)) {
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04a
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-02a
      return true; // provider returns positive derivation; runtime will admit the type (inst-vt-10)
      // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-02a
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04a
      // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04
    }

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04b
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04c
    // Provider returns false → runtime will reject with type-mismatch (handled by caller)
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04c
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-04b
    // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-02

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-03
    return false;
    // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-03
  }
}

/**
 * GTS plugin singleton instance.
 * All first-class citizen schemas are built-in and ready to use.
 *
 * @example
 * ```typescript
 * import { gtsPlugin } from '@gears-frontx/gts-plugin';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = mfeRegistryFactory.build({ typeSystem: gtsPlugin });
 * ```
 */
// @cpt-dod:cpt-frontx-dod-gts-type-provider-infra-schema-ownership:p1
// @cpt-dod:cpt-frontx-dod-gts-type-provider-type-validation:p1
export const gtsPlugin: TypeSystemPlugin<JSONSchema> = new GtsPlugin();
