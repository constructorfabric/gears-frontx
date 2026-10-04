/**
 * Bridge Transport Surface Tests
 *
 * Verifies the concrete bridge implementations expose only the
 * `sendCrossHopEnvelope`/`handleCrossHopEnvelope` hand-over pair as their
 * cross-runtime transport.
 *
 * Domain and action IDs here are a mock notation rather than the real GTS
 * strings: the bridge treats them as opaque routing keys, and MFES-1 forbids
 * @gears-frontx/mfes from carrying type-format literals at all.
 */

import { describe, it, expect } from 'vitest';
import { ChildMfeBridgeImpl } from '../../src/bridge/ChildMfeBridgeImpl';
import { ParentMfeBridgeImpl } from '../../src/bridge/ParentMfeBridgeImpl';

describe('Cross-Runtime Action Chain Routing', () => {
  describe(
    'no completion-bearing chain transport crosses a bridge',
    () => {
      it('neither concrete bridge implementation carries a completion-bearing method on its own prototype', () => {
        // The concrete bridges carry no completion-bearing chain transport methods
        // (`sendActionsChain`, `onActionsChain`, `handleParentActionsChain` on ChildMfeBridgeImpl;
        // `sendActionsChain`, `onChildAction`, `handleChildAction` on ParentMfeBridgeImpl).
        // Every runtime-crossing hop goes through the
        // `sendCrossHopEnvelope`/`handleCrossHopEnvelope` pair.
        const childOwnMethods = Object.getOwnPropertyNames(ChildMfeBridgeImpl.prototype);
        const parentOwnMethods = Object.getOwnPropertyNames(ParentMfeBridgeImpl.prototype);

        expect(childOwnMethods).not.toContain('sendActionsChain');
        expect(childOwnMethods).not.toContain('onActionsChain');
        expect(childOwnMethods).not.toContain('handleParentActionsChain');
        expect(childOwnMethods).not.toContain('setParentBridge');

        expect(parentOwnMethods).not.toContain('sendActionsChain');
        expect(parentOwnMethods).not.toContain('onChildAction');
        expect(parentOwnMethods).not.toContain('handleChildAction');
      });
    }
  );
});
