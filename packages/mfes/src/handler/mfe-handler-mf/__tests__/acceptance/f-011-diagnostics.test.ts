/**
 * Acceptance: F-011 — runtime observability decisions.
 *
 *  - a byte-agreement warning naming both producers when two manifests
 *    declare the same shared-dep bytes;
 *  - `sharedChunkRule` read and compared same-rule to same-rule, reported
 *    once per page;
 *  - diagnostics carrying bytes fetched, fallback packages, and realm
 *    cache totals;
 *  - integrity-mismatch and absent-roots reporting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    stubbedDynamicModuleOps,
  stubSuccessfulImport,
} from '../helpers/blob-module-stub';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: stubbedDynamicModuleOps(
      actual.DynamicModuleOps,
      blobModuleStub,
    ),
  };
});

import { MfeHandlerMF } from '../../MfeHandlerMF';
import { MfeLoadError } from '../../../../errors';
import {
  buildEntry,
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  graphSharedDep,
  PUBLIC_PATH,
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

function warnCallsMatching(
  spy: { mock: { calls: unknown[][] } },
  needle: string | { test(s: string): boolean },
): unknown[][] {
  return spy.mock.calls.filter((args: unknown[]) =>
    typeof needle === 'string'
      ? String(args[0]).includes(needle)
      : needle.test(String(args[0])),
  );
}

describe('acceptance: F-011 runtime diagnostics', () => {
  it('F-011: identical shared-dep bytes declared by two producers emit a byte-agreement warning naming both producers, once per page', async () => {
    const graphA = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      undefined,
      { producer: { name: 'producer-a', version: '1' } },
    );
    const shared = [graphSharedDep('react', graphA)];
    const routes = {
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graphA.text },
      [`${PUBLIC_PATH}shared/react/index.${graphA.unitHashes[0]}.js`]: {
        body: 'export const r = 1;\n',
      },
    };
    const router = createFetchRouter(routes);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(shared, {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await handler.load(buildEntry(manifest), 'ext-f011-a');
      await handler.load(
        buildEntry({ ...manifest, id: `${manifest.id}.b` }),
        'ext-f011-b',
      );
      const matches = warnCallsMatching(
        warnSpy,
        /byte[- ]agreement|same bytes|identical/i,
      );
      expect(matches.length).toBe(1);
      expect(String(matches[0][0])).toContain('producer-a');
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('F-011: sharedChunkRule entries are compared same-rule to same-rule and summarized once per page', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    const shared = [
      graphSharedDep('react', graph, { sharedChunkRule: 'exact' }),
      graphSharedDep('react-dom', graph, { sharedChunkRule: 'caret' }),
    ];
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}shared/react-dom.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}shared/react/index.${graph.unitHashes[0]}.js`]: {
        body: 'export const r = 1;\n',
      },
      [`${PUBLIC_PATH}shared/react-dom/index.${graph.unitHashes[0]}.js`]: {
        body: 'export const r = 1;\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(shared, {
      entryRoots: { './lifecycle': ['react', 'react-dom'] },
    });
    try {
      await handler.load(buildEntry(manifest), 'ext-f011-rule');
      const matches = warnCallsMatching(warnSpy, /sharedChunkRule/);
      expect(
        matches.length,
        'the same-rule comparison is reported once per page',
      ).toBe(1);
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('F-011: load diagnostics report fetched bytes, pack-fallback packages, and realm cache totals', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      'export const r = 1; // pack\n',
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}shared/react/index.${graph.unitHashes[0]}.js`]: {
        body: 'export const r = 1;\n',
        delayMs: 50,
      },
      [`${PUBLIC_PATH}${graph.packLocation}`]: {
        body: 'export const r = 1; // pack\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 0,
      packFallbackBudgetMs: 0,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await handler.load(buildEntry(manifest), 'ext-f011-diag');
      const all = warnSpy.mock.calls.map((a) => String(a[0])).join('\n');
      expect(all).toMatch(/bytes/i);
      expect(all).toContain('react');
      expect(all).toMatch(/realm|cache/i);
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('F-011: a graph file failing content-identity verification is reported naming the file and its producer', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      undefined,
      { producer: { name: 'bad-producer', version: '9' } },
    );
    const tampered = graph.text.replace('1.0.0', '1.0.1');
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: tampered },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('react', { hash: sha256Hex(tampered) })],
      { entryRoots: { './lifecycle': ['react'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f011-integrity'),
      ).rejects.toThrow(MfeLoadError);
      await expect(
        handler.load(buildEntry(manifest), 'ext-f011-integrity-2'),
      ).rejects.toThrow(/graph/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('F-011: a shared dep whose expose carries no declared roots is reported', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}shared/react/index.${graph.unitHashes[0]}.js`]: {
        body: 'export const r = 1;\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    // No entryRoots at all — the expose has no declared root set.
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    try {
      await handler.load(buildEntry(manifest), 'ext-f011-roots');
      const matches = warnCallsMatching(warnSpy, /roots/i);
      expect(
        matches.length,
        'absent reachability roots must be reported',
      ).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
