/**
 * Extension IDs from mfe.json
 * Centralized constants for cross-screen navigation references
 */

export const HELLOWORLD_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1';
export const PROFILE_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.profile.v1';
export const THEME_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.theme.v1';
export const UIKIT_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.uikit.v1';

/**
 * Custom action type for requesting a profile data refresh.
 * Targeted at the Profile extension ID — routed by the mediator to its registered ActionHandler.
 */
// @cpt-FEATURE:child-bridge-action-handler:p3
export const DEMO_ACTION_REFRESH_PROFILE = 'gts.frontx.mfes.comm.action.v1~frontx.demo.action.refresh_profile.v1~';
