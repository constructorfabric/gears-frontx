// @cpt-algo:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1
import { describe, it, expect } from 'vitest';
import { composeSharedFiles, groupContributionsByPath, locateAllMarkerBlocks, locateRegionSpan } from '../scaffold/compose-shared-files';
import type { ContributionEntry, ReadProjectFileFn, StagedAssembly } from '../scaffold/types';
import type { OwnershipBoundary } from '../manifest/types';
import type { ProvenanceRecord } from '../provenance/types';

function contribution(
  templateName: string,
  boundaries: OwnershipBoundary,
  files: Array<{ path: string; content: string }>,
): ContributionEntry {
  return { templateName, files, ownershipBoundaries: boundaries };
}

function assemblyOf(...contributions: ContributionEntry[]): StagedAssembly {
  return { contributions };
}

function fakeWriter(): { writeFileFn: (path: string, content: string) => Promise<void>; writes: Array<{ path: string; content: string }> } {
  const writes: Array<{ path: string; content: string }> = [];
  return {
    writes,
    writeFileFn: async (path: string, content: string) => {
      writes.push({ path, content });
    },
  };
}

// No file already on disk at the target path — the fixture below is
// exercising in-memory composition of a fresh assembly, not the
// carry-forward-from-disk path (that is `template-split.pinning.test.ts`'s
// Fixture 7 and the dedicated describe block further down this file).
const noExistingFile: ReadProjectFileFn = async () => null;
const noExistingProvenance: ProvenanceRecord[] = [];

function provenanceWithRegion(templateIdentity: string, path: string, ownedRegions: string[]): ProvenanceRecord {
  return {
    templateIdentity,
    scaffoldedFromVersion: '1.0.0',
    sourceSpec: `local:x/${templateIdentity}@offline`,
    occupiedOwnershipBoundary: JSON.stringify({
      exclusiveSubtrees: [],
      sharedFiles: [{ path, mergeStrategy: 'region-union', ownedRegions }],
    }),
  };
}

describe('groupContributionsByPath (inst-cs-group-by-path)', () => {
  it('groups a template exclusive-subtree file and a region-union shared file by their target path', () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        {
          exclusiveSubtrees: ['template-a/'],
          sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] }],
        },
        [
          { path: 'template-a/index.ts', content: 'export const a = 1;' },
          { path: 'shared.txt', content: '{}' },
        ],
      ),
    );

    const grouped = groupContributionsByPath(assembly);

    expect(grouped.get('template-a/index.ts')).toEqual([
      { templateName: 'template-a', mergeStrategy: 'exclusive', ownedRegions: [], content: 'export const a = 1;' },
    ]);
    expect(grouped.get('shared.txt')).toEqual([
      { templateName: 'template-a', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'], content: '{}' },
    ]);
  });

  it('collects multiple contributing templates for the same path into one group', () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'content-a' }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'content-b' }],
      ),
    );

    const grouped = groupContributionsByPath(assembly);

    expect(grouped.get('shared.txt')).toHaveLength(2);
  });
});

describe('locateAllMarkerBlocks (inst-cs-read-existing-blocks) — raw scanner behavior', () => {
  it('returns no blocks and no unlocatable markers for an empty file', () => {
    expect(locateAllMarkerBlocks('')).toEqual({ blocks: [], unlocatable: [] });
  });

  it('does not deduplicate two blocks sharing the same (identity, regionKey) pair — the caller is responsible for that', () => {
    const content = [
      'frontx:region template-a:shared',
      'first',
      'frontx:endregion template-a:shared',
      'frontx:region template-a:shared',
      'second',
      'frontx:endregion template-a:shared',
    ].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(unlocatable).toEqual([]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      identity: 'template-a',
      regionKey: 'shared',
      span: { beginIndex: 0, endIndex: 2 },
      text: 'frontx:region template-a:shared\nfirst\nfrontx:endregion template-a:shared',
    });
    expect(blocks[1]).toEqual({
      identity: 'template-a',
      regionKey: 'shared',
      span: { beginIndex: 3, endIndex: 5 },
      text: 'frontx:region template-a:shared\nsecond\nfrontx:endregion template-a:shared',
    });
  });

  it('returns nested spans as-is — the inner block fully contained in the outer one', () => {
    const content = [
      'frontx:region template-a:outer',
      'frontx:region template-b:inner',
      'nested',
      'frontx:endregion template-b:inner',
      'frontx:endregion template-a:outer',
    ].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(unlocatable).toEqual([]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].span).toEqual({ beginIndex: 0, endIndex: 4 });
    expect(blocks[1].span).toEqual({ beginIndex: 1, endIndex: 3 });
  });

  it('returns interleaved (partially overlapping) spans as-is', () => {
    const content = [
      'frontx:region template-a:build',
      'buildline',
      'frontx:region template-b:test',
      'testline',
      'frontx:endregion template-a:build',
      'frontx:endregion template-b:test',
    ].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(unlocatable).toEqual([]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].span).toEqual({ beginIndex: 0, endIndex: 4 });
    expect(blocks[1].span).toEqual({ beginIndex: 2, endIndex: 5 });
  });

  it('reports an unterminated begin marker with no matching end marker via `unlocatable`, dropping it from `blocks` (P1-1)', () => {
    const content = ['frontx:region template-a:orphan', 'no end here'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [],
      unlocatable: [{ kind: 'unterminated', lineIndex: 0, identity: 'template-a', regionKey: 'orphan' }],
    });
  });

  it('reports a malformed begin marker whose token carries no identity:key separator via `unlocatable`, dropping it from `blocks` (P1-1)', () => {
    // This fixture's closing line is ALSO an unparseable end-marker token
    // (round-3 P1 fix: a malformed end marker is now reported too, not just
    // a malformed begin marker) — both lines are reported, sorted by line
    // index.
    const content = ['frontx:region not-a-valid-token-without-colon', 'body', 'frontx:endregion not-a-valid-token-without-colon'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [],
      unlocatable: [
        { kind: 'malformed', lineIndex: 0 },
        { kind: 'malformed', lineIndex: 2 },
      ],
    });
  });

  it('reports marker tokens with an empty identity or empty region key as malformed', () => {
    const content = [
      'frontx:region :key',
      'body',
      'frontx:endregion :key',
      'frontx:region identity:',
      'body',
      'frontx:endregion identity:',
    ].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [],
      unlocatable: [
        { kind: 'malformed', lineIndex: 0 },
        { kind: 'malformed', lineIndex: 2 },
        { kind: 'malformed', lineIndex: 3 },
        { kind: 'malformed', lineIndex: 5 },
      ],
    });
  });

  it('reports an orphaned end marker with no matching begin marker via `unlocatable` (review #500 round-3 P1)', () => {
    const content = ['no begin here', 'frontx:endregion template-a:orphan'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [],
      unlocatable: [{ kind: 'orphan-end', lineIndex: 1, identity: 'template-a', regionKey: 'orphan' }],
    });
  });

  it('does not report an end marker as orphaned when it legitimately closes a block (review #500 round-3 P1)', () => {
    const content = ['frontx:region template-a:ok', 'body', 'frontx:endregion template-a:ok'].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(unlocatable).toEqual([]);
    expect(blocks).toHaveLength(1);
  });

  it('reports the SECOND of two begins sharing one key as unterminated — not the sole end marker as orphaned, and not both — when two begins share one end (review #500 round-3 P1)', () => {
    // Two begins for the same identity:key, only one end marker. Nearest-first
    // matching (in on-disk order) lets the FIRST begin claim the only end; the
    // second begin has nothing left to close and is reported unterminated.
    // The end marker DID close a block, so it must never ALSO be reported as
    // orphaned — exactly one `unlocatable` entry, not two.
    const content = [
      'frontx:region template-a:shared',
      'first',
      'frontx:region template-a:shared',
      'second',
      'frontx:endregion template-a:shared',
    ].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].span).toEqual({ beginIndex: 0, endIndex: 4 });
    expect(unlocatable).toEqual([{ kind: 'unterminated', lineIndex: 2, identity: 'template-a', regionKey: 'shared' }]);
  });

  it('reports a malformed end marker whose token carries no identity:key separator via `unlocatable` (review #500 round-3 P1)', () => {
    const content = ['frontx:region template-a:ok', 'body', 'frontx:endregion not-a-valid-token-without-colon'].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    // The well-formed begin marker never finds a matching end — the only end
    // marker on the path is malformed, so it is never a valid close candidate
    // for anything — and is reported unterminated, alongside the malformed
    // end reported separately.
    expect(blocks).toEqual([]);
    expect(unlocatable).toEqual([
      { kind: 'unterminated', lineIndex: 0, identity: 'template-a', regionKey: 'ok' },
      { kind: 'malformed', lineIndex: 2 },
    ]);
  });

  it('locates a marker pair hidden inside an arbitrary-language comment style (HTML)', () => {
    const content = ['<!-- frontx:region template-a:html-block -->', 'body', '<!-- frontx:endregion template-a:html-block -->'].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(unlocatable).toEqual([]);
    expect(blocks).toEqual([
      {
        identity: 'template-a',
        regionKey: 'html-block',
        span: { beginIndex: 0, endIndex: 2 },
        text: content,
      },
    ]);
  });

  it('does not let a declared region key close on another key it prefixes — "scripts" must not be closed by "scripts-dev"\'s end marker (P1-2)', () => {
    const content = [
      'frontx:region identity:scripts',
      'scripts body',
      'frontx:endregion identity:scripts',
      'frontx:region identity:scripts-dev',
      'scripts-dev body',
      'frontx:endregion identity:scripts-dev',
    ].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(unlocatable).toEqual([]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      identity: 'identity',
      regionKey: 'scripts',
      span: { beginIndex: 0, endIndex: 2 },
      text: 'frontx:region identity:scripts\nscripts body\nfrontx:endregion identity:scripts',
    });
    expect(blocks[1]).toEqual({
      identity: 'identity',
      regionKey: 'scripts-dev',
      span: { beginIndex: 3, endIndex: 5 },
      text: 'frontx:region identity:scripts-dev\nscripts-dev body\nfrontx:endregion identity:scripts-dev',
    });
  });

  it('reports the SHORTER key ("scripts") as unterminated, not a false substring match on "scripts-dev"\'s end marker, when only "scripts" is left unclosed (P1-2 inverse case)', () => {
    const content = [
      'frontx:region identity:scripts',
      'scripts body, never closed',
      'frontx:region identity:scripts-dev',
      'scripts-dev body',
      'frontx:endregion identity:scripts-dev',
    ].join('\n');

    const { blocks, unlocatable } = locateAllMarkerBlocks(content);

    expect(blocks).toEqual([
      {
        identity: 'identity',
        regionKey: 'scripts-dev',
        span: { beginIndex: 2, endIndex: 4 },
        text: 'frontx:region identity:scripts-dev\nscripts-dev body\nfrontx:endregion identity:scripts-dev',
      },
    ]);
    expect(unlocatable).toEqual([{ kind: 'unterminated', lineIndex: 0, identity: 'identity', regionKey: 'scripts' }]);
  });
});

describe('locateRegionSpan — known-pair locator (P1-2 substring-match regression)', () => {
  it('does not match a declared region key against another declared key it prefixes on the same buffer', () => {
    const content = [
      'frontx:region identity:scripts',
      'scripts body',
      'frontx:endregion identity:scripts',
      'frontx:region identity:scripts-dev',
      'scripts-dev body',
      'frontx:endregion identity:scripts-dev',
    ].join('\n');

    expect(locateRegionSpan(content, 'identity', 'scripts')).toEqual({ beginIndex: 0, endIndex: 2 });
    expect(locateRegionSpan(content, 'identity', 'scripts-dev')).toEqual({ beginIndex: 3, endIndex: 5 });
  });
});

describe('composeSharedFiles — part 1 (cpt-frontx-algo-cli-scaffolding-compose-shared-files)', () => {
  it('writes a whole-file single-owner exclusive-subtree path directly (inst-cs-foreach-single / inst-cs-write-single)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: ['template-a/'], sharedFiles: [] },
        [{ path: 'template-a/index.ts', content: 'export const a = 1;' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toEqual([{ path: 'template-a/index.ts', content: 'export const a = 1;' }]);
    expect(writes).toEqual([{ path: '/target/template-a/index.ts', content: 'export const a = 1;' }]);
  });

  it('writes a whole-file single-owner declared-exclusive shared-file path directly', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] }] },
        [{ path: 'tsconfig.json', content: '{"compilerOptions":{}}' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    expect(writes).toEqual([{ path: '/target/tsconfig.json', content: '{"compilerOptions":{}}' }]);
  });

  it('enters the region-union loop, extracts each contributor owned region by identity+key sentinel markers, composes the disjoint union, and writes it (inst-cs-foreach-multi / inst-cs-extract-regions / inst-cs-compose-union / inst-cs-write-composed)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts-build'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              '  // frontx:region template-a:scripts-build',
              '  "build": "tsup"',
              '  // frontx:endregion template-a:scripts-build',
            ].join('\n'),
          },
        ],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts-test'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              '  // frontx:region template-b:scripts-test',
              '  "test": "vitest"',
              '  // frontx:endregion template-b:scripts-test',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The first contributor supplies the seed host document; its unmarked
    // skeleton is preserved and the second contributor's absent block is
    // appended deterministically.
    const expectedComposed = [
      '  // frontx:region template-a:scripts-build',
      '  "build": "tsup"',
      '  // frontx:endregion template-a:scripts-build',
      '  // frontx:region template-b:scripts-test',
      '  "test": "vitest"',
      '  // frontx:endregion template-b:scripts-test',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
    expect(result.files).toEqual([{ path: 'shared.txt', content: expectedComposed }]);
  });

  it('composes and writes a single region-union contributor even alone on its path (one contributor case of inst-cs-foreach-multi)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: '.env', mergeStrategy: 'region-union', ownedRegions: ['vars'] }] },
        [
          {
            path: '.env',
            content: '# frontx:region template-a:vars\nFOO=1\n# frontx:endregion template-a:vars',
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedComposed = '# frontx:region template-a:vars\nFOO=1\n# frontx:endregion template-a:vars';
    expect(writes).toEqual([{ path: '/target/.env', content: expectedComposed }]);
    expect(result.files).toEqual([{ path: '.env', content: expectedComposed }]);
  });

  it('returns a materialization-invariant error when an exclusive claim is contested (inst-cs-if-exclusive-contested / inst-cs-return-exclusive-invariant)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] }] },
        [{ path: 'tsconfig.json', content: '{}' }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'tsconfig.json', mergeStrategy: 'region-union', ownedRegions: ['paths'] }] },
        [{ path: 'tsconfig.json', content: '{}' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('exclusive-contested');
    if (result.reason !== 'exclusive-contested') return;
    expect(result.path).toBe('tsconfig.json');
    expect(result.contestants).toEqual(['template-a', 'template-b']);
    expect(writes).toEqual([]);
  });

  it('returns a materialization-invariant error when two contributors resolve the same declared region key (inst-cs-if-key-collision / inst-cs-return-key-invariant)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts-build'] }] },
        [{ path: 'shared.txt', content: '// frontx:region template-a:scripts-build\nA\n// frontx:endregion template-a:scripts-build' }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts-build'] }] },
        [{ path: 'shared.txt', content: '// frontx:region template-b:scripts-build\nB\n// frontx:endregion template-b:scripts-build' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'key-collision') return;
    expect(result.reason).toBe('key-collision');
    expect(result.path).toBe('shared.txt');
    expect(result.regionKey).toBe('scripts-build');
    expect(result.contestants).toEqual(['template-a', 'template-b']);
    expect(writes).toEqual([]);
  });

  it('returns a materialization conflict when a single template declares two owned regions whose marker spans overlap (self-overlap, inst-cs-if-span-overlap / inst-cs-return-span-overlap)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        {
          exclusiveSubtrees: [],
          sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['key1', 'key2'] }],
        },
        [
          {
            path: 'shared.txt',
            content: [
              '// frontx:region template-a:key1',
              'line1',
              '// frontx:region template-a:key2',
              'line2',
              '// frontx:endregion template-a:key1',
              'line3',
              '// frontx:endregion template-a:key2',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    if (result.reason !== 'host-document-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(writes).toEqual([]);
  });

  it('returns a materialization conflict when two different templates extract overlapping marker spans from the same on-disk shared-file buffer (cross-template overlap, inst-cs-if-span-overlap / inst-cs-return-span-overlap)', async () => {
    // Both templates ship the identical canonical shared-file buffer (the
    // realistic case a region-union shared file is authored to be), with the
    // two templates' marker pairs interleaved rather than nested — an
    // authoring bug this check exists to catch.
    const sharedContent = [
      'header',
      '// frontx:region template-a:build',
      'buildline1',
      '// frontx:region template-b:test',
      'testline',
      '// frontx:endregion template-a:build',
      '// frontx:endregion template-b:test',
    ].join('\n');
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['build'] }] },
        [{ path: 'shared.txt', content: sharedContent }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['test'] }] },
        [{ path: 'shared.txt', content: sharedContent }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    if (result.reason !== 'host-document-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(writes).toEqual([]);
  });
});

describe('composeSharedFiles — part 2 (issue #487: reconciling with what is already on disk on `add`)', () => {
  it('carries forward, verbatim, a block owned by a template recorded in provenance but not contributing to this assembly (inst-cs-carry-forward-recorded-blocks)', async () => {
    // Mirrors template-split.pinning.test.ts's Fixture 7: region-fixture-a was
    // seeded earlier (recorded in provenance, not part of THIS add's
    // assembly); region-fixture-b is the only contributor here.
    const onDisk = 'frontx:region region-fixture-a:a\nContent owned by A.\nfrontx:endregion region-fixture-a:a';
    const readProjectFileFn: ReadProjectFileFn = async (path) => (path === '/target/shared.txt' ? onDisk : null);
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('region-fixture-a', 'shared.txt', ['a'])];
    const assembly = assemblyOf(
      contribution(
        'region-fixture-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region region-fixture-b:b\nContent owned by B.\nfrontx:endregion region-fixture-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Deterministic order by identity: region-fixture-a sorts before -b.
    const expectedComposed = [
      'frontx:region region-fixture-a:a',
      'Content owned by A.',
      'frontx:endregion region-fixture-a:a',
      'frontx:region region-fixture-b:b',
      'Content owned by B.',
      'frontx:endregion region-fixture-b:b',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
  });

  it('preserves edited on-disk host-document text even when a contributor carries the original host skeleton', async () => {
    const onDisk = [
      '# developer edited host',
      '',
      'frontx:region template-a:a',
      'old A.',
      'frontx:endregion template-a:a',
      '',
      '# edited footer',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async (path) => (path === '/target/shared.txt' ? onDisk : null);
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [
          {
            path: 'shared.txt',
            content: ['# generated host', '', 'frontx:region template-a:a', 'new A.', 'frontx:endregion template-a:a', '', '# generated footer'].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(writes).toEqual([
      {
        path: '/target/shared.txt',
        content: [
          '# developer edited host',
          '',
          'frontx:region template-a:a',
          'new A.',
          'frontx:endregion template-a:a',
          '',
          '# edited footer',
        ].join('\n'),
      },
    ]);
  });

  it('preserves unmarked host-document text while inserting a newly contributed region block', async () => {
    const onDisk = [
      '# shared host file',
      '',
      'frontx:region region-fixture-a:a',
      'Content owned by A.',
      'frontx:endregion region-fixture-a:a',
      '',
      '# developer-maintained footer',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async (path) => (path === '/target/shared.txt' ? onDisk : null);
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('region-fixture-a', 'shared.txt', ['a'])];
    const assembly = assemblyOf(
      contribution(
        'region-fixture-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region region-fixture-b:b\nContent owned by B.\nfrontx:endregion region-fixture-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedComposed = [
      '# shared host file',
      '',
      'frontx:region region-fixture-a:a',
      'Content owned by A.',
      'frontx:endregion region-fixture-a:a',
      '',
      '# developer-maintained footer',
      'frontx:region region-fixture-b:b',
      'Content owned by B.',
      'frontx:endregion region-fixture-b:b',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
  });

  it('uses a contributing template as the seed host document when no file exists yet, preserving its unmarked text', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [
          {
            path: 'shared.txt',
            content: ['# generated host', 'frontx:region template-a:a', 'A.', 'frontx:endregion template-a:a', '# footer'].join('\n'),
          },
        ],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(writes).toEqual([
      {
        path: '/target/shared.txt',
        content: [
          '# generated host',
          'frontx:region template-a:a',
          'A.',
          'frontx:endregion template-a:a',
          '# footer',
          'frontx:region template-b:b',
          'B.',
          'frontx:endregion template-b:b',
        ].join('\n'),
      },
    ]);
  });

  it('refuses a seed host document with duplicate contributor-owned region keys before extracting contributor regions', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              'frontx:region template-a:a',
              'A1.',
              'frontx:endregion template-a:a',
              'frontx:region template-a:a',
              'A2.',
              'frontx:endregion template-a:a',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    expect(writes).toEqual([]);
  });

  it('refuses a seed host document with overlapping marker spans before writing any file', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              'frontx:region template-a:a',
              'A.',
              'frontx:region template-b:b',
              'B.',
              'frontx:endregion template-a:a',
              'frontx:endregion template-b:b',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when another contributor brings conflicting unmarked host-document text', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: ['# host from A', 'frontx:region template-a:a', 'A.', 'frontx:endregion template-a:a'].join('\n') }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: ['# different host from B', 'frontx:region template-b:b', 'B.', 'frontx:endregion template-b:b'].join('\n') }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    if (result.reason !== 'host-document-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.templateIdentity).toBe('template-b');
    expect(writes).toEqual([]);
  });

  it('drops a stale contributor-owned host marker block that is no longer declared by the incoming template', async () => {
    const onDisk = [
      '# shared host file',
      'frontx:region template-a:old',
      'old generated content',
      'frontx:endregion template-a:old',
      '# footer',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async (path) => (path === '/target/shared.txt' ? onDisk : null);
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('template-a', 'shared.txt', ['old'])];
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['new'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:new\nnew generated content\nfrontx:endregion template-a:new' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(writes).toEqual([
      {
        path: '/target/shared.txt',
        content: [
          '# shared host file',
          '# footer',
          'frontx:region template-a:new',
          'new generated content',
          'frontx:endregion template-a:new',
        ].join('\n'),
      },
    ]);
  });

  it('refuses the assembly, writing no file, when a declared region is missing from the contributing template content', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['missing'] }] },
        [{ path: 'shared.txt', content: 'no declared region marker here' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing-region');
    if (result.reason !== 'missing-region') return;
    expect(result.path).toBe('shared.txt');
    expect(result.templateIdentity).toBe('template-a');
    expect(result.regionKey).toBe('missing');
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when a contributor defines the declared region more than once', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['dup'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              'frontx:region template-a:dup',
              'first',
              'frontx:endregion template-a:dup',
              'frontx:region template-a:dup',
              'second',
              'frontx:endregion template-a:dup',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    if (result.reason !== 'host-document-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.templateIdentity).toBe('template-a');
    expect(result.message).toMatch(/more than one host marker block/);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when a contributor has a nested duplicate declared marker begin', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['dup'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              'frontx:region template-a:dup',
              'first',
              'frontx:region template-a:dup',
              'second',
              'frontx:endregion template-a:dup',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.path).toBe('shared.txt');
    expect(result.kind).toBe('unterminated');
    expect(result.identity).toBe('template-a');
    expect(result.regionKey).toBe('dup');
    expect(result.lineNumber).toBe(3);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when the file on disk carries a block whose owner is neither a contributor nor recorded in provenance (inst-cs-if-unrecorded-block-owner / inst-cs-return-unrecorded-owner)', async () => {
    const onDisk = 'frontx:region mystery-template:x\nUnexplained content.\nfrontx:endregion mystery-template:x';
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unrecorded-owner');
    if (result.reason !== 'unrecorded-owner') return;
    expect(result.path).toBe('shared.txt');
    expect(result.templateIdentity).toBe('mystery-template');
    expect(result.regionKey).toBe('x');
    expect(result.message).not.toMatch(/declares|claims ownership/i);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when an on-disk block uses a recorded identity but an unrecorded region key for this path', async () => {
    const onDisk = 'frontx:region template-a:rogue\nUnarbitrated content.\nfrontx:endregion template-a:rogue';
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('template-a', 'shared.txt', ['recorded'])];
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unrecorded-owner');
    if (result.reason !== 'unrecorded-owner') return;
    expect(result.templateIdentity).toBe('template-a');
    expect(result.regionKey).toBe('rogue');
    expect(writes).toEqual([]);
  });

  it('returns a materialization-invariant error when a carried-forward block and an extracted region resolve the same declared region key under DIFFERENT identities (inst-cs-if-carried-key-collision / inst-cs-return-carried-key-invariant)', async () => {
    // Mirrors the pre-flight conflict check's own region-key-clash comparison
    // (checkAssemblyConflicts, cpt-frontx-algo-cli-scaffolding-conflict-check
    // inst-cc-if-region-key-clash): that check flags two DIFFERENT templates
    // claiming the same region key on the same path — it never requires a
    // shared identity, since two distinct templates never have one. Reached
    // here by calling composeSharedFiles directly with an assembly that
    // never went through the pre-flight check — the invariant scenario this
    // guard exists for: the target's existing provenance already records
    // template-a's claim on key "shared" (carried forward, since template-a
    // does not contribute to THIS assembly), while the incoming template-b
    // claims the SAME key "shared" (extracted from its own installed
    // content). Had this assembly been run through the pre-flight check
    // first, its occupied-boundary comparison would have refused it before
    // any materialization was attempted.
    const onDisk = 'frontx:region template-a:shared\nA content.\nfrontx:endregion template-a:shared';
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('template-a', 'shared.txt', ['shared'])];
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['shared'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:shared\nB content.\nfrontx:endregion template-b:shared' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('carried-key-collision');
    if (result.reason !== 'carried-key-collision') return;
    expect(result.path).toBe('shared.txt');
    expect(result.regionKey).toBe('shared');
    expect(result.contestants).toEqual(['template-a', 'template-b']);
    expect(result.message).toMatch(/template-a/);
    expect(result.message).toMatch(/template-b/);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when two carried-forward blocks share the same (identity, regionKey) pair (inst-cs-if-carried-block-conflict / inst-cs-return-carried-block-conflict, duplicate)', async () => {
    // Both carried blocks are owned by "template-b", recorded in provenance
    // and not a contributor to this assembly — so neither trips
    // inst-cs-if-unrecorded-block-owner — but the on-disk file itself
    // duplicates template-b's "shared" key at two non-overlapping locations,
    // something only hand-editing (or corruption) of the target file could
    // produce.
    const onDisk = [
      'frontx:region template-b:shared',
      'first',
      'frontx:endregion template-b:shared',
      'frontx:region template-b:shared',
      'second',
      'frontx:endregion template-b:shared',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('template-b', 'shared.txt', ['shared'])];
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('carried-block-conflict');
    if (result.reason !== 'carried-block-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.contestants).toEqual(['template-b', 'template-b']);
    expect(result.regionKeys).toEqual(['shared', 'shared']);
    expect(result.message).toMatch(/hand-edited|corrupted/i);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when host marker blocks overlap before carried blocks are trusted', async () => {
    // template-b and template-c are both recorded in provenance and neither
    // contributes to this assembly, so both blocks are eligible to be
    // carried forward — but their marker pairs are interleaved on disk, a
    // condition the pre-flight conflict check never evaluates because it
    // never reads file content, only declared boundaries.
    const onDisk = [
      'header',
      'frontx:region template-b:shared',
      'line1',
      'frontx:region template-c:shared2',
      'line2',
      'frontx:endregion template-b:shared',
      'frontx:endregion template-c:shared2',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [
      provenanceWithRegion('template-b', 'shared.txt', ['shared']),
      provenanceWithRegion('template-c', 'shared.txt', ['shared2']),
    ];
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    if (result.reason !== 'host-document-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.templateIdentity).toBe('template-b');
    expect(result.message).toMatch(/overlapping or nested host marker blocks/i);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when two carried-forward blocks resolve the SAME region key under DIFFERENT identities (inst-cs-if-carried-block-conflict / inst-cs-return-carried-block-conflict, key collision across identities)', async () => {
    // template-a and template-b are both recorded in provenance and neither
    // contributes to this assembly (the incoming contributor is a third
    // template, template-c, claiming an unrelated key) — so neither block
    // trips inst-cs-if-unrecorded-block-owner. Both blocks are well-formed
    // and closed, and their spans do not overlap, so neither the
    // (identity, regionKey)-pair duplicate check nor the span-overlap check
    // above catches this: the region-key namespace is unique per PATH, not
    // per identity (cpt-frontx-algo-cli-scaffolding-conflict-check
    // inst-cc-if-region-key-clash and inst-cs-if-carried-key-collision both
    // key on regionKey alone for exactly this reason), so two different
    // owners resolving the same key "shared" is a conflict regardless of
    // their spans not overlapping.
    const onDisk = [
      'frontx:region template-a:shared',
      'first',
      'frontx:endregion template-a:shared',
      'frontx:region template-b:shared',
      'second',
      'frontx:endregion template-b:shared',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [
      provenanceWithRegion('template-a', 'shared.txt', ['shared']),
      provenanceWithRegion('template-b', 'shared.txt', ['shared']),
    ];
    const assembly = assemblyOf(
      contribution(
        'template-c',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['c'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-c:c\nC.\nfrontx:endregion template-c:c' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('carried-block-conflict');
    if (result.reason !== 'carried-block-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.contestants).toEqual(['template-a', 'template-b']);
    expect(result.regionKeys).toEqual(['shared', 'shared']);
    expect(result.message).toMatch(/template-a/);
    expect(result.message).toMatch(/template-b/);
    expect(result.message).toMatch(/shared/);
    expect(writes).toEqual([]);
  });

  it('writes NO file for any path — including one already composed successfully — when a LATER path in the same assembly is refused (ADR-0032: a refused assembly writes zero files)', async () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        {
          exclusiveSubtrees: [],
          sharedFiles: [
            { path: 'clean.txt', mergeStrategy: 'region-union', ownedRegions: ['ok'] },
            { path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['key1', 'key2'] },
          ],
        },
        [
          { path: 'clean.txt', content: '// frontx:region template-a:ok\nfine\n// frontx:endregion template-a:ok' },
          {
            path: 'shared.txt',
            content: [
              '// frontx:region template-a:key1',
              'line1',
              '// frontx:region template-a:key2',
              'line2',
              '// frontx:endregion template-a:key1',
              'line3',
              '// frontx:endregion template-a:key2',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('host-document-conflict');
    // clean.txt composed without any conflict, ahead of shared.txt in
    // iteration order, yet must NOT have been written once shared.txt's
    // overlap refused the whole assembly.
    expect(writes).toEqual([]);
  });
});

describe('composeSharedFiles — review #500 round-2 P1-1: unlocatable markers on disk are refused, never silently dropped', () => {
  it('refuses the assembly, writing no file, when the file on disk carries an unterminated begin marker (inst-cs-if-malformed-marker / inst-cs-return-malformed-marker)', async () => {
    // "template-a:orphan" opens a region with no matching end marker.
    // Before this fix, `locateAllMarkerBlocks` silently dropped it, so its
    // content vanished from the composed output with no diagnostic — even
    // though "template-a" is a genuine contributor to this assembly.
    const onDisk = ['frontx:region template-a:orphan', 'no end here'].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.path).toBe('shared.txt');
    expect(result.kind).toBe('unterminated');
    expect(result.lineNumber).toBe(1);
    expect(result.identity).toBe('template-a');
    expect(result.regionKey).toBe('orphan');
    // `writes` is populated by `fakeWriter`'s own `writeFileFn` on every call
    // it receives, so an empty array here IS proof `writeFileFn` was never
    // invoked for this refused assembly.
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when the file on disk carries a malformed begin marker with no identity:key separator (inst-cs-if-malformed-marker / inst-cs-return-malformed-marker)', async () => {
    const onDisk = ['frontx:region not-a-valid-token-without-colon', 'body', 'frontx:endregion not-a-valid-token-without-colon'].join(
      '\n',
    );
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.path).toBe('shared.txt');
    expect(result.kind).toBe('malformed');
    expect(result.lineNumber).toBe(1);
    expect(result.identity).toBeUndefined();
    expect(result.regionKey).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when the file on disk carries a marker with an empty identity', async () => {
    const onDisk = ['frontx:region :key', 'body', 'frontx:endregion :key'].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.path).toBe('shared.txt');
    expect(result.kind).toBe('malformed');
    expect(result.lineNumber).toBe(1);
    expect(writes).toEqual([]);
  });
});

describe('composeSharedFiles — review #500 round-2 P1-2: a declared region key must not be closed by another key it prefixes', () => {
  it('resolves both "scripts" and "scripts-dev" correctly when both are well-formed and closed — no false span-overlap, no false refusal', async () => {
    // Both keys are recorded in provenance and NOT contributed by this
    // assembly's own template, so both are carried forward. Before the P1-2
    // fix, "scripts"'s end-marker search would have matched "scripts-dev"'s
    // endregion line via substring containment, corrupting the "scripts"
    // span and leaving "scripts-dev"'s begin marker to falsely appear
    // unterminated (or vice versa depending on iteration order).
    const onDisk = [
      'frontx:region identity:scripts',
      'scripts body',
      'frontx:endregion identity:scripts',
      'frontx:region identity:scripts-dev',
      'scripts-dev body',
      'frontx:endregion identity:scripts-dev',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('identity', 'shared.txt', ['scripts', 'scripts-dev'])];
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedComposed = [
      'frontx:region identity:scripts',
      'scripts body',
      'frontx:endregion identity:scripts',
      'frontx:region identity:scripts-dev',
      'scripts-dev body',
      'frontx:endregion identity:scripts-dev',
      'frontx:region template-a:a',
      'A.',
      'frontx:endregion template-a:a',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
  });

  it('reports the refusal against the truly-unterminated "scripts" key, not a false substring match on "scripts-dev"s end marker', async () => {
    const onDisk = [
      'frontx:region identity:scripts',
      'scripts body, never closed',
      'frontx:region identity:scripts-dev',
      'scripts-dev body',
      'frontx:endregion identity:scripts-dev',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.kind).toBe('unterminated');
    expect(result.identity).toBe('identity');
    expect(result.regionKey).toBe('scripts');
    expect(result.lineNumber).toBe(1);
    expect(writes).toEqual([]);
  });
});

describe('composeSharedFiles — review #500 round-3 P1: orphaned/malformed end markers are refused, never silently dropped', () => {
  it('refuses the assembly, writing no file, when the file on disk carries an orphaned end marker with no matching begin marker', async () => {
    // "template-a:orphan" is an end marker with no preceding begin marker at
    // all. Before this fix, `locateAllMarkerBlocks` only ever scanned for
    // BEGIN markers up front, so this line was never even considered — it
    // silently vanished from the composed output the same way an
    // unterminated begin once did (review #500 round-2 P1-1).
    const onDisk = ['no begin here', 'frontx:endregion template-a:orphan'].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.path).toBe('shared.txt');
    expect(result.kind).toBe('orphan-end');
    expect(result.lineNumber).toBe(2);
    expect(result.identity).toBe('template-a');
    expect(result.regionKey).toBe('orphan');
    // `writes` is populated by `fakeWriter`'s own `writeFileFn` on every call
    // it receives, so an empty array here IS proof `writeFileFn` was never
    // invoked for this refused assembly, not just that `result.ok` is false.
    expect(writes).toEqual([]);
  });

  it('does not refuse when the on-disk file carries only a legitimately-closed marker block (no false orphan-end refusal)', async () => {
    const onDisk = 'frontx:region identity:ok\nbody\nfrontx:endregion identity:ok';
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('identity', 'shared.txt', ['ok'])];
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(writes).toHaveLength(1);
  });

  it('reports the unclosed second begin as unterminated — not the sole end marker as orphaned, and not a double refusal — when two begins share one end', async () => {
    const onDisk = [
      'frontx:region identity:dup',
      'first',
      'frontx:region identity:dup',
      'second',
      'frontx:endregion identity:dup',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    expect(result.kind).toBe('unterminated');
    expect(result.identity).toBe('identity');
    expect(result.regionKey).toBe('dup');
    expect(result.lineNumber).toBe(3);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when the file on disk carries a malformed end marker with no identity:key separator', async () => {
    const onDisk = ['frontx:region identity:ok', 'body', 'frontx:endregion not-a-valid-token-without-colon'].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nB.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-marker-block');
    if (result.reason !== 'malformed-marker-block') return;
    // Sorted by line index — the well-formed begin's "unterminated" defect
    // (line 1) is the earliest defect on the path, reported ahead of the
    // malformed end marker's defect (line 3).
    expect(result.kind).toBe('unterminated');
    expect(result.lineNumber).toBe(1);
    expect(writes).toEqual([]);
  });
});

describe('locateAllMarkerBlocks — review #500 round-4 P2: a marker PREFIX must be followed by a whitespace boundary or end of line', () => {
  it('does not recognize "frontx:regional" as a begin marker at all — it is ordinary text that merely starts with the prefix, not a marker', () => {
    // Before the boundary fix, `indexOf` alone matched the bare prefix
    // characters anywhere in the line, so this ordinary word was misparsed
    // as a marker with token "al" (no colon) and reported `malformed` — which
    // is a materialization refusal (inst-cs-return-malformed-marker). With
    // the boundary check, "regional" continuing past the prefix with no
    // whitespace means this line carries no marker occurrence at all.
    const content = ['before', '// frontx:regional configuration', 'after'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({ blocks: [], unlocatable: [] });
  });

  it('does not recognize "frontx:endregionally" as an end marker at all — same boundary rule applies to the end-marker prefix', () => {
    const content = ['// frontx:endregionally noted', 'more text'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({ blocks: [], unlocatable: [] });
  });

  it('still reports a begin marker as malformed when the prefix has a proper boundary (end of line) but no identity:key token follows it at all', () => {
    // Distinct from the existing "token without a colon" malformed fixture:
    // here the prefix is followed by nothing (end of line, no trailing
    // space or token whatsoever) rather than by a same-word continuation —
    // the boundary check must accept end-of-line as a valid boundary and
    // still classify this as a real, malformed marker.
    const content = ['frontx:region', 'body'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [],
      unlocatable: [{ kind: 'malformed', lineIndex: 0 }],
    });
  });
});

describe('composeSharedFiles — review #500 round-4 P2: prefix-boundary text does not trigger a false materialization refusal', () => {
  it('materializes normally when a shared file merely contains a word starting with the marker prefix, instead of refusing as malformed', async () => {
    const onDisk = ['// frontx:regional configuration', 'kept as-is'].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async () => onDisk;
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-a:a\nA.\nfrontx:endregion template-a:a' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The on-disk "frontx:regional configuration" line carries no marker at
    // all, so it remains host-document text and template-a's freshly extracted
    // region is inserted after it.
    const expectedComposed = ['// frontx:regional configuration', 'kept as-is', 'frontx:region template-a:a', 'A.', 'frontx:endregion template-a:a'].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
  });
});

describe('composeSharedFiles — host-document region order is stable', () => {
  it('preserves authored host-document order for regions already present in the host', async () => {
    // The host document controls placement for marker blocks already present in
    // it. Locale-independent sorting still applies to blocks appended because
    // no host marker exists for them, but it must not reorder an authored host.
    expect('école'.localeCompare('zebra')).toBeLessThan(0);
    expect('école' < 'zebra').toBe(false);

    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['école', 'zebra'] }] },
        [
          {
            path: 'shared.txt',
            content: [
              '// frontx:region template-a:école',
              'accented',
              '// frontx:endregion template-a:école',
              '// frontx:region template-a:zebra',
              'ascii',
              '// frontx:endregion template-a:zebra',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedComposed = [
      '// frontx:region template-a:école',
      'accented',
      '// frontx:endregion template-a:école',
      '// frontx:region template-a:zebra',
      'ascii',
      '// frontx:endregion template-a:zebra',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
  });
});

describe('locateAllMarkerBlocks — review #500 round-5: a real marker further along the SAME line must still be found after an earlier boundary-less occurrence of the bare prefix', () => {
  it('locates a begin marker that follows prefix-colliding prose on the same line ("frontx:regional note; frontx:region prior:k")', () => {
    // The round-4 fix made `parseMarkerLine` stop at the line's FIRST
    // `indexOf` hit and return `undefined` the moment that hit lacks a
    // boundary — so a genuine marker appearing later on the same line, past
    // an earlier same-prefix word, was never reached at all. Regression for
    // review #500 round 5: this must resolve to a located block, not vanish.
    const content = ['// frontx:regional note; frontx:region prior:k', 'content', 'frontx:endregion prior:k'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [
        {
          identity: 'prior',
          regionKey: 'k',
          span: { beginIndex: 0, endIndex: 2 },
          text: content,
        },
      ],
      unlocatable: [],
    });
  });

  it('locates an end marker that follows prefix-colliding prose on the same line ("frontx:endregionally note; frontx:endregion prior:k")', () => {
    const content = ['frontx:region prior:k', 'content', '// frontx:endregionally note; frontx:endregion prior:k'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [
        {
          identity: 'prior',
          regionKey: 'k',
          span: { beginIndex: 0, endIndex: 2 },
          text: content,
        },
      ],
      unlocatable: [],
    });
  });

  it('locates a full block whose begin AND end lines both carry prefix-colliding prose before the real marker — the exact review #500 round-5 repro', () => {
    // Reported effect: `blocks: 0, unlocatable: []` — a correctly-formed
    // block made entirely invisible, neither located nor flagged, so
    // composition silently drops it rather than refusing or carrying it.
    const content = [
      '// frontx:regional note; frontx:region prior:k',
      'content',
      '// frontx:endregionally note; frontx:endregion prior:k',
    ].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [
        {
          identity: 'prior',
          regionKey: 'k',
          span: { beginIndex: 0, endIndex: 2 },
          text: content,
        },
      ],
      unlocatable: [],
    });
  });
});

describe('composeSharedFiles — review #500 round-5: a carried-forward block behind prefix-colliding prose is not silently dropped', () => {
  it('carries the block forward into the composed output instead of losing it', async () => {
    // "prior" is recorded in provenance but does not contribute to this
    // assembly, so its on-disk block must be carried forward verbatim
    // (inst-cs-carry-forward-recorded-blocks) — exactly the path that
    // silently lost this content before the round-5 fix, since the block was
    // never located at all.
    const onDisk = [
      '// frontx:regional note; frontx:region prior:k',
      'Content owned by prior.',
      '// frontx:endregionally note; frontx:endregion prior:k',
    ].join('\n');
    const readProjectFileFn: ReadProjectFileFn = async (path) => (path === '/target/shared.txt' ? onDisk : null);
    const existingProvenance: ProvenanceRecord[] = [provenanceWithRegion('prior', 'shared.txt', ['k'])];
    const assembly = assemblyOf(
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'shared.txt', content: 'frontx:region template-b:b\nContent owned by B.\nfrontx:endregion template-b:b' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, readProjectFileFn, existingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Deterministic order by identity: "prior" sorts before "template-b".
    const expectedComposed = [
      '// frontx:regional note; frontx:region prior:k',
      'Content owned by prior.',
      '// frontx:endregionally note; frontx:endregion prior:k',
      'frontx:region template-b:b',
      'Content owned by B.',
      'frontx:endregion template-b:b',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/shared.txt', content: expectedComposed }]);
  });
});
