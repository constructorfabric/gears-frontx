/**
 * `./unit-format` exports exactly the three unit-format types and no runtime
 * value (`cpt-frontx-feature-unit-format-contract`, unit-format DoD).
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as unitFormat from '../index';
import type {
  SharedDepFetchList,
  SharedDepImportEdge,
  SharedDepUnit,
} from '../index';
import { exportedNames } from '../../__tests__/helpers/exported-names';

describe('./unit-format — exact surface', () => {
  it('exports no runtime value', () => {
    expect(Object.keys(unitFormat)).toEqual([]);
  });

  it('exports exactly the unit-format types', () => {
    expect(exportedNames('unit-format/index.ts')).toEqual([
      'SharedDepFetchList',
      'SharedDepImportEdge',
      'SharedDepUnit',
    ]);
  });

  it('types a fetch list by content identities and the keys of the lists it reaches', () => {
    expectTypeOf<SharedDepFetchList['units']>().toEqualTypeOf<string[]>();
    expectTypeOf<SharedDepFetchList['ownChunks']>().toEqualTypeOf<string[]>();
    expectTypeOf<NonNullable<SharedDepFetchList['lazy']>>().toEqualTypeOf<string[]>();
    expectTypeOf<NonNullable<SharedDepFetchList['patterns']>>().toEqualTypeOf<string[]>();
    expectTypeOf<SharedDepImportEdge>().toEqualTypeOf<string | { unit: string }>();
    expectTypeOf<SharedDepUnit['imports']>().toEqualTypeOf<SharedDepImportEdge[]>();
  });
});
