/**
 * Minting orders a batch against the items the load already minted and
 * the batch's own records only, and resolves a relative specifier against
 * the importing item's location, relative or absolute
 * (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
 * `inst-md-mint-list-items`).
 */
import { describe, expect, it, vi } from 'vitest';
import { MfeLoadError } from '../../../errors';
import {
  SharedDepListMinter,
  type SharedDepListRecord,
} from '../SharedDepListMinter';
import type { SharedDepUnit } from '../../../unit-format/fetch-list';
import { DynamicImportScan } from '../../../unit-format/dynamic-import-scan';
import { captureMintedSources } from './helpers/minted-sources';

const hash = (n: number): string => String(n).repeat(64).slice(0, 64);

const item = (
  location: string,
  n: number,
  answers: string[] = [],
  imports: SharedDepUnit['imports'] = [],
): SharedDepUnit => ({ location, contentHash: hash(n), answers, imports });

const assetUrl = (location: string): string =>
  new URL(location, 'https://mfe.test/').href;

const maps = () => ({
  itemBlobByHash: new Map<string, string>(),
  specifierToBlob: new Map<string, string>(),
});

describe('SharedDepListMinter.mint', () => {
  it('mints a batch whose item is registered with an unminted item of another batch', () => {
    const other = item('shared/other.js', 2, ['other']);
    const mine = item('shared/mine.js', 1, ['mine'], ['other', { unit: hash(2) }]);
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
      assetUrl,
    );
    expect(target.itemBlobByHash.get(hash(1))).toMatch(/^blob:/);
    expect(target.itemBlobByHash.has(hash(2))).toBe(false);
  });

  it('still reports a cycle among the batch\'s own records', () => {
    const a = item('shared/a.js', 1, ['a'], [{ unit: hash(2) }]);
    const b = item('shared/b.js', 2, ['b'], [{ unit: hash(1) }]);
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
        assetUrl,
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
      assetUrl,
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

describe('SharedDepListMinter.mint — relative edges and bare specifiers', () => {
  it('resolves each relative import against the importing item\'s own location, so a nested unit binds its own siblings', () => {
    const sibling = item('pkg@1/dist/sub/s.js', 2);
    const parent = item('pkg@1/dist/o.js', 3);
    const importer = item('pkg@1/dist/sub/m.js', 1, [], [{ unit: hash(2) }, { unit: hash(3) }]);
    const target = maps();
    SharedDepListMinter.mint(
      [
        { item: importer, text: "import './s.js';\nimport { o } from '../o.js';\nexport const m = 1;\n" },
        { item: sibling, text: 'export const s = 1;\n' },
        { item: parent, text: 'export const o = 1;\n' },
      ],
      new Map([importer, sibling, parent].map((i) => [i.location, i])),
      target,
      'entry',
      assetUrl,
    );
    expect(target.itemBlobByHash.get(hash(1))).toMatch(/^blob:/);
    expect(target.itemBlobByHash.get(hash(2))).toMatch(/^blob:/);
    expect(target.itemBlobByHash.get(hash(3))).toMatch(/^blob:/);
  });

  it('rewrites a subpath specifier to the unit answering that subpath, not the package root', () => {
    const root = item('react/index.js', 2, ['react']);
    const jsx = item('react/jsx-runtime.js', 3, ['react/jsx-runtime']);
    const user = item('lib/index.js', 1, ['lib'], ['react', 'react/jsx-runtime']);
    const target = maps();
    const sources: string[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      const reader = new FileReader();
      reader.onload = () => sources.push(String(reader.result));
      reader.readAsText(blob);
      return original.call(URL, blob);
    }) as typeof URL.createObjectURL;
    try {
      SharedDepListMinter.mint(
        [
          { item: user, text: "import { a } from 'react';\nimport { b } from 'react/jsx-runtime';\n" },
          { item: root, text: 'export const a = 1;\n' },
          { item: jsx, text: 'export const b = 1;\n' },
        ],
        new Map([user, root, jsx].map((i) => [i.location, i])),
        target,
        'entry',
        assetUrl,
      );
    } finally {
      URL.createObjectURL = original;
    }
    const blobOfRoot = target.specifierToBlob.get('react');
    const blobOfJsx = target.specifierToBlob.get('react/jsx-runtime');
    expect(blobOfRoot).toBeDefined();
    expect(blobOfJsx).toBeDefined();
    expect(blobOfRoot).not.toBe(blobOfJsx);
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        const minted = sources.find((s) => s.includes('import { a }'))!;
        expect(minted).toContain(`from '${blobOfRoot!}'`);
        expect(minted).toContain(`from '${blobOfJsx!}'`);
        expect(minted).not.toMatch(/from\s*['"]react/);
        resolve();
      }, 20),
    );
  });

  it('fails a batch whose unminted items form an import cycle, naming the chunks on the cycle and the microfrontend', () => {
    const a = item('shared/a.js', 1, ['a'], ['b']);
    const b = item('shared/b.js', 2, ['b'], ['a']);
    let thrown: unknown;
    try {
      SharedDepListMinter.mint(
        [
          { item: a, text: "import 'b';\nexport const a = 1;\n" },
          { item: b, text: "import 'a';\nexport const b = 1;\n" },
        ],
        new Map([a, b].map((i) => [i.location, i])),
        maps(),
        'the-microfrontend',
        assetUrl,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MfeLoadError);
    const message = (thrown as MfeLoadError).message;
    expect(message).toContain('shared/a.js');
    expect(message).toContain('shared/b.js');
    expect(message).toContain('the-microfrontend');
  });

  it('reads each unit text once and rewrites its specifier, import.meta.url and dynamic import together', async () => {
    const dep = item('shared/dep.js', 2, ['dep']);
    const mine = item('shared/mine.js', 1, ['mine'], ['dep']);
    const text =
      "import 'dep';\n" +
      "export const url = new URL('./a.svg', import.meta.url).href;\n" +
      "export const lazy = () => import('./lazy.js');\n" +
      "export const note = \"import.meta.url\";\n";
    const scan = vi.spyOn(DynamicImportScan, 'scan');
    const minted = captureMintedSources();
    try {
      const target = maps();
      target.specifierToBlob.set('dep', 'blob:dep');
      target.itemBlobByHash.set(hash(2), 'blob:dep');
      SharedDepListMinter.mint(
        [{ item: mine, text }],
        new Map([
          [mine.location, mine],
          [dep.location, dep],
        ]),
        target,
        'entry',
        assetUrl,
        { loaderUrl: () => 'blob:stub' },
      );
      expect(scan).toHaveBeenCalledTimes(1);
      const [source] = await minted.sources();
      expect(source).toContain("import 'blob:dep';");
      expect(source).toContain(
        `new URL('./a.svg', ${JSON.stringify('https://mfe.test/shared/mine.js')})`,
      );
      expect(source).toContain('__frontx_lazy("rel:shared/mine.js\\n./lazy.js")');
      expect(source).toContain('export const note = "import.meta.url";');
    } finally {
      minted.restore();
      scan.mockRestore();
    }
  });
});
