import { vi } from 'vitest';
import type { ChildMfeBridge } from '@gears-frontx/react';

/**
 * A `ChildMfeBridge` double. The screens only ever read shared properties,
 * subscribe to them and execute an actions chain, so the double answers those
 * three and records the chain a cross-screen jump would send.
 */
export function createBridgeFixture(properties: Record<string, unknown> = {}) {
  const executeActionsChain = vi.fn<ChildMfeBridge['executeActionsChain']>().mockResolvedValue();

  const bridge: ChildMfeBridge = {
    domainId: 'test-domain',
    instanceId: 'test-instance',
    executeActionsChain,
    registerActionHandler: vi.fn(),
    getProperty: (name: string) =>
      name in properties ? { id: name, value: properties[name] } : undefined,
    subscribeToProperty: () => () => undefined,
  };

  return { bridge, executeActionsChain };
}
