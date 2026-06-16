/**
 * GTS JSON Loaders
 *
 * Utilities for loading GTS entities from JSON files.
 * These functions load schemas and instances from the hai3.mfes package.
 *
 * @packageDocumentation
 */

import type { JSONSchema } from '../plugins/types';
import type { LifecycleStage } from '../types';

// Import all schema JSON files
import entrySchema from './hai3.mfes/schemas/mfe/entry.v1.json';
import domainSchema from './hai3.mfes/schemas/ext/domain.v1.json';
import extensionSchema from './hai3.mfes/schemas/ext/extension.v1.json';
import actionSchema from './hai3.mfes/schemas/comm/action.v1.json';
import actionsChainSchema from './hai3.mfes/schemas/comm/actions_chain.v1.json';
import sharedPropertySchema from './hai3.mfes/schemas/comm/shared_property.v1.json';
import lifecycleStageSchema from './hai3.mfes/schemas/lifecycle/stage.v1.json';
import lifecycleHookSchema from './hai3.mfes/schemas/lifecycle/hook.v1.json';
import manifestSchema from './hai3.mfes/schemas/mfe/mf_manifest.v1.json';
import entryMfSchema from './hai3.mfes/schemas/mfe/entry_mf.v1.json';

// Import action schema JSON files (derived from action.v1, each requires payload.subject)
import loadExtActionSchema from './hai3.mfes/schemas/ext/load_ext.v1.json';
import mountExtActionSchema from './hai3.mfes/schemas/ext/mount_ext.v1.json';
import unmountExtActionSchema from './hai3.mfes/schemas/ext/unmount_ext.v1.json';

// Import lifecycle stage instances
import lifecycleInitInstance from './hai3.mfes/instances/lifecycle/init.v1.json';
import lifecycleActivatedInstance from './hai3.mfes/instances/lifecycle/activated.v1.json';
import lifecycleDeactivatedInstance from './hai3.mfes/instances/lifecycle/deactivated.v1.json';
import lifecycleDestroyedInstance from './hai3.mfes/instances/lifecycle/destroyed.v1.json';

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
