/**
 * Unit tests for the phase-8 collaborator classes: ByteBudgetLruCache,
 * PackFallbackPolicy, SharedSpecifierRewriter, SharedEntryResolver, SharedUnitGraphLoader,
 * UnitBlobMinter, LoadDiagnosticsAccumulator (issue #718).
 */
import { describe, expect, it, vi } from 'vitest';
import { ByteBudgetLruCache } from '../ByteBudgetLruCache';
import { PackFallbackPolicy } from '../PackFallbackPolicy';
import { SharedEntryResolver } from '../SharedEntryResolver';
import { SharedSpecifierRewriter } from '../SharedSpecifierRewriter';
import { SharedUnitGraphLoader } from '../SharedUnitGraphLoader';
import { UnitBlobMinter } from '../UnitBlobMinter';
import { LoadDiagnosticsAccumulator } from '../LoadDiagnosticsAccumulator';
import { MfeLoadError } from '../../../errors';
import type { SharedDepSourceRecord } from '../SharedUnitGraphLoader';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ByteBudgetLruCache', () => {
  it('evicts the least-recently-used fulfilled entry when bytes exceed the budget', async () => {
    const cache = new ByteBudgetLruCache(64);
    cache.set('a', Promise.resolve('x'.repeat(40)));
    await flush();
    cache.set('b', Promise.resolve('y'.repeat(40)));
    await flush();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
  });

  it('counts UTF-8 bytes, not UTF-16 code units', async () => {
    const cache = new ByteBudgetLruCache(100);
    cache.set('a', Promise.resolve('x'.repeat(50)));
    await flush();
    cache.set('b', Promise.resolve('😀'.repeat(30))); // 120 UTF-8 bytes
    await flush();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
  });

  it('evicts even a sole entry larger than the budget', async () => {
    const cache = new ByteBudgetLruCache(8);
    cache.set('big', Promise.resolve('z'.repeat(64)));
    await flush();
    expect(cache.get('big')).toBeUndefined();
  });

  it('never evicts an in-flight entry for bytes it does not yet have', async () => {
    const cache = new ByteBudgetLruCache(64);
    let resolveInFlight!: (v: string) => void;
    const inFlight = new Promise<string>((r) => {
      resolveInFlight = r;
    });
    cache.set('pending', inFlight);
    cache.set('big', Promise.resolve('y'.repeat(100)));
    await flush();
    resolveInFlight('done');
    expect(cache.get('pending')).toBeDefined();
  });

  it('reports diagnostics', async () => {
    const cache = new ByteBudgetLruCache(1024);
    cache.set('a', Promise.resolve('abc'));
    await flush();
    const d = cache.getDiagnostics();
    expect(d.bytes).toBe(3);
    expect(d.entries).toBe(1);
    expect(d.budget).toBe(1024);
  });
});

describe('PackFallbackPolicy', () => {
  it('chooses the pack only when declared and the budget is spent', () => {
    expect(PackFallbackPolicy.shouldUsePack(true, 0, 1)).toBe(true);
    expect(PackFallbackPolicy.shouldUsePack(false, 0, 1)).toBe(false);
    expect(PackFallbackPolicy.shouldUsePack(true, 1500, 12)).toBe(false);
  });

  it('ships the provisional 1500 ms default', () => {
    expect(PackFallbackPolicy.DEFAULT_BUDGET_MS).toBe(1500);
  });
});

describe('SharedSpecifierRewriter', () => {
  it('resolves a relative specifier against every member module path', () => {
    const src = 'import "./b.js";\nexport const s = 1;\n';
    const out = SharedSpecifierRewriter.rewriteUnitSource(
      src,
      ['lib/a.js', 'lib/c.js'],
      new Map(),
      (resolved) => (resolved === 'lib/b.js' ? 'blob:b' : undefined),
    );
    expect(out).toContain('blob:b');
  });

  it('rewrites bare specifiers through the kernel per key', () => {
    const src = 'import "react/jsx-runtime";\nimport "react";\n';
    const out = SharedSpecifierRewriter.rewriteUnitSource(
      src,
      ['index.js'],
      new Map([
        ['react', 'blob:react'],
        ['react/jsx-runtime', 'blob:jsx'],
      ]),
      () => undefined,
    );
    expect(out).toContain('import "blob:jsx";');
    expect(out).toContain('import "blob:react";');
  });

  it('offers subpath candidates most specific first', () => {
    expect(SharedSpecifierRewriter.subpathModulePathCandidates('jsx-runtime')).toEqual([
      'jsx-runtime',
      'jsx-runtime.js',
      'jsx-runtime/index.js',
    ]);
  });
});

describe('SharedUnitGraphLoader', () => {
  const graph = {
    name: 'react',
    version: '1.0.0',
    unitMode: 'units' as const,
    units: [
      {
        contentHash: 'h',
        modulePaths: ['index.js'],
        bareImports: [],
        relativeImports: [],
        location: 'u.js',
      },
    ],
    mainModulePath: 'index.js',
    requires: ['left-pad'],
  };

  it('fails the requires closure naming each missing package', () => {
    expect(() =>
      SharedUnitGraphLoader.checkRequiresClosure(
        [
          {
            dep: { name: 'react' } as never,
            graph,
            graphFileLocation: 'g.json',
          },
        ],
        new Set(['react']),
        'entry',
      ),
    ).toThrow(MfeLoadError);
    expect(() =>
      SharedUnitGraphLoader.checkRequiresClosure(
        [
          {
            dep: { name: 'react' } as never,
            graph,
            graphFileLocation: 'g.json',
          },
        ],
        new Set(['react']),
        'entry',
      ),
    ).toThrow(/'left-pad'/);
  });

  it('rejects a malformed entryRoots field naming roots', () => {
    const manifest = {
      id: 'm',
      entryRoots: { './x': 'not-an-array' },
    } as never;
    expect(() =>
      SharedUnitGraphLoader.rootsForExposedModule(manifest, './x', 'entry'),
    ).toThrow(/entryRoots|roots/i);
  });

  it('reaches a unit by subpath specifier and via relative imports', () => {
    const units = [
      {
        contentHash: 'a',
        modulePaths: ['lib/a.js', 'lib/c.js'],
        bareImports: [],
        relativeImports: ['./b.js'],
        location: 'a.js',
      },
      {
        contentHash: 'b',
        modulePaths: ['lib/b.js'],
        bareImports: [],
        relativeImports: [],
        location: 'b.js',
      },
    ];
    const loaded = {
      dep: { name: 'pkg' } as never,
      graph: { ...graph, name: 'pkg', units, requires: [] },
      graphFileLocation: 'g.json',
    };
    const { reachedUnits } = SharedUnitGraphLoader.reachUnits(
      ['pkg'],
      new Map([['pkg', loaded]]),
    );
    expect(reachedUnits.get('pkg')?.size).toBe(2);
  });

  it('does not validate units of an unreached package (point of use)', () => {
    const ok = {
      dep: { name: 'ok' } as never,
      graph,
      graphFileLocation: 'ok.graph.json',
    };
    const bad = {
      dep: { name: 'bad' } as never,
      graph: {
        ...graph,
        name: 'bad',
        requires: [],
        units: [
          {
            contentHash: 'x',
            // malformed: no modulePaths at all — a TypeError shape if
            // read eagerly, an MfeLoadError only if reached.
            modulePaths: undefined,
            bareImports: [],
            relativeImports: [],
            location: 'u.js',
          } as never,
        ],
      },
      graphFileLocation: 'bad.graph.json',
    };
    // 'bad' is declared but no root reaches it: point-of-use validation
    // must not touch its units.
    const reach = SharedUnitGraphLoader.reachUnits(
      ['react'],
      new Map([
        ['react', ok],
        ['bad', bad],
      ]),
    );
    expect(reach.reachedPackages.has('bad')).toBe(false);
    // Reaching it DOES validate — and fails with MfeLoadError, not TypeError.
    expect(() =>
      SharedUnitGraphLoader.reachUnits(
        ['bad'],
        new Map([
          ['react', ok],
          ['bad', bad],
        ]),
      ),
    ).toThrow(MfeLoadError);
  });

  it('blocks pack fallback when legacy whole-package reach includes non-entry units', async () => {
    // react's graph has a pack; react-dom's unit carries bareImports only
    // (legacy shape, no bareSpecifiers), so the whole react package is
    // reached — including its non-entry unit, which a pack delivery would
    // drop. The pack must be blocked and both units delivered.
    const reactUnits = [
      {
        contentHash: 'a',
        modulePaths: ['index.js'],
        bareImports: [],
        relativeImports: [],
        location: 'react/a.js',
      },
      {
        contentHash: 'b',
        modulePaths: ['jsx-runtime.js'],
        bareImports: [],
        relativeImports: [],
        location: 'react/b.js',
      },
    ];
    const react = {
      dep: { name: 'react', version: '1.0.0' } as never,
      graph: {
        name: 'react',
        version: '1.0.0',
        unitMode: 'units' as const,
        units: reactUnits,
        mainModulePath: 'index.js',
        requires: [],
        pack: { contentHash: 'p', location: 'react/pack.js' },
      },
      graphFileLocation: 'react.graph.json',
    };
    const reactDom = {
      dep: { name: 'react-dom', version: '1.0.0' } as never,
      graph: {
        name: 'react-dom',
        version: '1.0.0',
        unitMode: 'units' as const,
        units: [
          {
            contentHash: 'd',
            modulePaths: ['index.js'],
            bareImports: ['react'],
            // no bareSpecifiers — legacy producer shape
            relativeImports: [],
            location: 'react-dom/d.js',
          },
        ],
        mainModulePath: 'index.js',
        requires: ['react'],
      },
      graphFileLocation: 'react-dom.graph.json',
    };
    const fetched: string[] = [];
    const plan = await SharedUnitGraphLoader.buildPlan(
      [react, reactDom],
      ['react-dom'],
      0,
      0,
      (url) => {
        fetched.push(url);
        return Promise.resolve('src');
      },
      (location) => `http://h/${location}`,
      'entry',
    );
    // The pack was NOT chosen: no pack record, both units fetched.
    expect(plan.packFallbackPackages).toEqual([]);
    expect(fetched).toContain('http://h/react/a.js');
    expect(fetched).toContain('http://h/react/b.js');
    expect(fetched).not.toContain('http://h/react/pack.js');
  });
});

describe('SharedEntryResolver', () => {
  const unit = (modulePaths: string[]) => ({
    contentHash: 'h',
    modulePaths,
    bareImports: [],
    relativeImports: [],
    location: `${modulePaths[0]}.js`,
  });
  const main = unit(['esm/index.js']);
  const button = unit(['esm/button/index.js']);
  const guess = unit(['button.js']);
  const graph = {
    name: '@scope/kit',
    version: '1.0.0',
    unitMode: 'units' as const,
    units: [main, button, guess],
    mainModulePath: 'esm/index.js',
    entryModulePaths: { '.': 'esm/index.js', './button': 'esm/button/index.js' },
  };

  it('splits scoped and unscoped specifiers into name and subpath', () => {
    expect(SharedEntryResolver.split('@scope/kit/a/b')).toEqual({ name: '@scope/kit', subpath: 'a/b' });
    expect(SharedEntryResolver.split('react')).toEqual({ name: 'react', subpath: '' });
  });

  it('resolves a declared exports subpath to its entry module, not a guessed path', () => {
    expect(SharedEntryResolver.entryUnit(graph, 'button')).toBe(button);
    expect(SharedEntryResolver.entryUnit(graph, '')).toBe(main);
  });

  it('falls back to candidate module paths for an undeclared subpath', () => {
    const { entryModulePaths: _ignored, ...legacy } = graph;
    expect(SharedEntryResolver.entryUnit(legacy, 'button')).toBe(guess);
  });

  it('lists the entry specifiers a unit answers', () => {
    expect(SharedEntryResolver.entrySpecifiersOf(graph, main)).toEqual(['@scope/kit']);
    expect(SharedEntryResolver.entrySpecifiersOf(graph, button)).toEqual(['@scope/kit/button']);
    expect(SharedEntryResolver.entrySpecifiersOf(graph, guess)).toEqual([]);
  });

  it('prefers recorded bare specifiers over bare import names', () => {
    expect(SharedEntryResolver.importedSpecifiers({ bareImports: ['react'], bareSpecifiers: ['react/jsx-runtime'] })).toEqual(['react/jsx-runtime']);
    expect(SharedEntryResolver.importedSpecifiers({ bareImports: ['react'] })).toEqual(['react']);
  });
});

describe('UnitBlobMinter', () => {
  const record = (over: Partial<SharedDepSourceRecord>): SharedDepSourceRecord => ({
    key: 'k',
    packageName: 'pkg',
    modulePaths: ['index.js'],
    isPackageMain: true,
    entrySpecifiers: [],
    bareImports: [],
    bareSpecifiers: [],
    relativeImports: [],
    text: 'export const x = 1;',
    ...over,
  });

  it('mints leaves first and maps the package specifier', () => {
    const spy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const map = UnitBlobMinter.mint([record({})], 'entry');
    expect(map.get('pkg')).toBe('blob:mock');
    spy.mockRestore();
  });

  it('fails deterministically on a minting cycle', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:m');
    const a = record({
      key: 'a',
      modulePaths: ['a.js'],
      relativeImports: ['./b.js'],
    });
    const b = record({
      key: 'b',
      modulePaths: ['b.js'],
      isPackageMain: false,
      relativeImports: ['./a.js'],
    });
    expect(() => UnitBlobMinter.mint([a, b], 'entry')).toThrow(MfeLoadError);
    vi.restoreAllMocks();
  });

  it('resolves a lazy batch\'s relative imports against units an earlier mint delivered', async () => {
    const mintedTexts: Blob[] = [];
    const spy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((object: Blob | MediaSource) => {
        if (object instanceof Blob) mintedTexts.push(object);
        return `blob:${mintedTexts.length}`;
      });
    const unitBlobs = new Map<string, string>();
    // Entry mint: the index.js unit.
    UnitBlobMinter.mint([record({})], 'entry', undefined, unitBlobs);
    expect(unitBlobs.get('pkg/index.js')).toBe('blob:1');
    // Lazy mint: a fresh unit importing the already-minted one.
    const lazy = record({
      key: 'lazy',
      modulePaths: ['lazy.js'],
      isPackageMain: false,
      relativeImports: ['./index.js'],
      text: 'import "./index.js";\nexport const l = 1;',
    });
    UnitBlobMinter.mint([lazy], 'entry', undefined, unitBlobs);
    spy.mockRestore();
    const lazyText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(mintedTexts[1]);
    });
    // The relative import rewrote to the entry unit's existing blob.
    expect(lazyText).toContain('import "blob:1"');
  });

  it('mints a unit carrying a dynamic import() untouched when no rewrite options are given', () => {
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:m');
    const ok = record({
      text: 'const s = "import(\'x\')";\n// import(\'y\')\nconst r = /import\\(/;\nexport const x = 1;',
    });
    expect(() => UnitBlobMinter.mint([ok], 'entry')).not.toThrow();
    const commented = record({
      text: "const p = import /*c*/ ('./x.js');\nexport const x = 1;",
    });
    expect(() => UnitBlobMinter.mint([commented], 'entry')).not.toThrow();
    spy.mockRestore();
  });

  it('rewrites a literal import() to __frontx_lazy via the supplied options and leaves non-literals untouched', async () => {
    const mintedTexts: Blob[] = [];
    const spy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((object: Blob | MediaSource) => {
        if (object instanceof Blob) mintedTexts.push(object);
        return `blob:${mintedTexts.length}`;
      });
    const rec = record({
      text: "const a = import('./x.js');\nconst b = import(expr);\nexport const x = 1;",
    });
    UnitBlobMinter.mint([rec], 'entry', undefined, undefined, {
      loaderUrl: () => 'blob:stub',
      tokenFor: (_r, s) => (s === './x.js' ? `unit:${s}` : undefined),
    });
    spy.mockRestore();
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(mintedTexts[mintedTexts.length - 1]);
    });
    expect(text).toContain('import{__frontx_lazy}from"blob:stub"');
    expect(text).toContain('__frontx_lazy("unit:./x.js")');
    expect(text).toContain('import(expr)');
    expect(text).not.toContain("import('./x.js')");
  });
});

describe('LoadDiagnosticsAccumulator', () => {
  it('emits a warning once per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const acc = new LoadDiagnosticsAccumulator();
    acc.warnOnce('k', 'hello bytes realm cache');
    acc.warnOnce('k', 'hello again');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('emits the byte-agreement warning on a second manifest naming producers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const acc = new LoadDiagnosticsAccumulator();
    const dep = {
      name: 'react',
      graphFile: { location: 'g', contentHash: 'h'.repeat(64) },
    } as never;
    const graph = { producer: { name: 'producer-a', version: '1' } } as never;
    acc.recordByteAgreement(dep, graph, 'm1');
    acc.recordByteAgreement(dep, graph, 'm2');
    const match = warn.mock.calls.filter((c) =>
      /byte[- ]agreement|same bytes|identical/i.test(String(c[0])),
    );
    expect(match.length).toBe(1);
    expect(String(match[0][0])).toContain('producer-a');
    warn.mockRestore();
  });
});
