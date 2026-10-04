/**
 * `register` validates a candidate against a store that mirrors the live one;
 * it does not rebuild a store from the live contents on each call, and a
 * rejected candidate leaves the live store unchanged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GtsStore } from '@globaltypesystem/gts-ts';
import type { MfeEntry } from '@gears-frontx/mfes';
// @internal — colocated test, direct relative import is permitted.
import { GtsPlugin } from '../plugin';

const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.storereuse.fixture.entry.v1';

describe('GtsPlugin.register store reuse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not re-register the live store contents on a successful call', () => {
    const plugin = new GtsPlugin();
    const registerSpy = vi.spyOn(GtsStore.prototype, 'register');
    const entry: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };

    plugin.register(entry);

    // One write to the scratch store while validating, one to the live store.
    expect(registerSpy).toHaveBeenCalledTimes(2);
    expect(plugin.getSchema(ENTRY_ID)).toBeDefined();
  });

  it('leaves the live store unchanged when the candidate is rejected', () => {
    const plugin = new GtsPlugin();
    const bad = { id: ENTRY_ID, actions: [] } as unknown as MfeEntry;

    expect(() => plugin.register(bad)).toThrow(/GTS validation failed/);
    expect(plugin.getSchema(ENTRY_ID)).toBeUndefined();

    const good: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
    expect(() => plugin.register(good)).not.toThrow();
  });
});
