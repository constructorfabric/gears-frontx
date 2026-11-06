/**
 * Acceptance: OP-002 — `lazyChunkRoots` are honoured: a lazy chunk's
 * declared roots reach units the entry never fetched, those units are
 * fetched and minted when the lazy chunk resolves, and the load's unit
 * map is extended — never rewritten.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MfeHandlerMF } from '../../MfeHandlerMF';
import { SharedUnitGraphLoader } from '../../SharedUnitGraphLoader';
import {
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  ENTRY_ID,
  graphSharedDep,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { createFetchRouter, jsResponse } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

/** Hand-built per-load state carrying the shared-dep unit context. */
function buildLoadState(ctx: unknown): {
  blobUrlMap: Map<string, string>;
  inFlight: Map<string, unknown>;
  baseUrl: string;
  entryId: string;
  sharedDepBlobUrls: Map<string, string>;
  entryChunkFilename: string;
  sharedDepUnits?: unknown;
} {
  return {
    blobUrlMap: new Map<string, string>(),
    inFlight: new Map<string, unknown>(),
    baseUrl: PUBLIC_PATH,
    entryId: ENTRY_ID,
    sharedDepBlobUrls: new Map<string, string>(),
    entryChunkFilename: 'assets/lifecycle.js',
    sharedDepUnits: ctx,
  };
}

describe('acceptance: OP-002 lazy chunk reachability', () => {
  it('OP-002: units reached only through lazyChunkRoots are fetched and minted when the lazy chunk resolves', async () => {
    const MAIN_SRC = 'export const main = 1;\n';
    const LAZY_ONLY_SRC = 'export const lazyOnly = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['lazy-only.js'], source: LAZY_ONLY_SRC },
      ],
      'index.js',
      [],
    );
    const dep = graphSharedDep('react', react);
    const manifest = buildManifest([dep], {
      entryRoots: { './lifecycle': ['react'] },
      lazyChunkRoots: { 'assets/lazy.js': ['react/lazy-only'] },
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lazy.js`]: {
        body: 'import "react/lazy-only";\nexport const l = 1;',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${react.unitLocations[1]}`]: { body: LAZY_ONLY_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      const fetchText = (url: string): Promise<string> =>
        fetch(url).then((r) => r.text());
      const loaded = await SharedUnitGraphLoader.loadGraph(
        dep,
        `${PUBLIC_PATH}shared/react.graph.json`,
        fetchText,
        ENTRY_ID,
      );
      const loadState = buildLoadState({
        manifest,
        graphs: [loaded],
        fetchVerified: (url: string) => fetchText(url),
        resolveAssetUrl: (location: string) => `${PUBLIC_PATH}${location}`,
        mintedKeys: new Set<string>(),
        pending: new Map<string, Promise<void>>(),
      });
      const blobUrl = await (
        handler as unknown as {
          resolveLazyChunk: (p: string, s: unknown) => Promise<string>;
        }
      ).resolveLazyChunk('./lazy.js', loadState);
      expect(blobUrl).toMatch(/^blob:/);
      // The lazily reached unit was fetched and its specifier minted.
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${react.unitLocations[1]}`,
      );
      expect(loadState.sharedDepBlobUrls.has('react/lazy-only')).toBe(true);
      void jsResponse;
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
