/**
 * A candidate `register` rejects leaves the live store unchanged.
 */
import { describe, it, expect } from 'vitest';
import type { MfeEntry } from '@gears-frontx/mfes';
// @internal — colocated test, direct relative import is permitted.
import { GtsPlugin } from '../plugin';

const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.storereuse.fixture.entry.v1';

describe('GtsPlugin.register rejected candidate', () => {
  it('leaves the live store unchanged when the candidate is rejected', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const bad = { id: ENTRY_ID, actions: [] } as unknown as MfeEntry;

    expect(() => plugin.register(bad)).toThrow(/GTS validation failed/);
    expect(plugin.getSchema(ENTRY_ID)).toBeUndefined();

    const good: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
    expect(() => plugin.register(good)).not.toThrow();
  });
});
