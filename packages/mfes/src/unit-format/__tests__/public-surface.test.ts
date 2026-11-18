/**
 * `./unit-format` exports exactly the seven fetch-list types and no runtime
 * value (`cpt-frontx-feature-unit-format-contract`, fetch-list DoD).
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as unitFormat from '../index';
import type {
  SharedDepEntryListRefs,
  SharedDepFetchList,
  SharedDepFileRef,
  SharedDepImportEdge,
  SharedDepListItem,
  SharedDepOpaqueImport,
  SharedDepProducer,
} from '../index';
import { exportedNames } from '../../__tests__/helpers/exported-names';

describe('./unit-format — exact surface', () => {
  it('exports no runtime value', () => {
    expect(Object.keys(unitFormat)).toEqual([]);
  });

  it('exports exactly the fetch-list types', () => {
    expect(exportedNames('unit-format/index.ts')).toEqual([
      'SharedDepEntryListRefs',
      'SharedDepFetchList',
      'SharedDepFileRef',
      'SharedDepImportEdge',
      'SharedDepListItem',
      'SharedDepOpaqueImport',
      'SharedDepProducer',
    ]);
  });

  it('types a fetch list through its list items and file references', () => {
    expectTypeOf<SharedDepFetchList['items']>().toEqualTypeOf<SharedDepListItem[]>();
    expectTypeOf<SharedDepEntryListRefs>().toEqualTypeOf<Record<string, SharedDepFileRef>>();
    expectTypeOf<SharedDepImportEdge>().not.toBeAny();
    expectTypeOf<SharedDepOpaqueImport>().not.toBeAny();
    expectTypeOf<SharedDepProducer>().not.toBeAny();
  });
});
