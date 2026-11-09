/**
 * A3 conformance legs: the lazy/pattern delta property, specifier answer
 * uniqueness across an entry's combined lists (re-export chains,
 * namespace imports and `as default` all surface as specifier spellings
 * that exactly one item answers), resolved `{ item }` edges to a parent
 * chain's items, side-effectful barrels shipped whole, and consumer
 * independence — two builds using different subsets of a package emit
 * byte-identical files under that package's directory.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitFormatConformance } from '../UnitFormatConformance';
import type { SharedDepFetchList, SharedDepListItem } from '../fetch-list';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
function dir(): string {
  const d = mkdtempSync(join(tmpdir(), 'ufc-a3-'));
  dirs.push(d);
  return d;
}

/** Write a chunk + list-doc pair into `<pkg>@<version>` of `out`. */
function emitDoc(
  out: string,
  pkgDir: string,
  entryStem: string,
  doc: SharedDepFetchList,
  chunkSources: Record<string, string>,
): void {
  for (const [stem, source] of Object.entries(chunkSources)) {
    const p = join(out, pkgDir, `${stem}.${sha256(source)}.js`);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, source);
  }
  const text = JSON.stringify(doc);
  writeFileSync(join(out, pkgDir, `${entryStem}.list.${sha256(text)}.json`), text);
}

function item(pkgDir: string, stem: string, source: string, answers: string[], imports: SharedDepListItem['imports'] = []): SharedDepListItem {
  const hash = sha256(source);
  return { location: `${pkgDir}/${stem}.${hash}.js`, contentHash: hash, answers, imports };
}

const conformance = new UnitFormatConformance();

describe('A3: lazy/pattern delta property', () => {
  it('accepts a lazy document carrying only what the target needs beyond the parent', () => {
    const a = dir();
    const lazyItem = item('pkg@1.0.0', 'lazy-extra', '// lazy extra\n', ['pkg/lazy-extra']);
    const lazyDoc: SharedDepFetchList = { items: [lazyItem] };
    const lazyText = JSON.stringify(lazyDoc);
    const lazyHash = sha256(lazyText);
    const lazyName = `lazy-extra.list.${lazyHash}.json`;
    emitDoc(a, 'pkg@1.0.0', 'lazy-extra', lazyDoc, { 'lazy-extra': '// lazy extra\n' });
    const main = item('pkg@1.0.0', 'index', '// main\n', ['pkg']);
    const entryDoc: SharedDepFetchList = {
      items: [main],
      lazy: { 'pkg@1.0.0/lazy.js': { location: `pkg@1.0.0/${lazyName}`, contentHash: lazyHash } },
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', entryDoc, { index: '// main\n' });
    const b = dir();
    emitDoc(b, 'pkg@1.0.0', 'lazy-extra', lazyDoc, { 'lazy-extra': '// lazy extra\n' });
    emitDoc(b, 'pkg@1.0.0', 'entry', entryDoc, { index: '// main\n' });
    expect(conformance.check(a, b)).toEqual([]);
  });

  it('flags a lazy document repeating a chunk the parent chain already carries', () => {
    const a = dir();
    const shared = item('pkg@1.0.0', 'shared', '// shared\n', ['pkg/shared']);
    const lazyDoc: SharedDepFetchList = { items: [shared] };
    const lazyText = JSON.stringify(lazyDoc);
    const lazyHash = sha256(lazyText);
    const lazyName = `lazy.list.${lazyHash}.json`;
    emitDoc(a, 'pkg@1.0.0', 'lazy', lazyDoc, { shared: '// shared\n' });
    const entryDoc: SharedDepFetchList = {
      items: [shared, item('pkg@1.0.0', 'index', '// main\n', ['pkg'])],
      lazy: { 'pkg@1.0.0/lazy.js': { location: `pkg@1.0.0/${lazyName}`, contentHash: lazyHash } },
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', entryDoc, { index: '// main\n' });
    const violations = conformance.check(a, a);
    expect(violations.some((v) => v.rule === 'list-completeness' && /delta|already deliver/.test(v.detail))).toBe(true);
  });
});

describe('A3: answer uniqueness across the combined lists', () => {
  it('flags an imported specifier two items of the combined lists both answer (double provision)', () => {
    const a = dir();
    const dupA = item('pkg@1.0.0', 'a', '// a\n', ['dep']);
    const dupB = item('pkg@1.0.0', 'b', '// b\n', ['dep']);
    const importer = item('pkg@1.0.0', 'user', '// user\n', ['pkg/user'], ['dep']);
    const doc: SharedDepFetchList = { items: [dupA, dupB, importer] };
    emitDoc(a, 'pkg@1.0.0', 'entry', doc, { a: '// a\n', b: '// b\n', user: '// user\n' });
    const violations = conformance.check(a, a);
    expect(violations.some((v) => v.rule === 'list-completeness' && /"dep".*exactly one/.test(v.detail))).toBe(true);
  });

  it('flags a specifier answered once by the entry list and again by a lazy delta', () => {
    const a = dir();
    const lazyDup = item('dep@2.0.0', 'index', '// dep\n', ['dep']);
    const lazyDoc: SharedDepFetchList = { items: [lazyDup] };
    const lazyHash = sha256(JSON.stringify(lazyDoc));
    const lazyName = `lazy.list.${lazyHash}.json`;
    emitDoc(a, 'dep@2.0.0', 'lazy', lazyDoc, { index: '// dep\n' });
    const entryDoc: SharedDepFetchList = {
      items: [
        item('pkg@1.0.0', 'index', '// main\n', ['pkg'], ['dep']),
        item('dep@2.0.0', 'index', '// dep\n', ['dep']),
      ],
      lazy: { 'pkg@1.0.0/lazy.js': { location: `dep@2.0.0/${lazyName}`, contentHash: lazyHash } },
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', entryDoc, { index: '// main\n' });
    const violations = conformance.check(a, a);
    expect(violations.some((v) => v.rule === 'list-completeness' && /"dep".*exactly one/.test(v.detail))).toBe(true);
  });
});

describe('A3: barrel edge cases', () => {
  it('a { item } edge resolving to a parent chain item is not a violation', () => {
    const a = dir();
    const leaf = item('pkg@1.0.0', 'leaf', '// leaf\n', ['pkg/leaf']);
    // The lazy doc's item has a resolved edge to the parent's chunk.
    const lazyItem: SharedDepListItem = {
      ...item('pkg@1.0.0', 'lazy', '// lazy\n', ['pkg/lazy']),
      imports: [{ item: leaf.contentHash }],
    };
    const lazyDoc: SharedDepFetchList = { items: [lazyItem] };
    const lazyHash = sha256(JSON.stringify(lazyDoc));
    emitDoc(a, 'pkg@1.0.0', 'lazy', lazyDoc, { lazy: '// lazy\n' });
    const entryDoc: SharedDepFetchList = {
      items: [leaf, item('pkg@1.0.0', 'index', '// main\n', ['pkg'])],
      lazy: { 'pkg@1.0.0/lazy.js': { location: `pkg@1.0.0/lazy.list.${lazyHash}.json`, contentHash: lazyHash } },
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', entryDoc, { leaf: '// leaf\n', index: '// main\n' });
    expect(conformance.check(a, a)).toEqual([]);
  });

  it('re-export chain: every specifier spelling the chain answers lands once', () => {
    const a = dir();
    // index → mid → leaf; a consumer may spell 'pkg', 'pkg/mid' or
    // 'pkg/leaf' — the chain must answer each spelling exactly once.
    const doc: SharedDepFetchList = {
      items: [
        item('pkg@1.0.0', 'index', '// barrel\n', ['pkg'], [{ item: sha256('// mid\n') }]),
        item('pkg@1.0.0', 'mid', '// mid\n', ['pkg/mid'], [{ item: sha256('// leaf\n') }]),
        item('pkg@1.0.0', 'leaf', '// leaf\n', ['pkg/leaf']),
      ],
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', doc, { index: '// barrel\n', mid: '// mid\n', leaf: '// leaf\n' });
    expect(conformance.check(a, a)).toEqual([]);
  });

  it('namespace import: the package specifier is answered once even when a subpath is also delivered', () => {
    const a = dir();
    const doc: SharedDepFetchList = {
      items: [
        item('pkg@1.0.0', 'index', '// barrel\n', ['pkg', 'pkg/ns'], [{ item: sha256('// member\n') }]),
        item('pkg@1.0.0', 'member', '// member\n', ['pkg/member']),
      ],
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', doc, { index: '// barrel\n', member: '// member\n' });
    expect(conformance.check(a, a)).toEqual([]);
  });

  it('as default: a re-exported default binding answers its spelling once', () => {
    const a = dir();
    const doc: SharedDepFetchList = {
      items: [
        item('pkg@1.0.0', 'index', '// barrel\n', ['pkg'], [{ item: sha256('// thing\n') }]),
        item('pkg@1.0.0', 'thing', '// thing\n', ['pkg/thing']),
      ],
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', doc, { index: '// barrel\n', thing: '// thing\n' });
    expect(conformance.check(a, a)).toEqual([]);
  });

  it('side-effectful barrel: the whole entry ships in one chunk answering the root', () => {
    const a = dir();
    // A barrel that cannot be split ships whole — one item answers the
    // package root; no member chunks exist to double-provision it.
    const doc: SharedDepFetchList = {
      items: [item('pkg@1.0.0', 'index', '// barrel with side effects\nconsole.log(1)\n', ['pkg'])],
    };
    emitDoc(a, 'pkg@1.0.0', 'entry', doc, { index: '// barrel with side effects\nconsole.log(1)\n' });
    expect(conformance.check(a, a)).toEqual([]);
  });
});

describe('A3: consumer independence', () => {
  const pkgFiles = (out: string, pkgDir: string, files: Record<string, string>): void => {
    for (const [stem, source] of Object.entries(files)) {
      const p = join(out, pkgDir, `${stem}.${sha256(source)}.js`);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, source);
    }
  };

  it('passes when two builds with different package sets emit identical bytes for the shared package', () => {
    const a = dir();
    const b = dir();
    pkgFiles(a, 'dep@1.0.0', { index: '// dep\n' });
    pkgFiles(a, 'used-a@1.0.0', { index: '// only-a\n' });
    pkgFiles(b, 'dep@1.0.0', { index: '// dep\n' });
    pkgFiles(b, 'used-b@1.0.0', { index: '// only-b\n' });
    expect(conformance.checkConsumerIndependence([a, b])).toEqual([]);
  });

  it('flags a package whose bytes differ between two builds', () => {
    const a = dir();
    const b = dir();
    pkgFiles(a, 'dep@1.0.0', { index: '// dep v-a\n' });
    pkgFiles(b, 'dep@1.0.0', { index: '// dep v-b\n' });
    const violations = conformance.checkConsumerIndependence([a, b]);
    expect(violations.some((v) => v.rule === 'consumer-independence')).toBe(true);
  });

  it('flags a package present in both builds with different file sets', () => {
    const a = dir();
    const b = dir();
    pkgFiles(a, 'dep@1.0.0', { index: '// dep\n', extra: '// extra\n' });
    pkgFiles(b, 'dep@1.0.0', { index: '// dep\n' });
    const violations = conformance.checkConsumerIndependence([a, b]);
    expect(violations.some((v) => v.rule === 'consumer-independence' && /extra/.test(v.file + v.detail))).toBe(true);
  });
});
