/**
 * Acceptance: OP-012 ported to the fetch-list format — the
 * `UnitFormatConformance` list legs: a specifier edge of a delivered
 * package must name an item's `answers`; a resolved `{ item }` edge
 * must resolve to an item on the same list; a `lazy`/`patterns`
 * reference must name a present document of matching hash; and the
 * manifest→`entryLists` leg extends the hash chain to the manifest.
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitFormatConformance } from '../UnitFormatConformance';
import type { SharedDepFetchList, SharedDepListItem } from '../fetch-list';

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');
const sha256File = (file: string): string => sha256(readFileSync(file, 'utf8'));

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

function pair(): { a: string; b: string } {
  const a = mkdtempSync(join(tmpdir(), 'ufc-a-'));
  const b = mkdtempSync(join(tmpdir(), 'ufc-b-'));
  dirs.push(a, b);
  return { a, b };
}

interface ItemSpec {
  /** Module path used to name the chunk file. */
  name: string;
  answers?: string[];
  imports?: SharedDepListItem['imports'];
  /** Chunk source override. */
  source?: string;
}

interface ListSpec {
  pkg: string;
  version: string;
  entry: string;
  items: ItemSpec[];
  /** lazy key → the dependent document's stem name and content. */
  lazy?: Record<string, { stem: string; doc: SharedDepFetchList }>;
}

/** Emit one producer list-model output into `dir`. */
function emit(dir: string, specs: ListSpec[]): void {
  for (const spec of specs) {
    const key = `${spec.pkg}@${spec.version}`;
    const pkgDir = join(dir, key);
    mkdirSync(pkgDir, { recursive: true });
    const items: SharedDepListItem[] = spec.items.map((u) => {
      const source = u.source ?? `// ${u.name} of ${key}\n`;
      const hash = sha256(source);
      const location = `${key}/${u.name.replace(/\.js$/, '')}.${hash}.js`;
      mkdirSync(dirname(join(dir, location)), { recursive: true });
      writeFileSync(join(dir, location), source);
      return {
        location,
        contentHash: hash,
        answers: u.answers ?? [`${spec.pkg}/${u.name}`],
        imports: u.imports ?? [],
      };
    });
    const lazy: Record<string, { location: string; contentHash: string }> = {};
    for (const [k, ref] of Object.entries(spec.lazy ?? {})) {
      const docText = JSON.stringify(ref.doc);
      const docHash = sha256(docText);
      const docName = `${ref.stem}.list.${docHash}.json`;
      writeFileSync(join(pkgDir, docName), docText);
      lazy[k] = { location: `${key}/${docName}`, contentHash: docHash };
    }
    const doc: SharedDepFetchList = {
      items,
      ...(Object.keys(lazy).length > 0 ? { lazy } : {}),
      producer: { name: 'test-producer', version: '1.0.0' },
    };
    const text = JSON.stringify(doc);
    writeFileSync(
      join(pkgDir, `${spec.entry}.list.${sha256(text)}.json`),
      text
    );
  }
}

const conformance = new UnitFormatConformance();

describe('acceptance: OP-012 list-format conformance legs', () => {
  it('accepts a conforming list output: specifier edges answered by item answers', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [
          { name: 'index.js', answers: ['pkg'], imports: ['dep/sub'] },
        ],
      },
      {
        pkg: 'dep',
        version: '2.0.0',
        entry: 'dep',
        items: [{ name: 'sub.js', answers: ['dep/sub', 'dep'] }],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    expect(conformance.check(a, b)).toEqual([]);
  });

  it('OP-012: a specifier edge of a delivered package answered by no item is a list-completeness violation', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [
          { name: 'index.js', answers: ['pkg'], imports: ['dep/missing'] },
        ],
      },
      {
        pkg: 'dep',
        version: '2.0.0',
        entry: 'dep',
        items: [{ name: 'index.js', answers: ['dep'] }],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    const violations = conformance.check(a, b);
    expect(
      violations.some(
        (v) =>
          v.rule === 'list-completeness' && /dep\/missing/.test(v.detail)
      )
    ).toBe(true);
  });

  it('OP-012: a specifier edge whose package is not delivered keeps its native edge', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [
          {
            name: 'index.js',
            answers: ['pkg'],
            imports: ['optional-peer/feature', 'node:fs'],
          },
        ],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    expect(conformance.check(a, b)).toEqual([]);
  });

  it('OP-012: a resolved { item } edge to no list item is a list-completeness violation', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [
          {
            name: 'index.js',
            answers: ['pkg'],
            imports: [{ item: 'f'.repeat(64) }],
          },
        ],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    const violations = conformance.check(a, b);
    expect(violations.some((v) => v.rule === 'list-completeness')).toBe(true);
  });

  it('OP-012: a { item } edge resolved to a non-first item is not a violation', () => {
    const { a, b } = pair();
    const targetText = '// target\n';
    const targetHash = sha256(targetText);
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [
          {
            name: 'index.js',
            answers: ['pkg'],
            imports: [{ item: targetHash }],
          },
          { name: 'a/x.js', source: targetText, answers: ['pkg/a/x.js'] },
        ],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    expect(
      conformance.check(a, b).filter((v) => v.rule === 'list-completeness')
    ).toEqual([]);
  });

  it('OP-012: a lazy reference naming a missing document is a hash-chain violation', () => {
    const { a, b } = pair();
    const good: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [{ name: 'index.js', answers: ['pkg'] }],
        lazy: {
          'pkg@1.0.0/index.x.js': {
            stem: 'lazy-index',
            doc: { items: [] },
          },
        },
      },
    ];
    emit(a, good);
    emit(b, good);
    expect(conformance.check(a, b)).toEqual([]);
    // A second list referencing a document that does not exist.
    const corrupt: SharedDepFetchList = {
      items: [],
      lazy: {
        'pkg@1.0.0/gone.js': {
          location: `pkg@1.0.0/gone.list.${'0'.repeat(64)}.json`,
          contentHash: '0'.repeat(64),
        },
      },
    };
    const text = JSON.stringify(corrupt);
    const name = `corrupt.list.${sha256(text)}.json`;
    writeFileSync(join(a, 'pkg@1.0.0', name), text);
    writeFileSync(join(b, 'pkg@1.0.0', name), text);
    const violations = conformance.check(a, b);
    expect(
      violations.some((v) => v.rule === 'hash-chain' && /gone/.test(v.detail))
    ).toBe(true);
  });

  it('OP-012: a list item naming a missing chunk file is a hash-chain violation', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [{ name: 'index.js', answers: ['pkg'] }],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    const corrupt: SharedDepFetchList = {
      items: [
        {
          location: `pkg@1.0.0/nowhere.${'0'.repeat(64)}.js`,
          contentHash: '0'.repeat(64),
          answers: ['pkg'],
          imports: [],
        },
      ],
    };
    const text = JSON.stringify(corrupt);
    const name = `bad.list.${sha256(text)}.json`;
    writeFileSync(join(a, 'pkg@1.0.0', name), text);
    writeFileSync(join(b, 'pkg@1.0.0', name), text);
    const violations = conformance.check(a, b);
    expect(
      violations.some(
        (v) => v.rule === 'hash-chain' && /nowhere/.test(v.detail)
      )
    ).toBe(true);
  });

  it('OP-012: a supplied manifest extends the hash chain to manifest→entryLists', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'expose-lifecycle',
        items: [{ name: 'index.js', answers: ['pkg'] }],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    const listName = readdirSync(join(a, 'pkg@1.0.0')).find((f) =>
      f.startsWith('expose-lifecycle.list.')
    ) as string;
    const location = `pkg@1.0.0/${listName}`;
    const good = join(a, 'mfe-manifest.json');
    writeFileSync(
      good,
      JSON.stringify({
        metaData: { sharedBase: a },
        entryLists: {
          './lifecycle': {
            location,
            contentHash: sha256File(join(a, location)),
          },
        },
      })
    );
    expect(
      conformance.check(a, b, good).filter((v) => v.rule === 'hash-chain')
    ).toEqual([]);
    const bad = join(a, 'mfe-manifest-bad.json');
    writeFileSync(
      bad,
      JSON.stringify({
        metaData: { sharedBase: a },
        entryLists: {
          './lifecycle': { location, contentHash: '0'.repeat(64) },
        },
      })
    );
    expect(
      conformance
        .check(a, b, bad)
        .some((v) => v.rule === 'hash-chain' && /lifecycle/.test(v.detail))
    ).toBe(true);
  });

  it('OP-012/RF-008: a manifest that is not parseable produces a violation', () => {
    const { a, b } = pair();
    const specs: ListSpec[] = [
      {
        pkg: 'pkg',
        version: '1.0.0',
        entry: 'pkg',
        items: [{ name: 'index.js' }],
      },
    ];
    emit(a, specs);
    emit(b, specs);
    const manifestPath = join(a, 'mfe-manifest.json');
    writeFileSync(manifestPath, 'not json {{{');
    const violations = conformance.check(a, b, manifestPath);
    expect(
      violations.some(
        (v) => v.rule === 'list-format' && /parseable/.test(v.detail)
      )
    ).toBe(true);
  });
});
