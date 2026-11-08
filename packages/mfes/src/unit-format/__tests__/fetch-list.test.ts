/**
 * Type-level and fixture-shape tests for the per-entry flat fetch-list
 * contract (`fetch-list.ts`), and for the graph-file types that stay
 * exported while their consumers are removed
 * (`cpt-frontx-feature-unit-format-contract`).
 */
import { describe, expect, it } from 'vitest';
import type {
  SharedDepFileRef,
  SharedDepListItem,
  SharedDepFetchList,
  SharedDepOpaqueImport,
  SharedDepEntryListRefs,
  SharedDepBootData,
  // Graph-file types stay exported pending removal of their consumers.
  SharedDepGraphFile,
  SharedDepGraphUnit,
  SharedDepGraphFileRef,
  SharedDepGraphShard,
  SharedDepGraphPack,
  SharedDepGraphProducer,
  SharedDepUnitMode,
} from '../index';

const HEX64 = 'a'.repeat(64);

describe('SharedDepListItem', () => {
  it('carries URL, content hash, answered specifiers and import edges', () => {
    const item: SharedDepListItem = {
      location: 'react@19.2.4/entry.abc123.js',
      contentHash: HEX64,
      answers: ['react', 'react/jsx-runtime'],
      imports: ['scheduler'],
    };
    expect(item.location).toBe('react@19.2.4/entry.abc123.js');
    expect(item.contentHash).toHaveLength(64);
    expect(item.answers).toContain('react/jsx-runtime');
    expect(item.imports).toEqual(['scheduler']);
  });

  it('requires every field — an empty-but-complete item is valid', () => {
    const item: SharedDepListItem = {
      location: 'x.js',
      contentHash: HEX64,
      answers: [],
      imports: [],
    };
    expect(Object.keys(item).sort()).toEqual(['answers', 'contentHash', 'imports', 'location']);
  });
});

describe('SharedDepFetchList', () => {
  it('carries a flat item list', () => {
    const list: SharedDepFetchList = {
      items: [
        { location: 'a.js', contentHash: HEX64, answers: ['a'], imports: ['b'] },
        { location: 'b.js', contentHash: HEX64, answers: ['b'], imports: [] },
      ],
    };
    expect(list.items).toHaveLength(2);
  });

  it('carries lazy-target lists keyed by the lazy target, each a document reference', () => {
    const delta: SharedDepFileRef = { location: 'lazy-1.list.json', contentHash: HEX64 };
    const list: SharedDepFetchList = {
      items: [],
      lazy: { './lazy/Panel.js': delta },
    };
    expect(list.lazy?.['./lazy/Panel.js']).toEqual(delta);
  });

  it('carries pattern-import lists keyed by matching file', () => {
    const delta: SharedDepFileRef = { location: 'loc-en.list.json', contentHash: HEX64 };
    const list: SharedDepFetchList = {
      items: [],
      patterns: { './locales/en.json.js': delta },
    };
    expect(list.patterns?.['./locales/en.json.js']).toEqual(delta);
  });

  it('carries opaque-import report entries with file and line', () => {
    const report: SharedDepOpaqueImport = { file: 'app.js', line: 42, expression: 'expr' };
    const list: SharedDepFetchList = { items: [], opaqueImports: [report] };
    expect(list.opaqueImports?.[0].file).toBe('app.js');
    expect(list.opaqueImports?.[0].line).toBe(42);
  });

  it('may record the producer that emitted it', () => {
    const list: SharedDepFetchList = {
      items: [],
      producer: { name: 'unit-producer', version: '1.0.0' },
    };
    expect(list.producer?.name).toBe('unit-producer');
  });
});

describe('manifest and boot-data carriers', () => {
  it('maps each entry to its fetch-list document reference', () => {
    const refs: SharedDepEntryListRefs = {
      './lifecycle': { location: 'lifecycle.list.json', contentHash: HEX64 },
      './admin': { location: 'admin.list.json', contentHash: HEX64 },
    };
    expect(refs['./lifecycle'].contentHash).toBe(HEX64);
  });

  it('embeds the shell boot list inline in boot data', () => {
    const boot: SharedDepBootData = {
      list: { items: [{ location: 'react.js', contentHash: HEX64, answers: ['react'], imports: [] }] },
    };
    expect(boot.list.items).toHaveLength(1);
  });
});

describe('graph-file types (pending removal)', () => {
  it('stay exported while their consumers exist', () => {
    const mode: SharedDepUnitMode = 'units';
    const unit: SharedDepGraphUnit = {
      modulePaths: ['index.js'],
      bareImports: [],
      relativeImports: [],
      location: 'u.js',
    };
    const ref: SharedDepGraphFileRef = { location: 'g.json', contentHash: HEX64 };
    const shard: SharedDepGraphShard = { name: 'p', version: '1.0.0', units: [unit] };
    const pack: SharedDepGraphPack = { location: 'p.js' };
    const producer: SharedDepGraphProducer = { name: 'x', version: '1' };
    const graph: SharedDepGraphFile = { name: 'p', version: '1.0.0', unitMode: mode, units: [unit] };
    expect(graph.units[0].modulePaths).toEqual(['index.js']);
    expect([ref, shard, pack, producer]).toBeDefined();
  });
});
