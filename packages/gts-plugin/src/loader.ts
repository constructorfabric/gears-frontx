/**
 * GTS JSON Loaders
 *
 * Utilities for loading GTS entities from JSON files.
 * These functions load schemas and instances from the frontx.mfes package.
 *
 * @packageDocumentation
 */

import type { LifecycleStage } from '@gears-frontx/mfes';
import type { JSONSchema } from './types';

// Import all schema JSON files
import entrySchema from './frontx.mfes/schemas/mfe/entry.v1.json';
import domainSchema from './frontx.mfes/schemas/ext/domain.v1.json';
import extensionSchema from './frontx.mfes/schemas/ext/extension.v1.json';
import actionSchema from './frontx.mfes/schemas/comm/action.v1.json';
import actionsChainSchema from './frontx.mfes/schemas/comm/actions_chain.v1.json';
import sharedPropertySchema from './frontx.mfes/schemas/comm/shared_property.v1.json';
import lifecycleStageSchema from './frontx.mfes/schemas/lifecycle/stage.v1.json';
import lifecycleHookSchema from './frontx.mfes/schemas/lifecycle/hook.v1.json';
import manifestSchema from './frontx.mfes/schemas/mfe/mf_manifest.v1.json';
import entryMfSchema from './frontx.mfes/schemas/mfe/entry_mf.v1.json';

// Import action schema JSON files — each is self-contained and closed, re-declaring
// every property action.v1 would otherwise provide (additionalProperties: false on
// itself and on its own payload); action.v1 itself stays open for derivation.
// mount_ext and unmount_ext also declare the optional history enum (none/replace/push).
import loadExtActionSchema from './frontx.mfes/schemas/ext/load_ext.v1.json';
import mountExtActionSchema from './frontx.mfes/schemas/ext/mount_ext.v1.json';
import unmountExtActionSchema from './frontx.mfes/schemas/ext/unmount_ext.v1.json';

// Import lifecycle stage instances
import lifecycleInitInstance from './frontx.mfes/instances/lifecycle/init.v1.json';
import lifecycleActivatedInstance from './frontx.mfes/instances/lifecycle/activated.v1.json';
import lifecycleDeactivatedInstance from './frontx.mfes/instances/lifecycle/deactivated.v1.json';
import lifecycleDestroyedInstance from './frontx.mfes/instances/lifecycle/destroyed.v1.json';

/**
 * Load all core MFE schema JSON files.
 * Returns 13 schemas: the 4 abstract base types, then the 9 final types.
 *
 * Application-specific derived schemas (e.g. theme, language, extension_screen)
 * are not part of this set; the application registers them with its own type
 * system instance.
 *
 * @returns Array of JSON schemas for core MFE types
 */
// @cpt-algo:cpt-frontx-algo-gts-type-provider-infra-registration-v2:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-type-closure:p1
// @cpt-dod:cpt-frontx-dod-gts-type-provider-closed-types:p1
export function loadSchemas(): JSONSchema[] {
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-kinds
  return [
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-abstract-open
    // Abstract base types: open for derivation, no closure keyword at their top level.
    entrySchema as JSONSchema,
    extensionSchema as JSONSchema,
    actionSchema as JSONSchema,
    sharedPropertySchema as JSONSchema,
    // @cpt-end:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-abstract-open
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-final-closed
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-nested-closed
    // Final types: each closes at its top level with `unevaluatedProperties: false`.
    // Their inline objects are closed in the same files; a `$ref` to a final type is
    // closed by that type, one to an abstract base stays open.
    domainSchema as JSONSchema,
    actionsChainSchema as JSONSchema,
    lifecycleStageSchema as JSONSchema,
    lifecycleHookSchema as JSONSchema,
    loadExtActionSchema as JSONSchema,
    mountExtActionSchema as JSONSchema,
    unmountExtActionSchema as JSONSchema,
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-final
    // The closed manifest and MFE entry contracts, as final types.
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-manifest-fields
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-formats
    manifestSchema as JSONSchema,
    // @cpt-end:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-formats
    // @cpt-end:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-manifest-fields
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-entry-fields
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-manifest-ref
    entryMfSchema as JSONSchema,
    // @cpt-end:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-manifest-ref
    // @cpt-end:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-entry-fields
    // @cpt-end:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1:inst-me-final
    // @cpt-end:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-nested-closed
    // @cpt-end:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-final-closed
  ];
  // @cpt-end:cpt-frontx-algo-gts-type-provider-type-closure:p1:inst-tc-kinds
}

/**
 * Load default lifecycle stage instances.
 * These are the 4 default lifecycle stages: init, activated, deactivated, destroyed.
 *
 * @returns Array of lifecycle stage instances
 */
export function loadLifecycleStages(): LifecycleStage[] {
  return [
    lifecycleInitInstance,
    lifecycleActivatedInstance,
    lifecycleDeactivatedInstance,
    lifecycleDestroyedInstance,
  ] as LifecycleStage[];
}
