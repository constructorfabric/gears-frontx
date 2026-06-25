/**
 * GTS-specific schema shape for TypeSystemPlugin<JSONSchema>.
 *
 * Intentionally NOT in @gears-frontx/mfes — the MFE Runtime must not carry
 * format-specific schema shape (MFES-5 / cpt-frontx-constraint-mfe-runtime-schema-agnostic).
 *
 * @packageDocumentation
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
