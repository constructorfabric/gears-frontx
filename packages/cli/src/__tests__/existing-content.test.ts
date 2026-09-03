// @cpt-algo:cpt-frontx-algo-cli-scaffolding-existing-content:p1
import { describe, expect, it } from 'vitest';
import { reconcileExistingContent } from '../scaffold/existing-content';
import { computeExclusionRoots } from '../scaffold/effective-ownership';
import type { ContentItem } from '../scaffold/types';
import type { ReadExistingContentFn, ReadInstalledContentFn } from '../scaffold/existing-content';

function fakeReadInstalledContent(items: ContentItem[]): ReadInstalledContentFn {
  return async () => items;
}

function fakeReadExistingContent(items: ContentItem[]): ReadExistingContentFn {
  return async () => items;
}

describe('reconcileExistingContent', () => {
  it('reports all three partitions empty when nothing pre-exists', async () => {
    const roots = computeExclusionRoots({ target: 'packages/app', excludedSubtrees: [], projectOwnedRoots: [] });

    const result = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([{ path: 'src/index.ts', content: 'export {};' }]),
      readExistingContent: fakeReadExistingContent([]),
    });

    expect(result).toEqual({ identicalFiles: [], contentConflicts: [], additionalPaths: [] });
  });

  it('classifies a payload path whose on-disk content matches exactly as identicalFiles', async () => {
    const roots = computeExclusionRoots({ target: 'packages/app', excludedSubtrees: [], projectOwnedRoots: [] });

    const result = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([{ path: 'src/index.ts', content: 'export {};' }]),
      readExistingContent: fakeReadExistingContent([{ path: 'packages/app/src/index.ts', content: 'export {};' }]),
    });

    expect(result.identicalFiles).toEqual(['packages/app/src/index.ts']);
    expect(result.contentConflicts).toEqual([]);
    expect(result.additionalPaths).toEqual([]);
  });

  it('classifies a payload path whose on-disk content differs as contentConflicts', async () => {
    const roots = computeExclusionRoots({ target: 'packages/app', excludedSubtrees: [], projectOwnedRoots: [] });

    const result = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([{ path: 'src/index.ts', content: 'export {};' }]),
      readExistingContent: fakeReadExistingContent([{ path: 'packages/app/src/index.ts', content: 'hand-edited' }]),
    });

    expect(result.contentConflicts).toEqual(['packages/app/src/index.ts']);
    expect(result.identicalFiles).toEqual([]);
    expect(result.additionalPaths).toEqual([]);
  });

  it('classifies an on-disk file outside the payload but inside effective ownership as additionalPaths', async () => {
    const roots = computeExclusionRoots({ target: 'packages/app', excludedSubtrees: [], projectOwnedRoots: [] });

    const result = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([{ path: 'src/index.ts', content: 'export {};' }]),
      readExistingContent: fakeReadExistingContent([
        { path: 'packages/app/src/index.ts', content: 'export {};' },
        { path: 'packages/app/README.md', content: '# hand-written notes' },
      ]),
    });

    expect(result.additionalPaths).toEqual(['packages/app/README.md']);
    expect(result.identicalFiles).toEqual(['packages/app/src/index.ts']);
    expect(result.contentConflicts).toEqual([]);
  });

  // The algorithm's input is already SCOPED to the target's effective
  // ownership area (`cpt-frontx-dod-cli-scaffolding-existing-content-
  // protocol`'s own text) — a seam that over-reports beyond that scope (an
  // adapter enumerating wider than strictly necessary, or a fake standing
  // in for one) must never leak a result into any partition. Exercised on
  // BOTH sides: an existing-disk item outside the target entirely, and a
  // payload item that would land inside a declared `excludedSubtrees` entry.
  it('never reports a path outside the target\'s effective ownership, on either side', async () => {
    const roots = computeExclusionRoots({
      target: 'packages/app',
      excludedSubtrees: ['vendor/'],
      projectOwnedRoots: [],
    });

    const result = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([
        { path: 'src/index.ts', content: 'export {};' },
        // Lands inside the template's own declared excludedSubtrees entry —
        // ground reserved for a nested template, never this payload's own.
        { path: 'vendor/lib.js', content: 'vendored' },
      ]),
      readExistingContent: fakeReadExistingContent([
        { path: 'packages/app/src/index.ts', content: 'export {};' },
        // Outside the target entirely — a sibling package, not this target.
        { path: 'packages/other/index.ts', content: 'unrelated' },
      ]),
    });

    expect(result.identicalFiles).toEqual(['packages/app/src/index.ts']);
    expect(result.contentConflicts).toEqual([]);
    expect(result.additionalPaths).toEqual([]);
  });

  // `target` may legitimately be `.`, the project root
  // (`cpt-frontx-algo-cli-scaffolding-delete-plan`'s own text uses exactly
  // this example) — `effective-ownership.ts`'s root handling must be honored
  // here too: a payload path re-roots to itself (not `./readme.md`), and
  // `.frontx`/reserved environment entries are still unconditionally excluded.
  it('reconciles correctly when the target is "." (the project root)', async () => {
    const roots = computeExclusionRoots({ target: '.', excludedSubtrees: [], projectOwnedRoots: [] });

    const result = await reconcileExistingContent({
      target: '.',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([
        { path: 'README.md', content: '# hello' },
        { path: 'src/index.ts', content: 'export {};' },
      ]),
      readExistingContent: fakeReadExistingContent([
        { path: 'README.md', content: '# hello' },
        { path: 'src/index.ts', content: 'different content' },
        { path: 'notes.md', content: 'extra' },
        // Unconditionally reserved — must never surface in any partition.
        { path: '.frontx/project.json', content: '{}' },
        { path: '.git/config', content: 'core' },
      ]),
    });

    expect(result.identicalFiles).toEqual(['README.md']);
    expect(result.contentConflicts).toEqual(['src/index.ts']);
    expect(result.additionalPaths).toEqual(['notes.md']);
  });

  // Regression (defect confirmed on a live run): `computePayloadSet` used to
  // filter ONLY by effective ownership, which subtracts `.frontx` but not
  // the template's own manifest — so a `frontx-template.json` already
  // present in the target used to be reported as `identicalFiles` or
  // `contentConflicts` on the payload's behalf. `isTemplatePayloadPath`
  // (`../manifest/types.ts`) now excludes the manifest from the payload
  // side before either partition is computed, at both a non-`.` target and
  // a nested one — the hazard the fix brief calls out: a target named `sub`
  // re-roots the manifest as `sub/frontx-template.json`, so the exclusion
  // must be applied to the still-template-relative path, before re-rooting.
  it('never treats the template\'s own manifest path as payload, so a pre-existing frontx-template.json is neither identicalFiles nor contentConflicts', async () => {
    const roots = computeExclusionRoots({ target: 'packages/app', excludedSubtrees: [], projectOwnedRoots: [] });

    const matching = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([
        { path: 'src/index.ts', content: 'export {};' },
        { path: 'frontx-template.json', content: '{"name":"my-template"}' },
      ]),
      readExistingContent: fakeReadExistingContent([
        { path: 'packages/app/src/index.ts', content: 'export {};' },
        // On disk already, byte-identical to what the payload would carry
        // for this path — must still never be reported as identicalFiles
        // "on the payload's behalf".
        { path: 'packages/app/frontx-template.json', content: '{"name":"my-template"}' },
      ]),
    });

    expect(matching.identicalFiles).toEqual(['packages/app/src/index.ts']);
    expect(matching.contentConflicts).toEqual([]);
    expect(matching.additionalPaths).toEqual(['packages/app/frontx-template.json']);

    const differing = await reconcileExistingContent({
      target: 'packages/app',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([
        { path: 'src/index.ts', content: 'export {};' },
        { path: 'frontx-template.json', content: '{"name":"my-template"}' },
      ]),
      readExistingContent: fakeReadExistingContent([
        { path: 'packages/app/src/index.ts', content: 'export {};' },
        // On disk already, DIFFERING from what the payload would carry —
        // must never be reported as a contentConflict "on the payload's
        // behalf" either.
        { path: 'packages/app/frontx-template.json', content: '{"name":"something-else"}' },
      ]),
    });

    expect(differing.contentConflicts).toEqual([]);
    expect(differing.identicalFiles).toEqual(['packages/app/src/index.ts']);
    expect(differing.additionalPaths).toEqual(['packages/app/frontx-template.json']);
  });

  // Same regression, for a NESTED target — proves the manifest exclusion is
  // applied to the still-template-relative path (`item.path`) BEFORE
  // `joinUnderTarget` re-roots it, not to the already-re-rooted
  // project-relative path: a naive comparison against the bare
  // `MANIFEST_FILENAME` after re-rooting would never match
  // `sub/dir/frontx-template.json`.
  it('never treats the manifest path as payload for a nested (non-".") target either', async () => {
    const roots = computeExclusionRoots({ target: 'sub/dir', excludedSubtrees: [], projectOwnedRoots: [] });

    const result = await reconcileExistingContent({
      target: 'sub/dir',
      exclusionRoots: roots,
      installedContentPath: '/inventory/my-template',
      readInstalledContent: fakeReadInstalledContent([
        { path: 'src/index.ts', content: 'export {};' },
        { path: 'frontx-template.json', content: '{"name":"my-template"}' },
      ]),
      readExistingContent: fakeReadExistingContent([
        { path: 'sub/dir/src/index.ts', content: 'export {};' },
        { path: 'sub/dir/frontx-template.json', content: '{"name":"my-template"}' },
      ]),
    });

    expect(result.identicalFiles).toEqual(['sub/dir/src/index.ts']);
    expect(result.contentConflicts).toEqual([]);
    expect(result.additionalPaths).toEqual(['sub/dir/frontx-template.json']);
  });
});
