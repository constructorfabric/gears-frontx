/**
 * Acceptance: once a load attempt has been released on timeout or has
 * failed, the work it abandoned issues no further request and publishes
 * nothing — its chain build is failed, `fetchSourceText` answers from the
 * cache or refuses, and a listed own chunk is not requested
 * (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-no-cancel`,
 * `inst-lto-release-abandoned-source-text`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MfeLoadError } from '../../../../errors';
import { AttemptSourceTextLedger } from '../../AttemptSourceTextLedger';
import { newHandler } from '../helpers/registered-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { controlledFetch } from '../helpers/controlled-fetch';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

const ENTRY_URL = `${PUBLIC_PATH}assets/lifecycle.js`;

beforeEach(() => {
  resetRealmSharedDepTextCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetRealmSharedDepTextCache();
});

describe('acceptance: an attempt that ended starts no further request', () => {
  it('starts no request for the dependencies of a chunk whose text arrives after the attempt timed out', async () => {
    const net = controlledFetch();
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0, timeout: 1000 });
    const outcome = handler
      .load(buildEntry(buildManifest([])), 'ext-late-text')
      .then(
        () => 'loaded',
        (error: unknown) => error,
      );

    await vi.advanceTimersByTimeAsync(0);
    expect(net.issued).toEqual([ENTRY_URL]);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await outcome;
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain('timed out after 1000ms');

    // The abandoned fetch still completes, and its text names a dependency.
    net.ok(ENTRY_URL, 'import "./dep.js";\nexport default { mount() {}, unmount() {} };\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(net.issued).toEqual([ENTRY_URL]);
  });

  it('refuses a fetch of a failed attempt, issuing no request and publishing no entry', async () => {
    const net = controlledFetch();
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const fetchSourceText: (url: string, ledger?: AttemptSourceTextLedger) => Promise<string> =
      Reflect.get(handler, 'fetchSourceText');
    const ledger = new AttemptSourceTextLedger();
    ledger.release();
    const url = `${PUBLIC_PATH}assets/late.js`;

    await expect(fetchSourceText.call(handler, url, ledger)).rejects.toBeInstanceOf(MfeLoadError);
    expect(net.issued).toEqual([]);
    // Nothing was published: a later attempt's request is its own.
    const later = fetchSourceText.call(handler, url, new AttemptSourceTextLedger());
    later.catch(() => undefined);
    expect(net.issued).toEqual([url]);
  });
});
