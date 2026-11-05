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
