/**
 * FrontX Layout Domain Constants (Framework L2)
 *
 * Instance IDs for FrontX base layout domains.
 * These constants live in @gears-frontx/framework because layout domains
 * are runtime configuration owned by the framework layer.
 *
 * @packageDocumentation
 */

// ============================================================================
// Layout Domain Instance IDs
// ============================================================================

/**
 * Popup domain instance ID.
 * Extension domain for popup/modal dialogs.
 */
export const FRONTX_POPUP_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1';

/**
 * Sidebar domain instance ID.
 * Extension domain for collapsible side panels.
 */
export const FRONTX_SIDEBAR_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1';

/**
 * Screen domain instance ID.
 * Extension domain for main content area screens.
 */
export const FRONTX_SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

/**
 * Overlay domain instance ID.
 * Extension domain for full-screen overlays.
 */
export const FRONTX_OVERLAY_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1';

// ============================================================================
// MFE Event Names
// ============================================================================

/** MFE event names (registration events only) */
export const MfeEvents = {
  RegisterExtensionRequested: 'mfe/registerExtensionRequested',
  UnregisterExtensionRequested: 'mfe/unregisterExtensionRequested',
} as const;
