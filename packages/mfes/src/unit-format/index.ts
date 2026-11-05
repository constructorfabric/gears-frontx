/**
 * `@gears-frontx/mfes/unit-format` — the shared-dependency unit format
 * contract surface: the TypeScript interfaces that are the single typing
 * source for graph files, and the `UnitFormatConformance` suite every
 * producing build must pass
 * (`cpt-frontx-feature-unit-format-contract`, DESIGN §3.3).
 *
 * Contract types only live in this subpath; the root barrel is unchanged.
 *
 * @packageDocumentation
 */

export type {
  SharedDepUnitMode,
  SharedDepGraphUnit,
  SharedDepGraphPack,
  SharedDepGraphProducer,
  SharedDepGraphFile,
} from './graph-file';
export type { UnitFormatViolationRule, UnitFormatViolation } from './UnitFormatViolation';
export { UnitFormatConformance } from './UnitFormatConformance';
