/**
 * Minting orders a batch against the items the load already minted and
 * the batch's own records only, and resolves a relative specifier against
 * the importing item's location, relative or absolute
 * (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
 * `inst-md-mint-list-items`).
 */
import { describe, expect, it } from 'vitest';
import { MfeLoadError } from '../../../errors';
import {
  SharedDepListMinter,
  type SharedDepListRecord,
} from '../SharedDepListMinter';
import type { SharedDepListItem } from '../../../unit-format/fetch-list';

const hash = (n: number): string => String(n).repeat(64).slice(0, 64);

const item = (
  location: string,
  n: number,
  answers: string[] = [],
  imports: SharedDepListItem['imports'] = [],
): SharedDepListItem => ({ location, contentHash: hash(n), answers, imports });

const maps = () => ({
  itemBlobByHash: new Map<string, string>(),
  specifierToBlob: new Map<string, string>(),
});

describe('SharedDepListMinter.mint', () => {
  it('mints a batch whose item is registered with an unminted item of another batch', () => {
    const other = item('shared/other.js', 2, ['other']);
    const mine = item('shared/mine.js', 1, ['mine'], ['other', { item: hash(2) }]);
    const record: SharedDepListRecord = {
      item: mine,
      text: "import 'other';\nexport const m = 1;\n",
    };
    const target = maps();
    // `other` is registered on the load but belongs to a batch not minted.
    SharedDepListMinter.mint(
      [record],
      new Map([
        [mine.location, mine],
        [other.location, other],
      ]),
      target,
      'entry',
    );
    expect(target.itemBlobByHash.get(hash(1))).toMatch(/^blob:/);
    expect(target.itemBlobByHash.has(hash(2))).toBe(false);
  });

  it('still reports a cycle among the batch\'s own records', () => {
    const a = item('shared/a.js', 1, ['a'], [{ item: hash(2) }]);
    const b = item('shared/b.js', 2, ['b'], [{ item: hash(1) }]);
    expect(() =>
      SharedDepListMinter.mint(
        [
          { item: a, text: 'export const a = 1;' },
          { item: b, text: 'export const b = 1;' },
        ],
        new Map([
          [a.location, a],
          [b.location, b],
        ]),
        maps(),
        'entry',
      ),
    ).toThrow(MfeLoadError);
  });

  it('orders against an item the load already minted', () => {
    const base = item('shared/base.js', 2, ['base']);
    const mine = item('shared/mine.js', 1, ['mine'], ['base']);
    const target = maps();
    target.itemBlobByHash.set(hash(2), 'blob:base');
    target.specifierToBlob.set('base', 'blob:base');
    SharedDepListMinter.mint(
      [{ item: mine, text: "import 'base';\nexport const m = 1;\n" }],
      new Map([
        [mine.location, mine],
        [base.location, base],
      ]),
      target,
      'entry',
    );
    expect(target.itemBlobByHash.get(hash(1))).toMatch(/^blob:/);
  });
});

describe('SharedDepListMinter.resolveLocation', () => {
  it('resolves a relative specifier against a relative item location', () => {
    expect(
      SharedDepListMinter.resolveLocation('shared/react/index.js', './deep.js'),
    ).toBe('shared/react/deep.js');
    expect(
      SharedDepListMinter.resolveLocation('shared/react/index.js', '../x.js'),
    ).toBe('shared/x.js');
  });

  it('resolves against an absolute item location to an absolute location, the form the unit format allows an item location to take', () => {
    expect(
      SharedDepListMinter.resolveLocation(
        'https://cdn.test/shared/react/index.js',
        './deep.js',
      ),
    ).toBe('https://cdn.test/shared/react/deep.js');
  });
});
