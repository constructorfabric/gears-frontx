// @cpt-dod:cpt-frontx-dod-framework-composition-mfe-plugin:p1

/**
 * Base ExtensionDomain Constants (Framework L2)
 *
 * Defines the 4 well-known extension domains as constant objects satisfying
 * the ExtensionDomain interface. These constants are used by the host
 * application to register domains via registerDomain() without hand-authoring
 * JSON.
 *
 * Relationship to string constants:
 * - FRONTX_SCREEN_DOMAIN, FRONTX_SIDEBAR_DOMAIN, etc. (in constants.ts) are
 *   domain ID strings used as action targets in executeActionsChain() calls.
 * - screenDomain, sidebarDomain, etc. (here) are full ExtensionDomain objects
 *   whose .id fields reference the same domain ID strings.
 * - Consumers use FRONTX_SCREEN_DOMAIN for action targets and screenDomain
 *   for registerDomain().
 *
 * Domain Action Support Matrix (from mfe-ext-lifecycle-actions.md):
 * - screen: 2 actions (load_ext, mount_ext) -- NO unmount_ext (swap semantics)
 * - sidebar/popup/overlay: 3 actions (load_ext, mount_ext, unmount_ext) -- toggle semantics
 *
 * @packageDocumentation
 */

import type { ExtensionDomain } from '@gears-frontx/screensets';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SCREEN_EXTENSION_TYPE,
} from '@gears-frontx/screensets';
import {
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_POPUP_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
} from './constants';

/**
 * Init-only lifecycle stage (1 stage).
 * Used by the screen domain, which is a permanent fixture: always visible,
 * never destroyed during the application lifespan. It is initialized once
 * at app startup and remains alive until the app itself is torn down.
 */
const INIT_ONLY_LIFECYCLE_STAGES: readonly string[] = [
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
];

/**
 * Default lifecycle stage instance IDs (4 stages).
 * Used by sidebar, popup, and overlay domains which can be
 * shown/hidden/destroyed during the application lifespan.
 */
const DEFAULT_LIFECYCLE_STAGES: readonly string[] = [
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
  'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
];

/**
 * Screen domain constant.
 *
 * Extension domain for main content area screens.
 * Uses swap semantics: mounting a new screen implicitly unmounts the previous one.
 * Actions: load_ext, mount_ext (NO unmount_ext).
 * Extensions must use extension_screen.v1~ derived type (adds presentation metadata).
 *
 * lifecycleStages: [init] only. The screen domain is a permanent fixture --
 * always visible, never destroyed during the application lifespan. Extensions
 * within the screen domain still go through all 4 stages (extensionsLifecycleStages).
 */
// @cpt-begin:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1
export const screenDomain: ExtensionDomain = {
  id: FRONTX_SCREEN_DOMAIN,
  actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT],
  extensionsActions: [],
  sharedProperties: [FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE],
  defaultActionTimeout: 30000,
  lifecycleStages: [...INIT_ONLY_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsTypeId: FRONTX_SCREEN_EXTENSION_TYPE,
  lifecycle: undefined,
};

/**
 * Sidebar domain constant.
 *
 * Extension domain for collapsible side panels.
 * Uses toggle semantics: extensions can be explicitly mounted and unmounted.
 * 3 actions: load_ext, mount_ext, unmount_ext.
 */
export const sidebarDomain: ExtensionDomain = {
  id: FRONTX_SIDEBAR_DOMAIN,
  actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  sharedProperties: [FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE],
  defaultActionTimeout: 30000,
  lifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  lifecycle: undefined,
};

/**
 * Popup domain constant.
 *
 * Extension domain for popup/modal dialogs.
 * Uses toggle semantics: extensions can be explicitly mounted and unmounted.
 * 3 actions: load_ext, mount_ext, unmount_ext.
 */
export const popupDomain: ExtensionDomain = {
  id: FRONTX_POPUP_DOMAIN,
  actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  sharedProperties: [FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE],
  defaultActionTimeout: 30000,
  lifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  lifecycle: undefined,
};

/**
 * Overlay domain constant.
 *
 * Extension domain for full-screen overlays.
 * Uses toggle semantics: extensions can be explicitly mounted and unmounted.
 * 3 actions: load_ext, mount_ext, unmount_ext.
 */
export const overlayDomain: ExtensionDomain = {
  id: FRONTX_OVERLAY_DOMAIN,
  actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  sharedProperties: [FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE],
  defaultActionTimeout: 30000,
  lifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  lifecycle: undefined,
};
// @cpt-end:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1
