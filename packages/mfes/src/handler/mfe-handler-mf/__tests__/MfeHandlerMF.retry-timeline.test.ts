/**
 * The load's retry timeline under the handler's default options
 * (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-per-attempt-budget`,
 * `inst-lto-if-deterministic-failure`, `inst-lto-no-retry-deterministic`):
 * three attempts, a backoff of 1000 ms and then 2000 ms, and a fresh
 * 30000 ms budget for every attempt; only a network failure or an expired
 * budget is retried, and every other failure fails the load at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MfeLoadError } from '../../../errors';
import { RetryHandler } from '../RetryHandler';
import { RetryableLoadError } from '../RetryableLoadError';
import { newHandler } from './helpers/registered-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sharedDep,
} from './helpers/manifest-builder';
import { jsResponse } from './helpers/fetch-router';
import { resetRealmSharedDepTextCache } from './helpers/realm-cache';

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

/** The outcome of `load`, observed without leaving it unhandled while time advances. */
function settle<T>(promise: Promise<T>): { outcome: () => PromiseSettledResult<T> | undefined } {
  let result: PromiseSettledResult<T> | undefined;
  promise.then(
    (value) => {
      result = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      result = { status: 'rejected', reason };
    },
  );
  return { outcome: () => result };
}

describe('MfeHandlerMF default retry timeline', () => {
  it.each([
    ['a request that fails', () => Promise.reject(new TypeError('connection refused'))],
    ['an answer with a non-success status', () => Promise.resolve(jsResponse('missing', false))],
    [
      'a fetch that throws before returning a promise',
      (): Promise<Response> => {
        throw new TypeError('invalid request');
      },
    ],
  ])('retries %s twice, after 1000 ms and then 2000 ms, and then fails the load', async (_label, answer) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => answer());
    const handler = newHandler(ENTRY_BASE_ID);
    const load = settle(handler.load(buildEntry(buildManifest([])), 'ext-default-timeline'));

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(load.outcome()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const outcome = load.outcome();
    expect(outcome?.status).toBe('rejected');
    expect(outcome?.status === 'rejected' && outcome.reason).toBeInstanceOf(MfeLoadError);
  });

  it('races every attempt against its own 30000 ms budget and retries an expired one', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise<Response>(() => {}));
    const handler = newHandler(ENTRY_BASE_ID);
    const load = settle(handler.load(buildEntry(buildManifest([])), 'ext-attempt-budget'));

    await vi.advanceTimersByTimeAsync(29999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The first budget expires at 30000 ms; the retry follows 1000 ms later and
    // issues its own request instead of rejoining the abandoned attempt's.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Its own fresh budget: it expires 30000 ms after it began, not with the first.
    await vi.advanceTimersByTimeAsync(29999);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(load.outcome()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2001);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(30000);
    const outcome = load.outcome();
    expect(outcome?.status).toBe('rejected');
    const reason = outcome?.status === 'rejected' ? outcome.reason : undefined;
    expect(reason).toBeInstanceOf(RetryableLoadError);
    expect(String((reason as Error).message)).toContain('timed out after 30000ms');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('fails a load decided by declared data at once, with no further attempt and no backoff', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const manifest = buildManifest([sharedDep('react'), sharedDep('react', { version: '2.0.0' })]);
    const handler = newHandler(ENTRY_BASE_ID);
    const load = settle(handler.load(buildEntry(manifest), 'ext-declared-data'));

    await vi.advanceTimersByTimeAsync(0);
    const outcome = load.outcome();
    expect(outcome?.status).toBe('rejected');
    expect(outcome?.status === 'rejected' && outcome.reason).toBeInstanceOf(MfeLoadError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails a response that is not the module at once instead of retrying it', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsResponse('<!doctype html><title>spa</title>')));
    const handler = newHandler(ENTRY_BASE_ID);
    const load = settle(handler.load(buildEntry(buildManifest([])), 'ext-html-answer'));

    await vi.advanceTimersByTimeAsync(0);
    expect(load.outcome()?.status).toBe('rejected');
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([ENTRY_URL]);
  });
});

describe('RetryHandler', () => {
  it('rethrows a failure its predicate rejects at once, whatever retries remain', async () => {
    const operation = vi.fn(() => Promise.reject(new Error('decided by data')));
    await expect(
      new RetryHandler().retry(operation, 5, 1000, () => false),
    ).rejects.toThrow('decided by data');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('doubles the backoff for every further retry and stops after the last', async () => {
    const operation = vi.fn(() => Promise.reject(new Error('flaky')));
    const done = new RetryHandler().retry(operation, 3, 100, () => true).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(operation).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(400);
    expect(operation).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(10000);
    expect(operation).toHaveBeenCalledTimes(4);
    await expect(done).resolves.toBeInstanceOf(Error);
  });
});

describe('RetryableLoadError brand', () => {
  it('is recognised by its brand across copies, and only by it', () => {
    const brand = Symbol.for('@gears-frontx/mfes:retryable-load-error:1');
    expect(RetryableLoadError.isBranded(new RetryableLoadError('x', 'u'))).toBe(true);
    // An error from another copy carries the brand but not this class.
    expect(RetryableLoadError.isBranded(Object.assign(new Error('x'), { [brand]: true }))).toBe(true);
    expect(RetryableLoadError.isBranded(new Error('x'))).toBe(false);
    expect(RetryableLoadError.isBranded(undefined)).toBe(false);
    expect(RetryableLoadError.isBranded('x')).toBe(false);
  });
});
