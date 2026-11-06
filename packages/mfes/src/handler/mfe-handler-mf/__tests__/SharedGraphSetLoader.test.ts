/**
 * Regression tests for SharedGraphSetLoader (issue #718, CI-002): the
 * SZ-009 walk-driven fetch loops must reach a fixpoint — terminate —
 * on cyclic and self-referencing graph sets, on the fetch-all-rest
 * flag staying raised after the last fetch, and on documents an
 * injected reader cannot supply.
 */
import { describe, expect, it } from 'vitest';
import type { MfManifestShared } from '../../../manifest/mf-manifest';
import type {
  SharedDepGraphFile,
  SharedDepGraphFileRef,
  SharedDepGraphShard,
  SharedDepGraphUnit,
} from '../../../unit-format/graph-file';
import { SharedGraphSetLoader } from '../SharedGraphSetLoader';
import { SharedUnitGraphLoader } from '../SharedUnitGraphLoader';

const unit = (
  modulePaths: string[],
  specifiers: string[],
  extra?: Partial<SharedDepGraphUnit>,
): SharedDepGraphUnit => ({
  modulePaths,
  bareImports: specifiers.map((s) => s.split('/')[0]),
  bareSpecifiers: specifiers,
  relativeImports: [],
  dynamicImports: [],
  contentHash: 'a'.repeat(64),
  location: `units/${modulePaths[0]}`,
  ...extra,
});

const dep = (name: string, contentHash = 'h'): MfManifestShared => ({
  name,
  version: '1.0.0',
  chunkPath: `shared/${name}.js`,
  unwrapKey: null,
  graphFile: { location: `${name}.graph.json`, contentHash },
});

const graph = (
  name: string,
  units: SharedDepGraphUnit[],
  extra?: Partial<SharedDepGraphFile>,
): SharedDepGraphFile => ({
  name,
  version: '1.0.0',
  unitMode: 'units',
  units,
  ...extra,
});

const ref = (location: string): SharedDepGraphFileRef => ({
  location,
  contentHash: 'h',
});

describe('SharedGraphSetLoader.fetchSet', () => {
  it('terminates on a cyclic + self-referencing graph set', () => {
    const a = dep('a');
    const b = dep('b');
    const graphs = new Map<string, SharedDepGraphFile>([
      ['a', graph('a', [unit(['a.js'], ['b'])])],
      // b imports a (cycle) and itself (self-reference).
      ['b', graph('b', [unit(['b.js'], ['a', 'b'])])],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [a, b],
      ['a'],
      undefined,
      (d) => graphs.get(d.name),
      () => undefined,
    );
    expect(result.deps.map((d) => d.name)).toEqual(['a', 'b']);
  });

  it('terminates when a reached package reports no lazy coverage and no requires', () => {
    // b's unit carries no `dynamicImports` field and b's graph no
    // `requires`: `wanted` flags fetchAllRest every round — before the
    // fixpoint the loop spun once the last fetchable dep was loaded.
    const a = dep('a');
    const b = dep('b');
    const c = dep('c');
    const graphs = new Map<string, SharedDepGraphFile>([
      ['a', graph('a', [unit(['a.js'], ['b'])])],
      [
        'b',
        graph('b', [
          { ...unit(['b.js'], ['a']), dynamicImports: undefined },
        ]),
      ],
      ['c', graph('c', [unit(['c.js'], [])])],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [a, b, c],
      ['a'],
      undefined,
      (d) => graphs.get(d.name),
      () => undefined,
    );
    expect(result.deps.map((d) => d.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('terminates when a reached dep yields no graph document', () => {
    const a = dep('a');
    const b = dep('b');
    const graphs = new Map<string, SharedDepGraphFile>([
      ['a', graph('a', [unit(['a.js'], ['b'])])],
      // b's document missing: fetchDep no-ops, b never enters `loaded`.
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [a, b],
      ['a'],
      undefined,
      (d) => graphs.get(d.name),
      () => undefined,
    );
    expect(result.deps.map((d) => d.name)).toEqual(['a']);
  });

  it('terminates on sharded graphs whose shards import back into the cycle', () => {
    const a = dep('a');
    const s = dep('s');
    const sShardUnits = [unit(['s.js'], ['a'])];
    const sAllUnits = [...sShardUnits, unit(['s-other.js'], ['s'])];
    const graphs = new Map<string, SharedDepGraphFile>([
      ['a', graph('a', [unit(['a.js'], ['s', 's/other'])])],
      [
        's',
        graph('s', [], {
          entryShards: { '.': ref('s.entry.json') },
          unitsShard: ref('s.units.json'),
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      ['s.entry.json', { name: 's', version: '1.0.0', units: sShardUnits }],
      ['s.units.json', { name: 's', version: '1.0.0', units: sAllUnits }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [a, s],
      ['a'],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) =>
        d.name === 's' ? shards.get(location) : undefined,
    );
    expect(result.deps.map((d) => d.name)).toEqual(['a', 's']);
    expect(result.shardLocations.sort()).toEqual([
      's.entry.json',
      's.units.json',
    ]);
  });

  it('dedupes shard locations cited under two keys (SZ-017)', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          // Two entry keys pointing at one document.
          entryShards: { '.': ref('s.entry.json'), './a': ref('s.entry.json') },
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      [
        's.entry.json',
        { name: 's', version: '1.0.0', units: [unit(['s.js'], ['s/a']), unit(['a.js'], [])] },
      ],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      ['s', 's/a'],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    expect(result.shardLocations).toEqual(['s.entry.json']);
  });

  it('fetches only the partition a deep specifier names via the module index (SZ-014)', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          unitPartitions: [ref('s.part-0.json'), ref('s.part-1.json')],
          modulePartitions: { 'index.js': 0, 'deep/Mod.mjs': 1 },
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      ['s.part-0.json', { name: 's', version: '1.0.0', units: [unit(['index.js'], [])] }],
      ['s.part-1.json', { name: 's', version: '1.0.0', units: [unit(['deep/Mod.mjs'], [])] }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      ['s/deep/Mod.mjs'],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    // The deep specifier resolves its module path through the index —
    // partition 0 is never fetched.
    expect(result.shardLocations).toEqual(['s.part-1.json']);
  });

  it('composes disjoint partitions over the intra-package walk (SZ-016)', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          mainModulePath: 'index.js',
          unitPartitions: [ref('s.part-0.json'), ref('s.part-1.json')],
          modulePartitions: { 'index.js': 0, 'dep.js': 1 },
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      [
        's.part-0.json',
        {
          name: 's',
          version: '1.0.0',
          units: [unit(['index.js'], [], { relativeImports: ['./dep.js'] })],
        },
      ],
      ['s.part-1.json', { name: 's', version: '1.0.0', units: [unit(['dep.js'], [])] }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      ['s'],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    // The entry partition's relative edge into the unfetched partition
    // pulls it in on the next round — no overlapping closures needed.
    expect(result.shardLocations.sort()).toEqual(['s.part-0.json', 's.part-1.json']);
  });

  it('resolves a unit-identifier root through the module index (SZ-015)', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          unitPartitions: [ref('s.part-0.json'), ref('s.part-1.json')],
          modulePartitions: { 'index.js': 0, 'dep.js': 1 },
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      ['s.part-0.json', { name: 's', version: '1.0.0', units: [unit(['index.js'], [])] }],
      ['s.part-1.json', { name: 's', version: '1.0.0', units: [unit(['dep.js'], [])] }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      [{ name: 's', version: '1.0.0', modulePaths: ['dep.js'] }],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    expect(result.shardLocations).toEqual(['s.part-1.json']);
  });

  it('falls back to every partition when a specifier names no indexed path and no unitsShard exists', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          unitPartitions: [ref('s.part-0.json'), ref('s.part-1.json')],
          modulePartitions: { 'index.js': 0, 'dep.js': 1 },
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      ['s.part-0.json', { name: 's', version: '1.0.0', units: [unit(['index.js'], [])] }],
      ['s.part-1.json', { name: 's', version: '1.0.0', units: [unit(['dep.js'], [])] }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      [{ name: 's', version: '1.0.0', modulePaths: ['missing.js'] }],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    // An unindexed module path must not under-fetch: every partition.
    expect(result.shardLocations.sort()).toEqual(['s.part-0.json', 's.part-1.json']);
  });

  it('fetches every partition on the fetch-all path when no unitsShard exists', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          unitPartitions: [ref('s.part-0.json'), ref('s.part-1.json')],
          modulePartitions: { 'index.js': 0, 'dep.js': 1 },
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      ['s.part-0.json', { name: 's', version: '1.0.0', units: [unit(['index.js'], [])] }],
      ['s.part-1.json', { name: 's', version: '1.0.0', units: [unit(['dep.js'], [])] }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      undefined,
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    expect(result.shardLocations.sort()).toEqual(['s.part-0.json', 's.part-1.json']);
  });

  it('still loads the legacy overlapping-entryShards format beside the partitioned one', () => {
    const s = dep('s');
    const graphs = new Map<string, SharedDepGraphFile>([
      [
        's',
        graph('s', [], {
          entryShards: { '.': ref('s.entry.json') },
          unitsShard: ref('s.units.json'),
        }),
      ],
    ]);
    const shards = new Map<string, SharedDepGraphShard>([
      ['s.entry.json', { name: 's', version: '1.0.0', units: [unit(['s.js'], [])] }],
      ['s.units.json', { name: 's', version: '1.0.0', units: [unit(['s.js'], [])] }],
    ]);
    const result = SharedGraphSetLoader.fetchSet(
      [s],
      ['s'],
      undefined,
      (d) => graphs.get(d.name),
      (d, location) => (d.name === 's' ? shards.get(location) : undefined),
    );
    // The entry shard answers the root — unitsShard stays unfetched.
    expect(result.shardLocations).toEqual(['s.entry.json']);
  });
});

describe('SharedGraphSetLoader.load', () => {
  it('terminates on a cyclic graph set over real fetched documents', async () => {
    const texts = new Map<string, string>();
    const put = (location: string, doc: unknown): string => {
      const text = JSON.stringify(doc);
      texts.set(location, text);
      return text;
    };
    put('a.graph.json', graph('a', [unit(['a.js'], ['b'])]));
    put('b.graph.json', graph('b', [unit(['b.js'], ['a', 'b'])]));
    const deps = await Promise.all(
      ['a', 'b'].map(async (name) =>
        dep(name, await SharedUnitGraphLoader.sha256Hex(
          texts.get(`${name}.graph.json`)!,
        )),
      ),
    );
    const loaded = await SharedGraphSetLoader.load(
      deps,
      ['a'],
      undefined,
      (location) => location,
      async (url) => texts.get(url)!,
      'test-entry',
    );
    expect(loaded.map((g) => g.dep.name).sort()).toEqual(['a', 'b']);
  });

  it('fetches only the needed partition documents for a deep specifier and a unit-id root', async () => {
    const texts = new Map<string, string>();
    const put = (location: string, doc: unknown): string => {
      const text = JSON.stringify(doc);
      texts.set(location, text);
      return text;
    };
    const refFor = async (location: string, doc: unknown) => ({
      location,
      contentHash: await SharedUnitGraphLoader.sha256Hex(put(location, doc)),
    });
    const graphDoc = (extra: Partial<SharedDepGraphFile>): SharedDepGraphFile =>
      graph('s', [], extra);
    // Partitioned graph: 'deep/Mod.mjs' in partition 1, 'index.js' in 0.
    const g = graphDoc({
      unitPartitions: [
        await refFor('s.part-0.json', {
          name: 's',
          version: '1.0.0',
          units: [unit(['index.js'], [])],
        }),
        await refFor('s.part-1.json', {
          name: 's',
          version: '1.0.0',
          units: [unit(['deep/Mod.mjs'], [])],
        }),
      ],
      modulePartitions: { 'index.js': 0, 'deep/Mod.mjs': 1 },
    });
    const s = dep('s', await SharedUnitGraphLoader.sha256Hex(put('s.graph.json', g)));
    const fetched: string[] = [];
    const fetchText = async (url: string): Promise<string> => {
      fetched.push(url);
      return texts.get(url)!;
    };
    const deepLoaded = await SharedGraphSetLoader.load(
      [s],
      ['s/deep/Mod.mjs'],
      undefined,
      (l) => l,
      fetchText,
      'test-entry',
    );
    expect(deepLoaded.map((x) => x.dep.name)).toEqual(['s']);
    expect(deepLoaded[0].graph.units.map((u) => u.modulePaths[0])).toEqual([
      'deep/Mod.mjs',
    ]);
    expect(fetched).not.toContain('s.part-0.json');

    // A unit-identifier root resolves through the same index.
    const fetched2: string[] = [];
    const rootLoaded = await SharedGraphSetLoader.load(
      [s],
      [{ name: 's', version: '1.0.0', modulePaths: ['index.js'] }],
      undefined,
      (l) => l,
      async (url) => {
        fetched2.push(url);
        return texts.get(url)!;
      },
      'test-entry',
    );
    expect(rootLoaded[0].graph.units.map((u) => u.modulePaths[0])).toEqual([
      'index.js',
    ]);
    expect(fetched2).not.toContain('s.part-1.json');
  });
});
