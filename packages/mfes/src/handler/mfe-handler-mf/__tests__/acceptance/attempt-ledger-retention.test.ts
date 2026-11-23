/**
 * Acceptance: once a load attempt settles, its record of the source-text
 * entries it waited on holds nothing and accepts nothing, so the per-load
 * state that the lazy-loader registry keeps reachable for the page lifetime
 * retains no fetched source text, including for a lazy chunk resolved after
 * the load settled (`inst-lto-drop-record-on-settle`).
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
import { AttemptSourceTextLedger } from '../../AttemptSourceTextLedger';
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
} from '../helpers/manifest-builder';
import { jsResponse } from '../helpers/fetch-router';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
});
afterEach(() => {
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

describe('attempt ledger retention', () => {
  it('retains no entry after the load settles, including across a later lazy chunk resolution', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((
      input: string | URL | Request,
    ) => {
      const url = String(input);
      if (url.endsWith('lifecycle.js')) {
        return Promise.resolve(
          jsResponse("export const l = () => __frontx_lazy('./lazy.js');"),
        );
      }
      if (url.endsWith('lazy.js')) {
        return Promise.resolve(jsResponse('export const z = 1;'));
      }
      return Promise.reject(new TypeError(`unmocked fetch: ${url}`));
    }) as typeof fetch);

    const ledgers = new Set<AttemptSourceTextLedger>();
    const record = AttemptSourceTextLedger.prototype.record;
    let recordCalls = 0;
    vi.spyOn(AttemptSourceTextLedger.prototype, 'record').mockImplementation(
      function (this: AttemptSourceTextLedger, ...args) {
        ledgers.add(this);
        record.apply(this, args);
        recordCalls += 1;
      },
    );
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');

    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    await handler.load(
      buildEntry(buildManifest([])),
      'ext-ledger-retention',
    );

    // The attempt did record its waited-on entry while it was in flight, so
    // the emptiness asserted below is not vacuous.
    expect(recordCalls).toBeGreaterThan(0);
    expect(ledgers.size).toBe(1);
    const [ledger] = [...ledgers];
    // The registry keeps the load's resolver, and through it the per-load
    // state, for the page lifetime; resolving a lazy chunk now records into
    // nothing.
    expect(register).toHaveBeenCalledTimes(1);
    const resolver = register.mock.calls[0][0];
    const lazyUrl = await resolver('./lazy.js');
    expect(lazyUrl).toMatch(/^blob:/);

    // A ledger that still held an unsettled entry, from the load or from the
    // lazy chunk, would evict it from its cache on release; this one holds
    // nothing, and takes nothing further.
    const cache = new Map<string, Promise<string>>();
    const hung = new Promise<string>(() => {});
    cache.set('after-settle', hung);
    ledger.record(cache, 'after-settle', hung);
    ledger.release();
    expect(cache.get('after-settle')).toBe(hung);
  });
});
