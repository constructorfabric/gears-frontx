/**
 * GTS Well-Known Lifecycle Identifiers
 *
 * Concrete GTS-notation type IDs for the MFE Runtime's well-known
 * lifecycle concepts — the framework's mount/unmount/load actions and the
 * four lifecycle stages fired by the runtime on domains and extensions
 * (init, activated, deactivated, destroyed). Owned exclusively by this
 * plugin — the generic runtime never spells these literals; it asks the
 * injected `TypeSystemPlugin` to resolve them via
 * `resolveLoadExtActionId()` / `resolveMountExtActionId()` /
 * `resolveUnmountExtActionId()` for actions, and
 * `resolveLifecycleStageInitId()` / `resolveLifecycleStageActivatedId()` /
 * `resolveLifecycleStageDeactivatedId()` / `resolveLifecycleStageDestroyedId()`
 * for stages. Resolving both families through the port keeps the runtime
 * type-format-agnostic: a non-GTS consumer that registers stages in its own
 * notation is matched correctly instead of being silently bypassed.
 *
 * @packageDocumentation
 */

export const FRONTX_ACTION_LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~';
export const FRONTX_ACTION_MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
export const FRONTX_ACTION_UNMOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';

/**
 * GTS-notation type IDs for the four well-known lifecycle stages the
 * runtime fires (init/activated/deactivated/destroyed). The stage family
 * lives under `gts.frontx.mfes.lifecycle.stage.v1~`, distinct from the
 * action family under `gts.frontx.mfes.comm.action.v1~`.
 */
export const FRONTX_LIFECYCLE_STAGE_INIT =
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1';
export const FRONTX_LIFECYCLE_STAGE_ACTIVATED =
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1';
export const FRONTX_LIFECYCLE_STAGE_DEACTIVATED =
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1';
export const FRONTX_LIFECYCLE_STAGE_DESTROYED =
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1';

/**
 * Pattern matching every shared-property value: an instance of the shared
 * property type. Kept here with the other GTS literals this package owns, and
 * matched through the GTS library, never by string prefix.
 */
export const FRONTX_SHARED_PROPERTY_PATTERN = 'gts.frontx.mfes.comm.shared_property.v1~*';
