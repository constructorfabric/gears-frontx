/**
 * `@gears-frontx/mfes/unit-format` — the shared-dependency unit format
 * contract surface: the TypeScript interfaces that are the single typing
 * source for the per-entry flat fetch lists a producing build emits and
 * the runtime reads, and the `UnitFormatConformance` suite every
 * producing build must pass
 * (`cpt-frontx-feature-unit-format-contract`, DESIGN §3.3).
 *
 * Contract types only live in this subpath; the root barrel is unchanged.
 *
 * @packageDocumentation
 */

export type {
  SharedDepProducer,
  SharedDepImportEdge,
  SharedDepFileRef,
  SharedDepListItem,
  SharedDepOpaqueImport,
  SharedDepFetchList,
  SharedDepEntryListRefs,
  SharedDepBootData,
} from './fetch-list';
export type { UnitFormatViolationRule, UnitFormatViolation } from './UnitFormatViolation';
export { UnitFormatConformance } from './UnitFormatConformance';
