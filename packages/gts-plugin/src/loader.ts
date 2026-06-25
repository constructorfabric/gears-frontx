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

// Import action schema JSON files (derived from action.v1, each requires payload.subject)
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
 * Returns 13 schemas: 8 core + 2 MF-specific + 3 extension action schemas.
 *
 * Application-specific derived schemas (theme, language, extension_screen) are
 * registered at the application layer via @gears-frontx/framework.
 *
 * @returns Array of JSON schemas for core MFE types
 */
export function loadSchemas(): JSONSchema[] {
  return [
    // Core types (8)
    entrySchema as JSONSchema,
    domainSchema as JSONSchema,
    extensionSchema as JSONSchema,
    actionSchema as JSONSchema,
    actionsChainSchema as JSONSchema,
    sharedPropertySchema as JSONSchema,
    lifecycleStageSchema as JSONSchema,
    lifecycleHookSchema as JSONSchema,
    // MF-specific types (2)
    manifestSchema as JSONSchema,
    entryMfSchema as JSONSchema,
    // Extension action schemas (3) — derived from action.v1, require payload.subject
    loadExtActionSchema as JSONSchema,
    mountExtActionSchema as JSONSchema,
    unmountExtActionSchema as JSONSchema,
  ];
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
