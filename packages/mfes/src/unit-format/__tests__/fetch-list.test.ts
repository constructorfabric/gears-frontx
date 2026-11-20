/**
 * Type-level and fixture-shape tests for the unit table and flat fetch-list
 * contract (`fetch-list.ts`) (`cpt-frontx-feature-unit-format-contract`).
 */
import { describe, expect, it } from 'vitest';
import type {
  SharedDepFetchList,
  SharedDepImportEdge,
  SharedDepUnit,
} from '../index';

const HEX64 = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);
const HEX64_C = 'c'.repeat(64);
const HASH_RE = /^[0-9a-f]{64}$/;

describe('SharedDepUnit', () => {
  it('carries location, content hash, answered specifiers and import edges', () => {
    const unit: SharedDepUnit = {
      location: 'react@19.2.4/entry.abc123.js',
      contentHash: HEX64,
      answers: ['react', 'react/jsx-runtime'],
      imports: ['scheduler', { unit: HEX64_B }] satisfies SharedDepImportEdge[],
    };
    expect(unit.location).toBe('react@19.2.4/entry.abc123.js');
    expect(unit.contentHash).toHaveLength(64);
    expect(unit.answers).toContain('react/jsx-runtime');
    expect(unit.imports).toEqual(['scheduler', { unit: HEX64_B }]);
  });

  it('requires every field — an empty-but-complete unit is valid', () => {
    const unit: SharedDepUnit = {
      location: 'x.js',
      contentHash: HEX64,
      answers: [],
      imports: [],
    };
    expect(Object.keys(unit).sort()).toEqual(['answers', 'contentHash', 'imports', 'location']);
  });

  it('carries the content identity in the SHA-256 hex format', () => {
    const unit: SharedDepUnit = {
      location: 'a.js',
      contentHash: '0123456789abcdef'.repeat(4),
      answers: ['a'],
      imports: [],
    };
    expect(unit.contentHash).toMatch(HASH_RE);
  });
});

describe('SharedDepFetchList', () => {
  it('references units by content identity and carries ownChunks', () => {
    const list: SharedDepFetchList = {
      units: [HEX64, HEX64_B],
      ownChunks: ['assets/own-a.js', 'https://cdn.test/own-b.js'],
    };
    expect(list.units).toHaveLength(2);
    expect(list.ownChunks).toEqual(['assets/own-a.js', 'https://cdn.test/own-b.js']);
  });

  it('names the lazy-target and pattern-import lists it reaches by key', () => {
    const list: SharedDepFetchList = {
      units: [],
      ownChunks: [],
      lazy: ['./lazy/Panel.js'],
      patterns: ['./locales/en.json.js'],
    };
    expect(list.lazy).toEqual(['./lazy/Panel.js']);
    expect(list.patterns).toEqual(['./locales/en.json.js']);
  });

  it('closes over every imported edge — each is answered by a unit of the table', () => {
    const table: SharedDepUnit[] = [
      { location: 'react.js', contentHash: HEX64_B, answers: ['react'], imports: [] },
      { location: 'a.js', contentHash: HEX64, answers: ['a'], imports: ['react', 'b', { unit: HEX64_C }] },
      { location: 'b.js', contentHash: HEX64_C, answers: ['b'], imports: [] },
    ];
    const list: SharedDepFetchList = { units: [HEX64, HEX64_B, HEX64_C], ownChunks: [] };
    const answered = new Set(table.flatMap((u) => u.answers));
    const identities = new Set(table.map((u) => u.contentHash));
    for (const hash of list.units) expect(identities.has(hash)).toBe(true);
    for (const unit of table) {
      for (const edge of unit.imports) {
        if (typeof edge === 'string') expect(answered.has(edge)).toBe(true);
        else expect(identities.has(edge.unit)).toBe(true);
      }
    }
  });
});
