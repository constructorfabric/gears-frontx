/**
 * `AttemptSourceTextLedger`: the record of the source-text entries one load
 * attempt waits on exists only while the attempt is unsettled
 * (`inst-lto-drop-record-on-settle`); a release before that still evicts
 * exactly the unsettled entries it joined (`inst-lto-release-identity-checked`).
 */
import { describe, expect, it } from 'vitest';

import { AttemptSourceTextLedger } from '../AttemptSourceTextLedger';

const entriesOf = (ledger: AttemptSourceTextLedger): unknown[] =>
  (ledger as unknown as { entries: unknown[] }).entries;

const pending = (): Promise<string> => new Promise<string>(() => {});

describe('AttemptSourceTextLedger', () => {
  it('drops every entry when the attempt settles and refuses later records', async () => {
    const cache = new Map<string, Promise<string>>();
    const ledger = new AttemptSourceTextLedger();
    const settled = Promise.resolve('text');
    cache.set('a', settled);
    cache.set('b', pending());
    ledger.record(cache, 'a', settled);
    ledger.record(cache, 'b', cache.get('b') as Promise<string>);
    await settled;
    expect(entriesOf(ledger).length).toBeGreaterThan(0);

    ledger.settle();
    expect(entriesOf(ledger)).toHaveLength(0);

    ledger.record(cache, 'c', pending());
    expect(entriesOf(ledger)).toHaveLength(0);
    // Settling removes nothing from any cache.
    expect([...cache.keys()]).toEqual(['a', 'b']);
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
    expect(entriesOf(ledger)).toHaveLength(0);
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
    expect(entriesOf(ledger)).toHaveLength(0);
  });
});
