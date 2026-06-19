/**
 * Type System Plugin exports
 *
 * @packageDocumentation
 */

export type {
  JSONSchema,
  ValidationError,
  ValidationResult,
  TypeSystemPlugin,
} from './types';

// NOTE: GTS plugin is NOT re-exported here to avoid pulling in @globaltypesystem/gts-ts
// for consumers who don't need it. Import directly from '@gears-frontx/screensets/plugins/gts'
