/**
 * GTS Plugin Implementation
 *
 * Implements TypeSystemPlugin using @globaltypesystem/gts-ts.
 * First-class citizen schemas are registered during plugin construction.
 *
 * GTS-Native Validation Model (named instance pattern):
 * - All runtime entities (schemas AND instances) must be registered with gtsStore
 * - Validation happens on registered instances by their instance ID
 * - Schema IDs end with `~` (e.g., `gts.frontx.mfes.ext.extension.v1~`)
 * - Instance IDs do NOT end with `~` (e.g., `gts.frontx.mfes.ext.extension.v1~acme.widget.v1`)
 * - gts-ts extracts the schema ID from the chained instance ID automatically
 * - No `type` field is needed or supported — the schema is always resolved from the chained ID
 * - gts-ts uses Ajv INTERNALLY - we do NOT need Ajv as a direct dependency
 *
 * @packageDocumentation
 */

import {
  GtsStore,
  createJsonEntity,
  type ValidationResult as GtsValidationResult,
  type JsonEntity,
} from '@globaltypesystem/gts-ts';
import type {
  TypeSystemPlugin,
  ValidationResult,
  JSONSchema,
} from '../types';
import { loadSchemas, loadLifecycleStages, loadBaseActions } from '../../gts/loader';

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
export class GtsPlugin implements TypeSystemPlugin {
  readonly name = 'gts';
  readonly version = '1.0.0';

  private readonly gtsStore: GtsStore;

  constructor() {
    this.gtsStore = new GtsStore();

    // Load and register all first-class citizen schemas from JSON files (13 schemas)
    // These schemas are stored in packages/screensets/src/mfe/gts/frontx.mfe/schemas/
    const schemas = loadSchemas();
    for (const schema of schemas) {
      const entity: JsonEntity = createJsonEntity(schema);
      this.gtsStore.register(entity);
    }

    // Load and register default lifecycle stage instances from JSON files (4 instances)
    // These instances are stored in packages/screensets/src/mfe/gts/frontx.mfe/instances/lifecycle-stages/
    const lifecycleStages = loadLifecycleStages();
    for (const instance of lifecycleStages) {
      const entity: JsonEntity = createJsonEntity(instance);
      this.gtsStore.register(entity);
    }

    // Load and register base action instances from JSON files (3 instances)
    // These instances are stored in packages/screensets/src/mfe/gts/frontx.mfe/instances/ext/
    const baseActions = loadBaseActions();
    for (const action of baseActions) {
      const entity: JsonEntity = createJsonEntity(action);
      this.gtsStore.register(entity);
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

  register(entity: unknown): void {
    // Wrap the entity in a JsonEntity for gts-ts
    // gts-ts requires all entities to be wrapped as JsonEntity
    // For instances, the entity must have an `id` field
    const jsonEntity: JsonEntity = createJsonEntity(entity);
    this.gtsStore.register(jsonEntity);
  }

  // === Validation ===

  validateInstance(instanceId: string): ValidationResult {
    // GtsStore.validateInstance takes the instance ID (NOT schema ID).
    // gts-ts extracts the schema ID from the chained instance ID automatically:
    // - Instance ID: gts.frontx.mfes.ext.extension.v1~acme.widget.v1
    // - Schema ID:   gts.frontx.mfes.ext.extension.v1~ (extracted automatically)
    // All callers must use the named instance pattern (chained GTS IDs only).
    const result: GtsValidationResult = this.gtsStore.validateInstance(instanceId);
    if (result.ok) {
      return {
        valid: result.valid ?? false,
        errors: [],
      };
    }

    return {
      valid: false,
      errors: result.error
        ? [{ path: '', message: result.error, keyword: 'validation' }]
        : [],
    };
  }

  // === Type Hierarchy ===

  isTypeOf(typeId: string, baseTypeId: string): boolean {
    // GTS type derivation: derived types include the base type ID as a prefix
    // e.g., 'gts.frontx.mfes.mfe.entry.v1~acme.corp.mfe.entry_acme.v1~'
    // is derived from 'gts.frontx.mfes.mfe.entry.v1~'
    return typeId.startsWith(baseTypeId) || typeId === baseTypeId;
  }
}

/**
 * GTS plugin singleton instance.
 * All first-class citizen schemas are built-in and ready to use.
 *
 * @example
 * ```typescript
 * import { gtsPlugin, screensetsRegistryFactory } from '@gears-frontx/screensets';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
 *
 * // Use the registry
 * registry.registerDomain(myDomain, containerProvider);
 * ```
 */
export const gtsPlugin: TypeSystemPlugin = new GtsPlugin();
