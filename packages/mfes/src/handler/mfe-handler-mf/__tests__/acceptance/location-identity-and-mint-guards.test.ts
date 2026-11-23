/**
 * Acceptance: locations are compared by the URL they resolve to
 * (`cpt-frontx-algo-unit-format-contract-fetch-list-schema`,
 * `inst-location-identity`); a minted unit and a whole-package entry take
 * their resolved location for `import.meta.url` while their cached bytes
 * stay as fetched (`inst-umm-meta-url`, `inst-whole-package-meta-url`); a
 * unit that still carries a static relative specifier after its rewrite, or
 * a twin that can never be minted, fails the load with a diagnostic naming
 * the unit (`inst-umm-unresolved-specifiers`); text that only looks like an
 * import is neither rewritten nor taken for a survivor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: stubbedDynamicModuleOps(actual.DynamicModuleOps, blobModuleStub),
  };
});

import { newHandler } from '../helpers/registered-manifest';
import { MfeLoadError } from '../../../../errors';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  listOf,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
  unitOf,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { captureMintedSources, unmintedSpecifiers } from '../helpers/minted-sources';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import { realmSharedDepTextCache, resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import { SharedTextAdmission } from '../../SharedTextAdmission';

beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
});
afterEach(() => {
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

const ENTRY_BODY = 'import { r } from "react";\nexport default { mount() { return r; }, unmount() {} };\n';
const REACT_TEXT = 'export const r = 1;\n';
const REACT = unitOf('shared/react/index.abc.js', REACT_TEXT, ['react']);

const load = (manifest: ReturnType<typeof buildManifest>, id: string) =>
  newHandler(ENTRY_BASE_ID, { retries: 0 }).load(buildEntry(manifest), id);

describe('acceptance: two spellings of one URL are one file', () => {
  it('fetches an own chunk once when the list spells it ./assets/a.js and the entry imports it as ./a.js, and mints it once', async () => {
    const A_TEXT = 'export const a = 1;\n';
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: `import "./a.js";\n${ENTRY_BODY}` },
      [`${PUBLIC_PATH}assets/a.js`]: { body: A_TEXT },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    const manifest = buildManifest([], {
      units: [REACT],
      lists: { './lifecycle': listOf([REACT], { ownChunks: ['./assets/a.js'] }) },
    });
    try {
      await load(manifest, 'ext-spelling');
      expect(router.calls.filter((url) => url.endsWith('assets/a.js'))).toHaveLength(1);
      const sources = await minted.sources();
      expect(sources.filter((source) => source === A_TEXT)).toHaveLength(1);
    } finally {
      minted.restore();
    }
  });

  it('rewrites a relative import between two units located by absolute URLs spelling the default port', async () => {
    const A_TEXT = 'export const a = 1;\n';
    const B_TEXT = 'import { a } from "./a.js";\nexport const b = a;\n';
    const A = unitOf('https://cdn.test:443/shared/a.js', A_TEXT, ['pkg-a']);
    const B = unitOf('https://cdn.test:443/shared/b.js', B_TEXT, ['pkg-b'], [{ unit: A.contentHash }]);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { b } from "pkg-b";\nexport default { mount() { return b; }, unmount() {} };\n',
      },
      'https://cdn.test/shared/a.js': { body: A_TEXT },
      'https://cdn.test/shared/b.js': { body: B_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    const manifest = buildManifest([], {
      units: [A, B],
      lists: { './lifecycle': listOf([A, B]) },
    });
    try {
      await load(manifest, 'ext-default-port');
      const importer = (await minted.sources()).find((source) => source.includes('export const b'));
      expect(importer).toBeDefined();
      expect(unmintedSpecifiers(importer ?? '')).toEqual([]);
    } finally {
      minted.restore();
    }
  });
});

describe('acceptance: import.meta.url of a minted unit is its resolved location', () => {
  const META_TEXT = 'export const icon = new URL("./icon.svg", import.meta.url).href;\n';

  it('replaces it in a list unit while the unit stays cached as fetched', async () => {
    const UNIT = unitOf('shared/ui/index.abc.js', META_TEXT, ['ui']);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { icon } from "ui";\nexport default { mount() { return icon; }, unmount() {} };\n',
      },
      [`${PUBLIC_PATH}shared/ui/index.abc.js`]: { body: META_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    const manifest = buildManifest([], {
      units: [UNIT],
      lists: { './lifecycle': listOf([UNIT]) },
    });
    try {
      await load(manifest, 'ext-unit-meta-url');
      const mintedUnit = (await minted.sources()).find((source) => source.includes('icon.svg'));
      expect(mintedUnit).toContain(JSON.stringify(`${PUBLIC_PATH}shared/ui/index.abc.js`));
      expect(mintedUnit).not.toContain('import.meta.url');
      await expect(
        realmSharedDepTextCache().get(SharedTextAdmission.chunkKey(sha256Hex(META_TEXT))),
      ).resolves.toBe(META_TEXT);
    } finally {
      minted.restore();
    }
  });

  it('replaces it in a whole-package entry while the entry stays cached as fetched', async () => {
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { icon } from "ui";\nexport default { mount() { return icon; }, unmount() {} };\n',
      },
      [`${PUBLIC_PATH}shared/ui.js`]: { body: META_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    const dep = sharedDep('ui', { chunkPath: 'shared/ui.js', contentHash: sha256Hex(META_TEXT) });
    try {
      await load(buildManifest([dep]), 'ext-entry-meta-url');
      const mintedEntry = (await minted.sources()).find((source) => source.includes('icon.svg'));
      expect(mintedEntry).toContain(JSON.stringify(`${PUBLIC_PATH}shared/ui.js`));
      expect(mintedEntry).not.toContain('import.meta.url');
      await expect(
        realmSharedDepTextCache().get(SharedTextAdmission.wholePackageKey('ui', '1.0.0', sha256Hex(META_TEXT))),
      ).resolves.toBe(META_TEXT);
    } finally {
      minted.restore();
    }
  });
});

describe('acceptance: a unit that cannot be minted whole fails the load by name', () => {
  it('fails a unit that still imports a relative specifier no unit supplies, naming the unit and the specifier', async () => {
    const TEXT = 'import { m } from "./missing.js";\nexport const u = m;\n';
    const UNIT = unitOf('shared/u/index.abc.js', TEXT, ['u']);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { u } from "u";\nexport default { mount() { return u; }, unmount() {} };\n',
      },
      [`${PUBLIC_PATH}shared/u/index.abc.js`]: { body: TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const manifest = buildManifest([], { units: [UNIT], lists: { './lifecycle': listOf([UNIT]) } });
    const error = await load(manifest, 'ext-relative-survivor').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    const message = String((error as Error).message);
    expect(message).toContain('shared/u/index.abc.js');
    expect(message).toContain("'./missing.js'");
  });

  it('fails a twin whose edge names a unit the manifest does not carry, instead of reporting that nothing was minted', async () => {
    const TWIN_TEXT = 'import "./sibling.js";\nexport const t = 1;\n';
    const NOWHERE = 'f'.repeat(64);
    // One content identity at two locations whose recorded edges differ: the
    // twins mint per directory, and the first twin's edge has no unit.
    const first = unitOf('shared/one/twin.js', TWIN_TEXT, ['twin'], [{ unit: NOWHERE }]);
    const second = unitOf('shared/two/twin.js', TWIN_TEXT, [], [{ unit: REACT.contentHash }]);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { t } from "twin";\nexport default { mount() { return t; }, unmount() {} };\n',
      },
      [`${PUBLIC_PATH}shared/one/twin.js`]: { body: TWIN_TEXT },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const manifest = buildManifest([], {
      units: [REACT, first, second],
      lists: { './lifecycle': listOf([REACT, first]) },
    });
    const error = await load(manifest, 'ext-twin').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    const message = String((error as Error).message);
    expect(message).toContain('shared/one/twin.js');
    expect(message).toContain(NOWHERE);
    expect(message).not.toContain('minted no blob');
  });
});

describe('acceptance: text that only looks like an import', () => {
  it('rewrites an import whose specifier follows a newline and does not take a string, a comment or a call for an import', async () => {
    const OWN = [
      'import\n"react";',
      'export const NAME = "react";',
      'export function f(x) { return x === "react"; }',
      '// import "react"',
      'const lazy = () => import("react");',
      'export default { mount() {}, unmount() {} };',
      '',
    ].join('\n');
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: OWN },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    const manifest = buildManifest([], { units: [REACT], lists: { './lifecycle': listOf([REACT]) } });
    try {
      await load(manifest, 'ext-lookalikes');
      const entry = (await minted.sources()).find((source) => source.includes('export const NAME'));
      expect(entry).toBeDefined();
      expect(entry).toContain('export const NAME = "react";');
      expect(entry).toContain('x === "react"');
      expect(entry).toContain('// import "react"');
      // The real import, its specifier on the next line, is the one rewritten.
      expect(entry).toMatch(/^import\s*"blob:[^"]+";/);
    } finally {
      minted.restore();
    }
  });
});
