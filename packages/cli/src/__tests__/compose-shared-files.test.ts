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

describe('groupContributionsByPath (inst-cs-group-by-path)', () => {
  it('groups a template exclusive-subtree file and a region-union shared file by their target path', () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        {
          exclusiveSubtrees: ['template-a/'],
          sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] }],
        },
        [
          { path: 'template-a/index.ts', content: 'export const a = 1;' },
          { path: 'package.json', content: '{}' },
        ],
      ),
    );

    const grouped = groupContributionsByPath(assembly);

    expect(grouped.get('template-a/index.ts')).toEqual([
      { templateName: 'template-a', mergeStrategy: 'exclusive', ownedRegions: [], content: 'export const a = 1;' },
    ]);
    expect(grouped.get('package.json')).toEqual([
      { templateName: 'template-a', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'], content: '{}' },
    ]);
  });

  it('collects multiple contributing templates for the same path into one group', () => {
    const assembly = assemblyOf(
      contribution(
        'template-a',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['a'] }] },
        [{ path: 'package.json', content: 'content-a' }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['b'] }] },
        [{ path: 'package.json', content: 'content-b' }],
      ),
    );

    const grouped = groupContributionsByPath(assembly);

    expect(grouped.get('package.json')).toHaveLength(2);
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
    const content = ['frontx:region not-a-valid-token-without-colon', 'body', 'frontx:endregion not-a-valid-token-without-colon'].join('\n');

    expect(locateAllMarkerBlocks(content)).toEqual({
      blocks: [],
      unlocatable: [{ kind: 'malformed', lineIndex: 0 }],
    });
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
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts-build'] }] },
        [
          {
            path: 'package.json',
            content: [
              '{',
              '  // frontx:region template-a:scripts-build',
              '  "build": "tsup"',
              '  // frontx:endregion template-a:scripts-build',
              '}',
            ].join('\n'),
          },
        ],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts-test'] }] },
        [
          {
            path: 'package.json',
            content: [
              '{',
              '  // frontx:region template-b:scripts-test',
              '  "test": "vitest"',
              '  // frontx:endregion template-b:scripts-test',
              '}',
            ].join('\n'),
          },
        ],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Deterministic order: by owning template identity, then region key.
    const expectedComposed = [
      '  // frontx:region template-a:scripts-build',
      '  "build": "tsup"',
      '  // frontx:endregion template-a:scripts-build',
      '  // frontx:region template-b:scripts-test',
      '  "test": "vitest"',
      '  // frontx:endregion template-b:scripts-test',
    ].join('\n');
    expect(writes).toEqual([{ path: '/target/package.json', content: expectedComposed }]);
    expect(result.files).toEqual([{ path: 'package.json', content: expectedComposed }]);
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
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts-build'] }] },
        [{ path: 'package.json', content: '// frontx:region template-a:scripts-build\nA\n// frontx:endregion template-a:scripts-build' }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts-build'] }] },
        [{ path: 'package.json', content: '// frontx:region template-b:scripts-build\nB\n// frontx:endregion template-b:scripts-build' }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'key-collision') return;
    expect(result.reason).toBe('key-collision');
    expect(result.path).toBe('package.json');
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
          sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['key1', 'key2'] }],
        },
        [
          {
            path: 'package.json',
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
    expect(result.reason).toBe('span-overlap');
    if (result.reason !== 'span-overlap') return;
    expect(result.path).toBe('package.json');
    expect(result.contestants).toEqual(['template-a', 'template-a']);
    expect(result.regionKeys).toEqual(['key1', 'key2']);
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
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['build'] }] },
        [{ path: 'package.json', content: sharedContent }],
      ),
      contribution(
        'template-b',
        { exclusiveSubtrees: [], sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['test'] }] },
        [{ path: 'package.json', content: sharedContent }],
      ),
    );
    const { writeFileFn, writes } = fakeWriter();

    const result = await composeSharedFiles(assembly, '/target', writeFileFn, noExistingFile, noExistingProvenance);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('span-overlap');
    if (result.reason !== 'span-overlap') return;
    expect(result.path).toBe('package.json');
    expect(result.contestants).toEqual(['template-a', 'template-b']);
    expect(result.regionKeys).toEqual(['build', 'test']);
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
    const existingProvenance: ProvenanceRecord[] = [
      { templateIdentity: 'region-fixture-a', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/a@offline' },
    ];
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
    const existingProvenance: ProvenanceRecord[] = [
      { templateIdentity: 'template-a', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/a@offline' },
    ];
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
    const existingProvenance: ProvenanceRecord[] = [
      { templateIdentity: 'template-b', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/b@offline' },
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
    expect(result.reason).toBe('carried-block-conflict');
    if (result.reason !== 'carried-block-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.contestants).toEqual(['template-b', 'template-b']);
    expect(result.regionKeys).toEqual(['shared', 'shared']);
    expect(result.message).toMatch(/hand-edited|corrupted/i);
    expect(writes).toEqual([]);
  });

  it('refuses the assembly, writing no file, when two carried-forward blocks have overlapping on-disk marker spans (inst-cs-if-carried-block-conflict / inst-cs-return-carried-block-conflict, overlap)', async () => {
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
      { templateIdentity: 'template-b', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/b@offline' },
      { templateIdentity: 'template-c', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/c@offline' },
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
    expect(result.reason).toBe('carried-block-conflict');
    if (result.reason !== 'carried-block-conflict') return;
    expect(result.path).toBe('shared.txt');
    expect(result.contestants).toEqual(['template-b', 'template-c']);
    expect(result.regionKeys).toEqual(['shared', 'shared2']);
    expect(result.message).toMatch(/hand-edited|corrupted/i);
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
      { templateIdentity: 'template-a', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/a@offline' },
      { templateIdentity: 'template-b', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/b@offline' },
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
    expect(result.reason).toBe('span-overlap');
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
    const existingProvenance: ProvenanceRecord[] = [
      { templateIdentity: 'identity', scaffoldedFromVersion: '1.0.0', sourceSpec: 'local:x/identity@offline' },
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
