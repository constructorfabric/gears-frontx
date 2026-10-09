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
 * Realm sharing: every non-isolated instance in a JavaScript realm reads and
 * writes one store pair per compatible copy of this package, so runtimes can
 * rely on each other's registrations.
 *
 * @packageDocumentation
 */

import {
  GtsStore,
  createJsonEntity,
  type JsonEntity,
} from '@globaltypesystem/gts-ts';
import type { TypeSystemPlugin, ValidationResult } from '@gears-frontx/mfes';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_LIFECYCLE_STAGE_INIT,
  FRONTX_LIFECYCLE_STAGE_ACTIVATED,
  FRONTX_LIFECYCLE_STAGE_DEACTIVATED,
  FRONTX_LIFECYCLE_STAGE_DESTROYED,
} from './constants';
import type { JSONSchema } from './types';
import { loadSchemas, loadLifecycleStages } from './loader';
import { deepCopyJson } from './canonical';
import { copyKeyInputs } from './copy-key';
import {
  createPair,
  joinPair,
  obtainSharedPair,
  type StorePair,
  type WriterToken,
} from './store-pair';
import { describeFailure, writeInstance, writeSchema } from './type-store';

/** Options for constructing a provider instance. */
export interface GtsPluginOptions {
  /**
   * Give this instance a private store pair that follows the same write rules
   * and never touches the realm slot. Use it for tests that need to start
   * from the built-in set alone. The default instance is never isolated.
   */
  isolated?: boolean;
}

const createLibraryStore = (): GtsStore => new GtsStore();

/**
 * Concrete GTS plugin class implementing TypeSystemPlugin.
 *
 * Uses @globaltypesystem/gts-ts internally. First-class citizen schemas
 * are registered during construction -- the plugin is ready to use
 * immediately after instantiation.
 *
 * The gtsPlugin singleton constant is the default instance. Instances share
 * one store with every compatible copy in the realm, so a second
 * `new GtsPlugin()` starts from what has already been registered, not from the
 * built-in set. Tests that need a fresh store construct
 * `new GtsPlugin({ isolated: true })`.
 *
 * Production wiring uses the `gtsPlugin` singleton. Construct the class directly
 * only in tests, or when a caller needs a private store.
 */
// @cpt-flow:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1
// @cpt-state:cpt-frontx-state-gts-type-provider-init:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1
export class GtsPlugin implements TypeSystemPlugin<JSONSchema> {
  readonly name = 'gts';
  readonly version = '1.0.0';

  /**
   * Held for the instance's lifetime, but its stores are never kept: another
   * instance on the same pair may replace the scratch store between calls, so
   * every call reads `pair.store` and `pair.scratch` afresh.
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-hold-pair
  private readonly pair: StorePair;
  private readonly token: WriterToken;
  // @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-hold-pair

  constructor(options: GtsPluginOptions = {}) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-load
    const schemas = loadSchemas();
    const lifecycleStages = loadLifecycleStages();
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-load

    const inputs = copyKeyInputs([...schemas, ...lifecycleStages]);
    if (options.isolated) {
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-private
      this.pair = createPair(inputs, createLibraryStore);
      this.token = joinPair(this.pair);
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-private
    } else {
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-shared
      this.pair = obtainSharedPair(globalThis, inputs, createLibraryStore);
      this.token = joinPair(this.pair);
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-shared
    }

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-schemas
    for (const schema of schemas) {
      writeSchema(this.pair, this.token, createJsonEntity(schema));
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-schemas

    // @cpt-begin:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-01
    // Transition: UNINITIALIZED → INFRA_SCHEMAS_REGISTERED (all infra schemas registered)
    // @cpt-end:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-01

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-stages
    for (const instance of lifecycleStages) {
      // A rejected stage aborts construction. The error already names the
      // instance and the reason, and nothing invalid stays in either store.
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-stage-reject
      writeInstance(this.pair, this.token, createJsonEntity(instance));
      // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-stage-reject
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-stages

    // @cpt-begin:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-02
    // Transition: INFRA_SCHEMAS_REGISTERED → READY (all lifecycle instances validated)
    // @cpt-end:cpt-frontx-state-gts-type-provider-init:p1:inst-pi-02

    // @cpt-begin:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-return
    // Provider is now READY with all infrastructure schemas and lifecycle instances registered.
    // @cpt-end:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1:inst-irv2-return

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-01
    // Provider is ready to accept actor-supplied extension type validation requests.
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-01
  }

  // === Schema Registry ===
  // First-class schemas are already registered during construction.
  // registerSchema is for vendor/dynamic schemas only.

  /**
   * Register a type definition. The first definition under an identifier
   * stands: a later one with different content is ignored and reported once
   * through a console warning, and never throws. A changed definition needs a
   * new type identifier.
   *
   * @throws Error if the definition declares no `$schema`, is not
   * representable as JSON, or has no valid type identifier
   */
  registerSchema(schema: JSONSchema): void {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-schema-classify
    const entity: JsonEntity = createJsonEntity(schema);
    if (!entity.isSchema) {
      throw new Error(
        `GTS schema '${entity.id || '(no identifier)'}' refused: a schema must declare $schema naming a JSON Schema meta-schema.`
      );
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-schema-classify
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-schema-write
    writeSchema(this.pair, this.token, entity);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-schema-write
  }

  getSchema(typeId: string): JSONSchema | undefined {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-get-schema
    const entity = this.pair.store.get(typeId);
    if (!entity) return undefined;
    if (!entity.content || typeof entity.content !== 'object') {
      return undefined;
    }
    // A copy for a schema, so a caller's change never reaches the stored definition.
    return entity.isSchema ? deepCopyJson(entity.content) : entity.content;
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-get-schema
  }

  // === Instance Registry (GTS-native approach) ===

  /**
   * Register a GTS instance and validate it against its schema.
   *
   * Schema-vs-instance determination is gts-ts's responsibility (per
   * gts-spec, the authoritative marker is the trailing `~` on the ID, not
   * a `$id` field heuristic). A schema delivered here follows the same rule
   * as one delivered through `registerSchema`, so the outcome never depends
   * on which method a runtime used or on load order.
   *
   * Named instance pattern: the schema is resolved from the chained instance
   * ID automatically (`gts.frontx.mfes.ext.extension.v1~acme.widget.v1` →
   * schema `gts.frontx.mfes.ext.extension.v1~`). For anonymous instances
   * (e.g., action payloads with no `id`), gts-ts uses the `type` field to
   * resolve the schema.
   *
   * Validate-before-persist: `GtsStore` exposes no validate-only call and no
   * call to remove an entity once registered, so a candidate is validated in
   * a scratch store that mirrors the real one and is written to the real
   * store only once it validates clean. A failed call leaves the real store
   * exactly as it was.
   *
   * Instances keep the last write: a valid instance replaces what the store
   * held under its identifier.
   *
   * @param entity - The GTS instance to register and validate
   * @throws Error if schema validation fails
   */
  register(entity: unknown): void {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-synchronous
    // Every store read and write below happens in this call with no await or
    // callback between them, so calls on one pair never interleave.
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-synchronous
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-register-schema
    const jsonEntity: JsonEntity = createJsonEntity(entity);
    if (jsonEntity.isSchema) {
      writeSchema(this.pair, this.token, jsonEntity);
      return;
    }
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-register-schema
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-register-instance
    writeInstance(this.pair, this.token, jsonEntity);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-register-instance
  }

  // @cpt-algo:cpt-frontx-algo-gts-type-provider-schema-validation:p1
  validateInstance(instanceId: string): ValidationResult {
    // Flow: runtime invokes validateInstance for the extension's instance (inst-vt-05)
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-validate
    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-05
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-01
    const result = this.pair.store.validateInstance(instanceId);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-01
    // @cpt-end:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-05
    // @cpt-end:cpt-frontx-algo-gts-type-provider-runtime-registration-v2:p1:inst-rrv2-validate

    // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06
    if (!result.ok) {
      // @cpt-begin:cpt-frontx-flow-gts-type-provider-validate-extension-type:p1:inst-vt-06a
      // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-validation:p1:inst-sv-03
      const unknownTypeResult: ValidationResult = {
        valid: false,
        errors: [{ path: '', message: describeFailure(result.error ?? 'validation failed', this.pair), keyword: 'gts-validation' }],
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
          message: describeFailure(result.error ?? 'validation failed', this.pair),
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

  /**
   * Resolve this plugin's GTS action-type ID for the framework's well-known
   * `load_ext` lifecycle action. Keeps the GTS-notation literal owned here,
   * never in the generic runtime.
   *
   * @returns The GTS action-type ID for `load_ext`
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-04
  resolveLoadExtActionId(): string {
    return FRONTX_ACTION_LOAD_EXT;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-04

  /**
   * Resolve this plugin's GTS action-type ID for the framework's well-known
   * `mount_ext` lifecycle action.
   *
   * @returns The GTS action-type ID for `mount_ext`
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-05
  resolveMountExtActionId(): string {
    return FRONTX_ACTION_MOUNT_EXT;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-05

  /**
   * Resolve this plugin's GTS action-type ID for the framework's well-known
   * `unmount_ext` lifecycle action.
   *
   * @returns The GTS action-type ID for `unmount_ext`
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-06
  resolveUnmountExtActionId(): string {
    return FRONTX_ACTION_UNMOUNT_EXT;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-06

  /**
   * Resolve this plugin's GTS type ID for the framework's well-known `init`
   * lifecycle stage. Keeps the GTS-notation literal owned here, never in the
   * generic runtime.
   *
   * @returns The GTS type ID for the `init` lifecycle stage
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-07
  resolveLifecycleStageInitId(): string {
    return FRONTX_LIFECYCLE_STAGE_INIT;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-07

  /**
   * Resolve this plugin's GTS type ID for the framework's well-known
   * `activated` lifecycle stage.
   *
   * @returns The GTS type ID for the `activated` lifecycle stage
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-08
  resolveLifecycleStageActivatedId(): string {
    return FRONTX_LIFECYCLE_STAGE_ACTIVATED;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-08

  /**
   * Resolve this plugin's GTS type ID for the framework's well-known
   * `deactivated` lifecycle stage.
   *
   * @returns The GTS type ID for the `deactivated` lifecycle stage
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-09
  resolveLifecycleStageDeactivatedId(): string {
    return FRONTX_LIFECYCLE_STAGE_DEACTIVATED;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-09

  /**
   * Resolve this plugin's GTS type ID for the framework's well-known
   * `destroyed` lifecycle stage.
   *
   * @returns The GTS type ID for the `destroyed` lifecycle stage
   */
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-10
  resolveLifecycleStageDestroyedId(): string {
    return FRONTX_LIFECYCLE_STAGE_DESTROYED;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-typof-resolution:p1:inst-tr-10
}

/**
 * GTS plugin singleton instance.
 * All first-class citizen schemas are built-in and ready to use.
 *
 * @example
 * ```typescript
 * import { gtsPlugin } from '@gears-frontx/gts-plugin';
 * import { createMfeRegistryFactory } from '@gears-frontx/mfes';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = createMfeRegistryFactory().build({ typeSystem: gtsPlugin });
 * ```
 */
// @cpt-dod:cpt-frontx-dod-gts-type-provider-infra-schema-ownership:p1
// @cpt-dod:cpt-frontx-dod-gts-type-provider-type-validation:p1
// @cpt-dod:cpt-frontx-dod-gts-type-provider-realm-shared-store:p1
export const gtsPlugin: TypeSystemPlugin<JSONSchema> = new GtsPlugin();
