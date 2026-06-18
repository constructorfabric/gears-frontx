/**
 * GTS JSON Loaders
 *
 * Utilities for loading GTS entities from JSON files.
 * These functions load schemas and instances from the frontx.mfes package.
 *
 * @packageDocumentation
 */

import type { JSONSchema } from '../plugins/types';
import type { LifecycleStage, Action } from '../types';

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

// Import lifecycle stage instances
import lifecycleInitInstance from './frontx.mfes/instances/lifecycle/init.v1.json';
import lifecycleActivatedInstance from './frontx.mfes/instances/lifecycle/activated.v1.json';
import lifecycleDeactivatedInstance from './frontx.mfes/instances/lifecycle/deactivated.v1.json';
import lifecycleDestroyedInstance from './frontx.mfes/instances/lifecycle/destroyed.v1.json';

// Import action instances
import loadExtActionInstance from './frontx.mfes/instances/ext/load_ext.v1.json';
import mountExtActionInstance from './frontx.mfes/instances/ext/mount_ext.v1.json';
import unmountExtActionInstance from './frontx.mfes/instances/ext/unmount_ext.v1.json';

/**
 * Load all core MFE schema JSON files.
 * These are the 10 core schemas (8 core + 2 MF-specific).
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

/**
 * Load base action instances.
 * These are the generic extension lifecycle actions used by all domains.
 *
 * @returns Array of action instances
 */
export function loadBaseActions(): Action[] {
  return [
    loadExtActionInstance,
    mountExtActionInstance,
    unmountExtActionInstance,
  ] as Action[];
}
