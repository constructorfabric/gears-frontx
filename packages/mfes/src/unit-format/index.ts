/**
 * `@gears-frontx/mfes/unit-format` — the shared-dependency unit format
 * contract surface: the TypeScript types that are the single typing
 * source for the manifest's unit table and flat fetch lists, which a
 * producing build records and the runtime reads
 * (`cpt-frontx-feature-unit-format-contract`, DESIGN §3.3).
 *
 * Types only live in this subpath; the root barrel is unchanged.
 *
 * @packageDocumentation
 */

export type {
  SharedDepUnit,
  SharedDepImportEdge,
  SharedDepFetchList,
} from './fetch-list';
