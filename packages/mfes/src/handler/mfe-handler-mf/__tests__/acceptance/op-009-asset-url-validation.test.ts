/**
 * Acceptance: OP-009 — shared-file locations (unit table locations) and `metaData.sharedBase` are validated by the same rules
 * as `chunkPath`: protocol-relative `//host`, non-http(s) schemes, and
 * `..` escapes out of the asset base fail the load with `MfeLoadError`
 * before any fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

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

import { newHandler } from '../helpers/registered-manifest';
import { MfeLoadError } from '../../../../errors';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sharedDep,
  listOf,
  unitOf,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifest } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

/** A manifest whose unit table carries a unit at `location`. */
function manifestWithList(location: string, sharedBase?: string): MfManifest {
  const unit = unitOf(location, 'export const r = 1;\n', ['react']);
  return buildManifest([sharedDep('react')], {
    ...(sharedBase !== undefined ? { metaData: { sharedBase } } : {}),
    units: [unit],
    lists: { './lifecycle': listOf([unit]) },
  });
}

async function expectRejected(manifest: MfManifest): Promise<unknown> {
  const router = createFetchRouter({
    [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
    [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: 'export const r = 1;\n' },
  });
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(router as typeof fetch);
  const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
  try {
    const outcome = await handler
      .load(buildEntry(manifest), 'ext-op009')
      .then(() => null, (e: unknown) => e);
    expect(outcome).toBeInstanceOf(MfeLoadError);
    return outcome;
  } finally {
    fetchSpy.mockRestore();
  }
}

describe('acceptance: OP-009 shared-file location validation', () => {
  it('OP-009: a protocol-relative unit location fails the load', async () => {
    await expectRejected(
      manifestWithList('//evil.example.com/react.js'),
    );
  });

  it('OP-009: a unit location climbing out of the asset base fails the load', async () => {
    await expectRejected(manifestWithList('../escape/react.js'));
  });

  it('OP-009: a non-http(s) sharedBase fails the load', async () => {
    await expectRejected(
      manifestWithList('react.js', 'javascript:alert(1)'),
    );
  });

  it('OP-009: a protocol-relative sharedBase fails the load', async () => {
    await expectRejected(
      manifestWithList('react.js', '//evil.example.com/shared/'),
    );
  });

  it('OP-009: a sharedBase containing a backslash or space fails the load', async () => {
    await expectRejected(
      manifestWithList('react.js', 'shared\\evil/'),
    );
    await expectRejected(
      manifestWithList('react.js', 'shared dir/'),
    );
  });

  it('OP-009: a unit location with percent-encoded dot segments fails the load', async () => {
    await expectRejected(
      manifestWithList('shared/%2e%2e/escape/react.js'),
    );
  });

  it('OP-009: a leading-/ location escapes a non-root sharedBase', async () => {
    // Base 'http://localhost:3099/dir/' — '/shared/x' resolves to the
    // origin root, outside the base, so containment rejects it.
    await expectRejected(
      manifestWithList('/shared/react.js', 'http://localhost:3099/dir/'),
    );
  });

  it('OP-009: a sharedBase without trailing slash still contains — /dir-evil/ cannot pass as /dir/', async () => {
    // 'http://localhost:3099/dir' normalizes to '…/dir/'; resolving
    // '../dir-evil/x' climbs to '…/dir-evil/x', which must NOT satisfy a
    // naive '/dir' prefix check.
    await expectRejected(
      manifestWithList('../dir-evil/react.js', 'http://localhost:3099/dir'),
    );
  });

  it('a list naming a content identity the unit table lacks fails the load before any request', async () => {
    const unit = unitOf('shared/react.js', 'export const r = 1;\n', ['react']);
    const missing = unitOf('shared/other.js', 'export const o = 2;\n', ['other']);
    const manifest = buildManifest([sharedDep('react')], {
      units: [unit],
      lists: { './lifecycle': listOf([unit, missing]) },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const error = await newHandler(ENTRY_BASE_ID, { retries: 0 })
        .load(buildEntry(manifest), 'ext-op009-hash')
        .then(() => undefined, (e: unknown) => e);
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
