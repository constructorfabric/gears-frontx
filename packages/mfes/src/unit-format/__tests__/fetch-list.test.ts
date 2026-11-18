/**
 * Type-level and fixture-shape tests for the per-entry flat fetch-list
 * contract (`fetch-list.ts`)
 * (`cpt-frontx-feature-unit-format-contract`).
 */
import { describe, expect, it } from 'vitest';
import type {
  SharedDepFileRef,
  SharedDepListItem,
  SharedDepFetchList,
  SharedDepOpaqueImport,
  SharedDepEntryListRefs,
  SharedDepProducer,
  SharedDepImportEdge,
} from '../index';

const HEX64 = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);
const HASH_RE = /^[0-9a-f]{64}$/;

describe('SharedDepListItem', () => {
  it('carries URL, content hash, answered specifiers and import edges', () => {
    const item: SharedDepListItem = {
      location: 'react@19.2.4/entry.abc123.js',
      contentHash: HEX64,
      answers: ['react', 'react/jsx-runtime'],
      imports: ['scheduler', { item: HEX64_B }] as SharedDepImportEdge[],
    };
    expect(item.location).toBe('react@19.2.4/entry.abc123.js');
    expect(item.contentHash).toHaveLength(64);
    expect(item.answers).toContain('react/jsx-runtime');
    expect(item.imports).toEqual(['scheduler', { item: HEX64_B }]);
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
    const producer: SharedDepProducer = { name: 'unit-producer', version: '1.0.0' };
    const list: SharedDepFetchList = { items: [], producer };
    expect(list.producer?.name).toBe('unit-producer');
  });

  it('carries content identities in the SHA-256 hex format', () => {
    const item: SharedDepListItem = {
      location: 'a.js',
      contentHash: '0123456789abcdef'.repeat(4),
      answers: ['a'],
      imports: [],
    };
    const ref: SharedDepFileRef = { location: 'a.list.json', contentHash: item.contentHash };
    expect(item.contentHash).toMatch(HASH_RE);
    expect(ref.contentHash).toMatch(HASH_RE);
  });

  it('closes over every imported edge — each is answered by an item on the list or its parent chain', () => {
    const parent: SharedDepFetchList = {
      items: [{ location: 'react.js', contentHash: HEX64_B, answers: ['react'], imports: [] }],
    };
    const list: SharedDepFetchList = {
      items: [
        { location: 'a.js', contentHash: HEX64, answers: ['a'], imports: ['react', 'b', { item: 'c'.repeat(64) }] },
        { location: 'b.js', contentHash: 'c'.repeat(64), answers: ['b'], imports: [] },
      ],
    };
    const answered = new Set(
      [...parent.items, ...list.items].flatMap((i) => i.answers),
    );
    const identities = new Set([...parent.items, ...list.items].map((i) => i.contentHash));
    for (const item of list.items) {
      for (const edge of item.imports) {
        if (typeof edge === 'string') expect(answered.has(edge)).toBe(true);
        else expect(identities.has(edge.item)).toBe(true);
      }
    }
  });
});

describe('manifest carrier', () => {
  it('maps each entry to its fetch-list document reference', () => {
    const refs: SharedDepEntryListRefs = {
      './lifecycle': { location: 'lifecycle.list.json', contentHash: HEX64 },
      './admin': { location: 'admin.list.json', contentHash: HEX64 },
    };
    expect(refs['./lifecycle'].contentHash).toBe(HEX64);
  });
});
