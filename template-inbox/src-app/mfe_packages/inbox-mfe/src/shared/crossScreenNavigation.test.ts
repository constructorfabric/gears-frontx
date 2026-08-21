import { describe, expect, it } from 'vitest';
import { createBridgeFixture } from '../__test-utils__/bridgeFixture';
import { CONTACTS_EXTENSION_ID, openContactDetail } from './crossScreenNavigation';
import { INBOX_OPEN_CONTACT } from './hostChromeActions';

describe('openContactDetail', () => {
  it('mounts contacts and names the target in the chained step', async () => {
    const { bridge, executeActionsChain } = createBridgeFixture();

    openContactDetail(bridge, 'r-26');
    // The dispatch is deferred by a microtask so React can finish the click.
    await Promise.resolve();

    const [chain] = executeActionsChain.mock.calls[0];
    expect(chain.action.payload).toEqual({ subject: CONTACTS_EXTENSION_ID });
    // The contact id rides the chain rather than module state: the two screens
    // are separate loads and do not share one.
    expect(chain.next?.action).toEqual({
      type: INBOX_OPEN_CONTACT,
      target: CONTACTS_EXTENSION_ID,
      payload: { contactId: 'r-26' },
    });
  });
});
