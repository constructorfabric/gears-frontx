/**
 * `SharedTextAdmission`: a joined fetch that rejects retries once, and every
 * entry the attempt joined, issued or adopted as a replacement is recorded
 * on its ledger.
 */
import { describe, expect, it, vi } from 'vitest';

import { SharedTextAdmission } from '../SharedTextAdmission';
import { AttemptSourceTextLedger } from '../AttemptSourceTextLedger';
import type { SharedDepTextCache } from '../RealmSharedDepTextCacheProvider';

const KEY = 'k';

function setup() {
  const map = new Map<string, Promise<string>>();
  const cache: SharedDepTextCache = map;
  const recorded: Array<{ key: string; promise: Promise<string> }> = [];
  const ledger = new AttemptSourceTextLedger();
  vi.spyOn(ledger, 'record').mockImplementation((_c, key, promise) => {
    recorded.push({ key, promise });
  });
  return { map, cache, ledger, recorded };
}

describe('SharedTextAdmission', () => {
  it('records the replacement entry another load published on the ledger', async () => {
    const { map, cache, ledger, recorded } = setup();
    const joinedPromise = Promise.reject<string>(new Error('first'));
    joinedPromise.catch(() => undefined);
    map.set(KEY, joinedPromise);
    const replacement = Promise.resolve('replacement');
    const admission = new SharedTextAdmission(cache, ledger);
    const fetchText = vi.fn(async () => 'own');
    const result = admission.admit(KEY, 'https://b.test/f.js', fetchText);
    // The issuer's eviction has run and another load published a replacement.
    map.delete(KEY);
    map.set(KEY, replacement);
    await expect(result).resolves.toBe('replacement');
    expect(fetchText).not.toHaveBeenCalled();
    expect(recorded.map((r) => r.promise)).toEqual([joinedPromise, replacement]);
  });

  it('issues its own fetch when no replacement exists and records it', async () => {
    const { map, cache, ledger, recorded } = setup();
    const joinedPromise = Promise.reject<string>(new Error('first'));
    joinedPromise.catch(() => undefined);
    map.set(KEY, joinedPromise);
    const admission = new SharedTextAdmission(cache, ledger);
    const result = admission.admit(KEY, 'https://b.test/f.js', async () => 'own');
    map.delete(KEY);
    await expect(result).resolves.toBe('own');
    expect(recorded).toHaveLength(2);
    expect(recorded[1].promise).toBe(map.get(KEY));
  });
});
