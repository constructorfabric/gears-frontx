/**
 * GTS Solution Schemas — FrontX Standard Template
 *
 * Application-specific derived schemas that extend the core GTS type system.
 * These schemas constrain property values to the set of values a standard
 * FrontX application supports (registered themes, supported languages,
 * screen extension type).
 *
 * Relocated from @gears-frontx/framework in Phase 4 (F3 GTS extraction).
 * The framework re-exports these via its own gts/index.ts redirect.
 *
 * @packageDocumentation
 */

import type { JSONSchema } from '@gears-frontx/screensets';
import themeSchemaJson from './schemas/theme.v1.json';
import languageSchemaJson from './schemas/language.v1.json';
import extensionScreenSchemaJson from './schemas/extension_screen.v1.json';

export const themeSchema = themeSchemaJson as JSONSchema;
export const languageSchema = languageSchemaJson as JSONSchema;
export const extensionScreenSchema = extensionScreenSchemaJson as JSONSchema;
