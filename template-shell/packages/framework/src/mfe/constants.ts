/**
 * FrontX MFE Solution Constants (Framework L2)
 *
 * These GTS type-id constants are solution-specific (they encode the
 * `frontx.mfes.*` / `frontx.screensets.*` derived-schema vocabulary chosen by
 * this template), not core MFE runtime contracts. They previously lived in
 * the now-deleted screensets assembly package (`mfe/constants/index.ts`);
 * that package has been deleted with no surviving shim (Stage 2b), so the
 * definitions move to the app layer that actually owns them. The generic
 * `FRONTX_ACTION_*` constants are NOT here — those are GTS-notation
 * lifecycle-action literals owned by `@gears-frontx/gts-plugin` (the generic
 * MFE runtime never hardcodes them; it resolves them dynamically via
 * `TypeSystemPlugin.resolve*ActionId()`).
 *
 * @packageDocumentation
 */

/**
 * MfeEntryMF schema type ID (Module Federation variant).
 * Derives from MfeEntry and adds Module Federation-specific properties.
 */
export const FRONTX_MFE_ENTRY_MF = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';

/**
 * Screen Extension schema type ID (derived extension type for screen domain).
 * Derives from Extension and adds presentation metadata for navigation menu integration.
 */
export const FRONTX_SCREEN_EXTENSION_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~';

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
