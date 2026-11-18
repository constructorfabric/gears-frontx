/**
 * `@gears-frontx/mfes/unit-format` — the shared-dependency unit format
 * contract surface: the TypeScript types that are the single typing
 * source for the per-entry flat fetch lists a producing build emits and
 * the runtime reads (`cpt-frontx-feature-unit-format-contract`,
 * DESIGN §3.3).
 *
 * Types only live in this subpath; the root barrel is unchanged.
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
} from './fetch-list';
