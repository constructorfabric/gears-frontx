/**
 * GTS Plugin Implementation
 *
 * Implements TypeSystemPlugin using @globaltypesystem/gts-ts.
 * First-class citizen schemas are registered during plugin construction.
 *
 * GTS-Native Validation Model (named instance pattern):
 * - Schemas are registered via `registerSchema()` — they define types.
 *   Schema IDs end with `~` (e.g., `gts.hai3.mfes.ext.extension.v1~`).
 * - Instances are registered via `register()` — they are values of some type.
 *   Instance IDs do NOT end with `~` (e.g., `gts.hai3.mfes.ext.extension.v1~acme.widget.v1`).
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
import type { TypeSystemPlugin, JSONSchema, ValidationResult } from '../types';
import { loadSchemas, loadLifecycleStages } from '../../gts/loader';

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
export class GtsPlugin implements TypeSystemPlugin<JSONSchema> {
  readonly name = 'gts';
  readonly version = '1.0.0';

  private readonly gtsStore: GtsStore;

  constructor() {
    this.gtsStore = new GtsStore();

    // Load and register all first-class citizen schemas from JSON files
    // 13 schemas total: 8 core + 2 MF-specific + 3 extension action schemas
    // These schemas are stored in packages/screensets/src/mfe/gts/hai3.mfes/schemas/
    const schemas = loadSchemas();
    for (const schema of schemas) {
      const entity: JsonEntity = createJsonEntity(schema);
      this.gtsStore.register(entity);
    }

    // Load and register default lifecycle stage instances from JSON files (4 instances)
    // These instances are stored in packages/screensets/src/mfe/gts/hai3.mfe/instances/lifecycle-stages/
    const lifecycleStages = loadLifecycleStages();
    for (const instance of lifecycleStages) {
      const entity: JsonEntity = createJsonEntity(instance);
      this.gtsStore.register(entity);
    }

    // Validate all registered lifecycle stage instances against their schemas
    for (const instance of lifecycleStages) {
      const result = this.gtsStore.validateInstance(instance.id);
      if (!result.ok || !result.valid) {
        throw new Error(
          `GTS validation failed for lifecycle stage '${instance.id}': ${result.error ?? 'invalid'}`
        );
      }
    }

  }

  // === Schema Registry ===
  // First-class schemas are already registered during construction.
  // registerSchema is for vendor/dynamic schemas only.

  registerSchema(schema: JSONSchema): void {
    const entity: JsonEntity = createJsonEntity(schema);
    this.gtsStore.register(entity);
  }

  getSchema(typeId: string): JSONSchema | undefined {
    // GtsStore.get() returns JsonEntity | undefined
    const entity = this.gtsStore.get(typeId);
    if (!entity) return undefined;
    // JsonEntity.content contains the actual schema/instance data
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
   * ID automatically (`gts.hai3.mfes.ext.extension.v1~acme.widget.v1` →
   * schema `gts.hai3.mfes.ext.extension.v1~`). For anonymous instances
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

  validateInstance(instanceId: string): ValidationResult {
    const result = this.gtsStore.validateInstance(instanceId);
    if (result.ok && result.valid) {
      return { valid: true, errors: [] };
    }
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: result.error ?? 'validation failed',
          keyword: 'gts-validation',
        },
      ],
    };
  }

  // === Type Hierarchy ===

  isTypeOf(typeId: string, baseTypeId: string): boolean {
    // GTS type derivation: derived types include the base type ID as a prefix
    // e.g., 'gts.hai3.mfes.mfe.entry.v1~acme.corp.mfe.entry_acme.v1~'
    // is derived from 'gts.hai3.mfes.mfe.entry.v1~'
    return typeId.startsWith(baseTypeId) || typeId === baseTypeId;
  }
}

/**
 * GTS plugin singleton instance.
 * All first-class citizen schemas are built-in and ready to use.
 *
 * @example
 * ```typescript
 * import { gtsPlugin, mfeRegistryFactory } from '@gears-frontx/screensets';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = mfeRegistryFactory.build({ typeSystem: gtsPlugin });
 *
 * // Use the registry
 * registry.registerDomain(myDomain, containerProvider);
 * ```
 */
export const gtsPlugin: TypeSystemPlugin<JSONSchema> = new GtsPlugin();
