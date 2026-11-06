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
});
