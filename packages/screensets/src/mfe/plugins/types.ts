/**
 * Type System Plugin — Re-exports from @gears-frontx/mfes and @gears-frontx/gts-plugin
 *
 * The port contract (`TypeSystemPlugin`, `ValidationErrorItem`, `ValidationResult`)
 * lives in `@gears-frontx/mfes`. `JSONSchema` (GTS-specific schema shape) lives in
 * `@gears-frontx/gts-plugin` (extracted in Phase 4). Re-exported here for backward
 * compatibility.
 *
 * @packageDocumentation
 */

export type {
  ValidationErrorItem,
  ValidationResult,
  TypeSystemPlugin,
} from '@gears-frontx/mfes';

export type { JSONSchema } from '@gears-frontx/gts-plugin';
