/**
 * GTS Derived Schemas - Application Layer
 *
 * Application-specific derived schemas that extend the core GTS type system.
 * These schemas constrain property values to the set of values the FrontX
 * application actually supports (e.g. registered themes, supported languages).
 *
 * These are NOT part of @gears-frontx/screensets (L1) because they encode application-
 * level decisions. They belong here at L2 so the application layer registers
 * them before constructing the FrontX app.
 *
 * @packageDocumentation
 */

// @cpt-dod:cpt-frontx-dod-framework-composition-derived-schemas:p1

import type { JSONSchema } from '@gears-frontx/screensets';
import themeSchemaJson from './schemas/theme.v1.json';
import languageSchemaJson from './schemas/language.v1.json';
import extensionScreenSchemaJson from './schemas/extension_screen.v1.json';

export const themeSchema = themeSchemaJson as JSONSchema;
export const languageSchema = languageSchemaJson as JSONSchema;
export const extensionScreenSchema = extensionScreenSchemaJson as JSONSchema;
