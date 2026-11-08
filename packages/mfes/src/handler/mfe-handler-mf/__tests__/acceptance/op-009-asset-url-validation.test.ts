/**
 * Acceptance: OP-009 — shared-file locations (fetch-list documents,
 * list items) and `metaData.sharedBase` are validated by the same rules
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

import { MfeHandlerMF } from '../../MfeHandlerMF';
import { MfeLoadError } from '../../../../errors';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifest } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const LIST_DOC = JSON.stringify({
  items: [
    {
      location: 'shared/react/index.abc.js',
      contentHash: sha256Hex('export const r = 1;\n'),
      answers: ['react'],
      imports: [],
    },
  ],
});

/** A manifest whose entry list ref carries `location`. */
function manifestWithList(location: string, sharedBase?: string): MfManifest {
  return buildManifest([sharedDep('react')], {
    ...(sharedBase !== undefined ? { metaData: { sharedBase } } : {}),
    entryLists: {
      './lifecycle': { location, contentHash: sha256Hex(LIST_DOC) },
    },
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
  const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
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
  it('OP-009: a protocol-relative list location fails the load', async () => {
    await expectRejected(
      manifestWithList('//evil.example.com/react.list.json'),
    );
  });

  it('OP-009: a list location climbing out of the asset base fails the load', async () => {
    await expectRejected(manifestWithList('../escape/react.list.json'));
  });

  it('OP-009: a non-http(s) sharedBase fails the load', async () => {
    await expectRejected(
      manifestWithList('react.list.json', 'javascript:alert(1)'),
    );
  });

  it('OP-009: a protocol-relative sharedBase fails the load', async () => {
    await expectRejected(
      manifestWithList('react.list.json', '//evil.example.com/shared/'),
    );
  });

  it('OP-009: a sharedBase containing a backslash or space fails the load', async () => {
    await expectRejected(
      manifestWithList('react.list.json', 'shared\\evil/'),
    );
    await expectRejected(
      manifestWithList('react.list.json', 'shared dir/'),
    );
  });

  it('OP-009: a list location with percent-encoded dot segments fails the load', async () => {
    await expectRejected(
      manifestWithList('shared/%2e%2e/escape/react.list.json'),
    );
  });

  it('OP-009: a leading-/ location escapes a non-root sharedBase', async () => {
    // Base 'http://localhost:3099/dir/' — '/shared/x' resolves to the
    // origin root, outside the base, so containment rejects it.
    await expectRejected(
      manifestWithList('/shared/react.list.json', 'http://localhost:3099/dir/'),
    );
  });

  it('OP-009: a sharedBase without trailing slash still contains — /dir-evil/ cannot pass as /dir/', async () => {
    // 'http://localhost:3099/dir' normalizes to '…/dir/'; resolving
    // '../dir-evil/x' climbs to '…/dir-evil/x', which must NOT satisfy a
    // naive '/dir' prefix check.
    await expectRejected(
      manifestWithList('../dir-evil/react.list.json', 'http://localhost:3099/dir'),
    );
  });
});
