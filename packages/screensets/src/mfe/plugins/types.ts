/**
 * Type System Plugin — Re-exports from @gears-frontx/mfes
 *
 * The port contract (`TypeSystemPlugin`, `ValidationErrorItem`, `ValidationResult`)
 * has been extracted to `@gears-frontx/mfes`. Re-exported here for backward
 * compatibility while `packages/screensets` consumers migrate.
 *
 * `JSONSchema` is the GTS-specific concrete schema shape and stays here
 * until Phase 4 moves it to `@gears-frontx/gts-plugin`.
 *
 * @packageDocumentation
 */

export type {
  ValidationErrorItem,
  ValidationResult,
  TypeSystemPlugin,
} from '@gears-frontx/mfes';

/**
 * JSON Schema type (GTS-specific; used by the GTS plugin implementation).
 * This is the concrete schema shape for `TypeSystemPlugin<JSONSchema>`.
 * It is intentionally NOT re-exported from `@gears-frontx/mfes` — the MFE
 * Runtime must not carry format-specific schema shape (MFES-5).
 */
export interface JSONSchema {
  $id?: string;
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  $ref?: string;
  items?: JSONSchema | JSONSchema[];
  [key: string]: unknown;
}
