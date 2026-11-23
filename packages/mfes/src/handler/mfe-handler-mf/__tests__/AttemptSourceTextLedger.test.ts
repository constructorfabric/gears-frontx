/**
 * `AttemptSourceTextLedger`: the record of the source-text entries one load
 * attempt waits on exists only while the attempt is unsettled
 * (`inst-lto-drop-record-on-settle`); a release before that still evicts
 * exactly the unsettled entries it joined (`inst-lto-release-identity-checked`).
 */
import { describe, expect, it } from 'vitest';

import { AttemptSourceTextLedger } from '../AttemptSourceTextLedger';

const pending = (): Promise<string> => new Promise<string>(() => {});

describe('AttemptSourceTextLedger', () => {
  it('drops every entry when the attempt settles and refuses later records', () => {
    const cache = new Map<string, Promise<string>>();
    const ledger = new AttemptSourceTextLedger();
    const hung = pending();
    cache.set('a', hung);
    ledger.record(cache, 'a', hung);

    ledger.settle();
    // A record made after the attempt settled is accepted into nothing.
    const late = pending();
    cache.set('b', late);
    ledger.record(cache, 'b', late);
    // A release that still held either entry would evict it: nothing is held.
    ledger.release();

    expect(cache.get('a')).toBe(hung);
    expect(cache.get('b')).toBe(late);
  });

  it('release after settle is a no-op', () => {
    const cache = new Map<string, Promise<string>>();
    const ledger = new AttemptSourceTextLedger();
    const hung = pending();
    cache.set('a', hung);
    ledger.record(cache, 'a', hung);

    ledger.settle();
    ledger.release();

    expect(cache.get('a')).toBe(hung);
  });

  it('release before settle evicts only unsettled entries, identity-checked', async () => {
    const cache = new Map<string, Promise<string>>();
    const ledger = new AttemptSourceTextLedger();
    const done = Promise.resolve('done');
    const hung = pending();
    const replaced = pending();
    const replacement = pending();
    cache.set('done', done);
    cache.set('hung', hung);
    cache.set('replaced', replacement);
    ledger.record(cache, 'done', done);
    ledger.record(cache, 'hung', hung);
    ledger.record(cache, 'replaced', replaced);
    await done;

    ledger.release();

    expect(cache.get('done')).toBe(done);
    expect(cache.has('hung')).toBe(false);
    expect(cache.get('replaced')).toBe(replacement);
    // The record is dropped by the release: a second release removes nothing.
    cache.set('hung', hung);
    ledger.release();
    expect(cache.get('hung')).toBe(hung);
  });
});
