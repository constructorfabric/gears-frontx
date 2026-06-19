/**
 * HAI3 MFE Constants
 *
 * Convenience constants for HAI3 MFE type IDs and action IDs.
 * These are ADDITIONAL constants beyond the type ID reference constants
 * already defined in init.ts (FRONTX_CORE_TYPE_IDS, FRONTX_MF_TYPE_IDS, FRONTX_LIFECYCLE_STAGE_IDS).
 *
 * @packageDocumentation
 */

// ============================================================================
// Schema Type IDs (convenience re-exports)
// ============================================================================

/**
 * MfeEntry schema type ID (abstract base contract).
 * All MFE entry points must derive from this type.
 */
export const FRONTX_MFE_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~';

/**
 * MfeEntryMF schema type ID (Module Federation variant).
 * Derives from MfeEntry and adds Module Federation-specific properties.
 */
export const FRONTX_MFE_ENTRY_MF = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';

/**
 * MfManifest schema type ID (Module Federation manifest).
 * Standalone type for Module Federation manifest configuration.
 */
export const FRONTX_MF_MANIFEST = 'gts.frontx.mfes.mfe.mf_manifest.v1~';

/**
 * ExtensionDomain schema type ID (extension point contract).
 * Defines an extension point where MFEs can register extensions.
 */
export const FRONTX_EXT_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~';

/**
 * Extension schema type ID (extension binding).
 * Binds an MFE entry to an extension domain.
 */
export const FRONTX_EXT_EXTENSION = 'gts.frontx.mfes.ext.extension.v1~';

/**
 * Screen Extension schema type ID (derived extension type for screen domain).
 * Derives from Extension and adds presentation metadata for navigation menu integration.
 */
export const FRONTX_SCREEN_EXTENSION_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~';

/**
 * Action schema type ID (communication action).
 * Defines a domain action with target and self-id fields.
 */
export const FRONTX_EXT_ACTION = 'gts.frontx.mfes.comm.action.v1~';

// ============================================================================
// Action Instance IDs (generic actions for all domains)
// ============================================================================

/**
 * Load extension action instance ID.
 * Preload an extension's bundle (fetch JS, no DOM rendering).
 */
export const FRONTX_ACTION_LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1';

/**
 * Mount extension action instance ID.
 * Mount an extension into a domain (render to DOM).
 */
export const FRONTX_ACTION_MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1';

/**
 * Unmount extension action instance ID.
 * Unmount an extension from a domain (remove from DOM).
 */
export const FRONTX_ACTION_UNMOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1';

// ============================================================================
// Shared Property Type IDs (built-in property schemas for all domains)
// ============================================================================

/**
 * Theme shared property type ID (GTS schema ID).
 * Built-in shared property type for theme information (light/dark).
 */
export const FRONTX_SHARED_PROPERTY_THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';

/**
 * Language shared property type ID (GTS schema ID).
 * Built-in shared property type for language/locale information (en/es/etc).
 */
export const FRONTX_SHARED_PROPERTY_LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';
