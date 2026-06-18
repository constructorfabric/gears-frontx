/**
 * Bridge Implementation Tests
 *
 * Tests for ChildMfeBridge and ParentMfeBridge implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChildMfeBridgeImpl } from '../../../src/mfe/bridge/ChildMfeBridge';
import { ParentMfeBridgeImpl } from '../../../src/mfe/bridge/ParentMfeBridge';
import type { ActionsChain, SharedProperty } from '../../../src/mfe/types';
import { NoActionsChainHandlerError, BridgeDisposedError } from '../../../src/mfe/errors';

describe('Bridge Implementation', () => {
  describe('ChildMfeBridge', () => {
    let childBridge: ChildMfeBridgeImpl;
    let parentBridge: ParentMfeBridgeImpl;

    beforeEach(() => {
      childBridge = new ChildMfeBridgeImpl(
        'test-domain',
        'test-instance-1'
      );
      parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);
    });

    it('should have correct identity properties', () => {
      expect(childBridge.domainId).toBe('test-domain');
      expect(childBridge.instanceId).toBe('test-instance-1');
    });

    it('should subscribe to property updates', () => {
      const callback = vi.fn();
      const unsubscribe = childBridge.subscribeToProperty('test-prop', callback);

      const property: SharedProperty = { id: 'test-prop', value: 'test-value' };
      childBridge.receivePropertyUpdate('test-prop', property);

      expect(callback).toHaveBeenCalledWith(property);
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe and verify no more calls
      unsubscribe();
      childBridge.receivePropertyUpdate('test-prop', property);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should get property synchronously', () => {
      const property: SharedProperty = { id: 'test-prop', value: 42 };
      childBridge.receivePropertyUpdate('test-prop', property);

      const result = childBridge.getProperty('test-prop');
      expect(result).toEqual(property);

      const missing = childBridge.getProperty('missing-prop');
      expect(missing).toBeUndefined();
    });


    it('should handle multiple subscribers to same property', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      childBridge.subscribeToProperty('test-prop', callback1);
      childBridge.subscribeToProperty('test-prop', callback2);

      const property: SharedProperty = { id: 'test-prop', value: 'shared' };
      childBridge.receivePropertyUpdate('test-prop', property);

      expect(callback1).toHaveBeenCalledWith(property);
      expect(callback2).toHaveBeenCalledWith(property);
    });

    it('should send actions chain to parent', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      parentBridge.onChildAction(handler);

      const chain: ActionsChain = {
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~test.action',
          target: 'test-domain',
        },
      };

      await childBridge.sendActionsChain(chain);

      expect(handler).toHaveBeenCalledWith(chain);
    });

    it('should throw error when sending actions without parent connection', async () => {
      const disconnectedBridge = new ChildMfeBridgeImpl('domain', 'instance');
      const chain: ActionsChain = {
        action: { type: 'test', target: 'domain' },
      };

      await expect(disconnectedBridge.sendActionsChain(chain)).rejects.toThrow(
        'Bridge not connected'
      );
    });

    it('should cleanup on disposal', () => {
      const callback = vi.fn();
      childBridge.subscribeToProperty('test-prop', callback);

      const property: SharedProperty = { id: 'test-prop', value: 'value' };
      childBridge.receivePropertyUpdate('test-prop', property);
      expect(callback).toHaveBeenCalledTimes(1);

      childBridge.cleanup();

      // After cleanup, properties and subscribers should be cleared
      expect(childBridge.getProperty('test-prop')).toBeUndefined();
    });
  });

  describe('ParentMfeBridge', () => {
    let childBridge: ChildMfeBridgeImpl;
    let parentBridge: ParentMfeBridgeImpl;

    beforeEach(() => {
      childBridge = new ChildMfeBridgeImpl('domain', 'instance');
      parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);
    });

    it('should forward property updates to child', () => {
      const callback = vi.fn();
      childBridge.subscribeToProperty('test-prop', callback);

      parentBridge.receivePropertyUpdate('test-prop', 'new-value');

      expect(callback).toHaveBeenCalledWith({
        id: 'test-prop',
        value: 'new-value',
      });
    });

    it('should register and handle child actions', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      parentBridge.onChildAction(handler);

      const chain: ActionsChain = {
        action: { type: 'test-action', target: 'test-target' },
      };

      await parentBridge.handleChildAction(chain);

      expect(handler).toHaveBeenCalledWith(chain);
    });

    it('should throw error when handling action without registered handler', async () => {
      const chain: ActionsChain = {
        action: { type: 'test-action', target: 'test-target' },
      };

      await expect(parentBridge.handleChildAction(chain)).rejects.toThrow(
        'No child action handler registered'
      );
    });

    it('should dispose and cleanup', () => {
      const callback = vi.fn();
      childBridge.subscribeToProperty('test-prop', callback);

      parentBridge.dispose();

      // After disposal, property updates should be ignored
      parentBridge.receivePropertyUpdate('test-prop', 'value');
      expect(callback).not.toHaveBeenCalled();

      // Child bridge should be cleaned up
      expect(childBridge.getProperty('test-prop')).toBeUndefined();
    });

    it('should be idempotent on multiple dispose calls', () => {
      expect(() => {
        parentBridge.dispose();
        parentBridge.dispose();
        parentBridge.dispose();
      }).not.toThrow();
    });

    it('should throw error when disposed bridge is used', async () => {
      parentBridge.dispose();

      const chain: ActionsChain = {
        action: { type: 'test', target: 'target' },
      };

      await expect(parentBridge.sendActionsChain(chain)).rejects.toThrow(BridgeDisposedError);

      await expect(parentBridge.handleChildAction(chain)).rejects.toThrow(
        'Bridge has been disposed'
      );

      expect(() => {
        parentBridge.onChildAction(() => Promise.resolve());
      }).toThrow('Bridge has been disposed');
    });

    it('should expose instanceId', () => {
      expect(parentBridge.instanceId).toBe('instance');
    });
  });

  describe('Bridge Integration', () => {
    it('should maintain bidirectional communication', async () => {
      const childBridge = new ChildMfeBridgeImpl('domain', 'instance');
      const parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);

      // Setup parent handler
      const parentHandler = vi.fn().mockResolvedValue(undefined);
      parentBridge.onChildAction(parentHandler);

      // Child subscribes to property
      const childCallback = vi.fn();
      childBridge.subscribeToProperty('shared-prop', childCallback);

      // Parent updates property
      parentBridge.receivePropertyUpdate('shared-prop', 'parent-value');
      expect(childCallback).toHaveBeenCalledWith({
        id: 'shared-prop',
        value: 'parent-value',
      });

      // Child sends action to parent
      const chain: ActionsChain = {
        action: { type: 'child-action', target: 'domain' },
      };
      await childBridge.sendActionsChain(chain);

      expect(parentHandler).toHaveBeenCalledWith(chain);
    });

    it('should handle cleanup during active subscriptions', () => {
      const childBridge = new ChildMfeBridgeImpl('domain', 'instance');
      const parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);

      const callback = vi.fn();
      childBridge.subscribeToProperty('test-prop', callback);

      // Send update
      parentBridge.receivePropertyUpdate('test-prop', 'value1');
      expect(callback).toHaveBeenCalledTimes(1);

      // Dispose parent (which cleans up child)
      parentBridge.dispose();

      // Further updates should be ignored
      parentBridge.receivePropertyUpdate('test-prop', 'value2');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should track property subscribers for cleanup', () => {
      const childBridge = new ChildMfeBridgeImpl('domain', 'instance');
      const parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);

      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      // Register property subscribers (simulating what bridge factory does)
      parentBridge.registerPropertySubscriber('prop1', subscriber1);
      parentBridge.registerPropertySubscriber('prop2', subscriber2);

      // Get subscribers for cleanup
      const subscribers = parentBridge.getPropertySubscribers();
      expect(subscribers.size).toBe(2);
      expect(subscribers.get('prop1')).toBe(subscriber1);
      expect(subscribers.get('prop2')).toBe(subscriber2);

      // Dispose clears subscribers
      parentBridge.dispose();
      const subscribersAfterDispose = parentBridge.getPropertySubscribers();
      expect(subscribersAfterDispose.size).toBe(0);
    });
  });

  describe('Phase 21.11: executeActionsChain capability pass-through', () => {
    let childBridge: ChildMfeBridgeImpl;
    let parentBridge: ParentMfeBridgeImpl;

    beforeEach(() => {
      childBridge = new ChildMfeBridgeImpl('domain', 'test-instance');
      parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);
    });

    describe('ChildMfeBridge.executeActionsChain', () => {
      it('should delegate to injected registry callback', async () => {
        const registryCallback = vi.fn().mockResolvedValue(undefined);
        childBridge.setExecuteActionsChainCallback(registryCallback);

        const chain: ActionsChain = {
          action: { type: 'test-action', target: 'domain' },
        };

        await childBridge.executeActionsChain(chain);

        expect(registryCallback).toHaveBeenCalledWith(chain);
      });

      it('should throw when callback is not wired', async () => {
        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        await expect(childBridge.executeActionsChain(chain)).rejects.toThrow(
          'Bridge not connected'
        );
      });

      it('should propagate errors from registry callback', async () => {
        const callbackError = new Error('Registry execution failed');
        const registryCallback = vi.fn().mockRejectedValue(callbackError);
        childBridge.setExecuteActionsChainCallback(registryCallback);

        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        await expect(childBridge.executeActionsChain(chain)).rejects.toThrow(
          'Registry execution failed'
        );
      });

      it('should clear callback on cleanup', async () => {
        const registryCallback = vi.fn().mockResolvedValue(undefined);
        childBridge.setExecuteActionsChainCallback(registryCallback);

        childBridge.cleanup();

        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        await expect(childBridge.executeActionsChain(chain)).rejects.toThrow(
          'Bridge not connected'
        );
      });
    });
  });

  describe('Phase 21.11: Parent-to-child action chain delivery', () => {
    let childBridge: ChildMfeBridgeImpl;
    let parentBridge: ParentMfeBridgeImpl;

    beforeEach(() => {
      childBridge = new ChildMfeBridgeImpl('domain', 'test-instance');
      parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);
    });

    describe('ChildMfeBridge.onActionsChain', () => {
      it('should register a handler and return unsubscribe function', () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const unsubscribe = childBridge.onActionsChain(handler);

        expect(typeof unsubscribe).toBe('function');

        // Unsubscribe should clear the handler
        unsubscribe();
      });

      it('should warn when replacing an existing handler', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const handler1 = vi.fn().mockResolvedValue(undefined);
        const handler2 = vi.fn().mockResolvedValue(undefined);

        childBridge.onActionsChain(handler1);
        childBridge.onActionsChain(handler2); // Should warn

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining("onActionsChain: replacing existing handler for instance 'test-instance'")
        );

        consoleWarnSpy.mockRestore();
      });

      it('should clear handler when unsubscribe is called', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const unsubscribe = childBridge.onActionsChain(handler);

        // Verify handler works
        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };
        await childBridge.handleParentActionsChain(chain);
        expect(handler).toHaveBeenCalledTimes(1);

        // Unsubscribe
        unsubscribe();

        // Should throw after unsubscribe
        try {
          await childBridge.handleParentActionsChain(chain);
          expect.fail('Should have thrown NoActionsChainHandlerError');
        } catch (error) {
          expect(error).toBeInstanceOf(NoActionsChainHandlerError);
        }
      });

      it('should clear handler on cleanup', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        childBridge.onActionsChain(handler);

        childBridge.cleanup();

        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };
        try {
          await childBridge.handleParentActionsChain(chain);
          expect.fail('Should have thrown NoActionsChainHandlerError');
        } catch (error) {
          expect(error).toBeInstanceOf(NoActionsChainHandlerError);
        }
      });
    });

    describe('ChildMfeBridge.handleParentActionsChain', () => {
      it('should call registered handler with chain and options', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        childBridge.onActionsChain(handler);

        const chain: ActionsChain = {
          action: { type: 'test-action', target: 'domain' },
        };

        await childBridge.handleParentActionsChain(chain);

        expect(handler).toHaveBeenCalledWith(chain);
      });

      it('should throw NoActionsChainHandlerError when no handler registered', async () => {
        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        try {
          await childBridge.handleParentActionsChain(chain);
          expect.fail('Should have thrown NoActionsChainHandlerError');
        } catch (error) {
          expect(error).toBeInstanceOf(NoActionsChainHandlerError);
          if (error instanceof NoActionsChainHandlerError) {
            expect(error.instanceId).toBe('test-instance');
            expect(error.message).toContain('test-instance');
            expect(error.code).toBe('NO_ACTIONS_CHAIN_HANDLER');
          }
        }
      });
    });

    describe('ParentMfeBridge.sendActionsChain', () => {
      it('should forward actions chain to child handler', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        childBridge.onActionsChain(handler);

        const chain: ActionsChain = {
          action: { type: 'parent-action', target: 'child-domain' },
        };

        await parentBridge.sendActionsChain(chain);

        expect(handler).toHaveBeenCalledWith(chain);
      });

      it('should throw BridgeDisposedError when bridge is disposed', async () => {
        parentBridge.dispose();

        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        await expect(parentBridge.sendActionsChain(chain)).rejects.toThrow(
          BridgeDisposedError
        );

        try {
          await parentBridge.sendActionsChain(chain);
        } catch (error) {
          expect(error).toBeInstanceOf(BridgeDisposedError);
          if (error instanceof BridgeDisposedError) {
            expect(error.instanceId).toBe('test-instance');
            expect(error.code).toBe('BRIDGE_DISPOSED');
          }
        }
      });

      it('should propagate errors from child handler', async () => {
        const handlerError = new Error('Child handler failed');
        const handler = vi.fn().mockRejectedValue(handlerError);
        childBridge.onActionsChain(handler);

        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        await expect(parentBridge.sendActionsChain(chain)).rejects.toThrow(
          'Child handler failed'
        );
      });
    });

    describe('Integration: Bidirectional action chain delivery', () => {
      it('should support both child-to-parent and parent-to-child delivery', async () => {
        // Setup parent handler for child-to-parent
        const parentHandler = vi.fn().mockResolvedValue(undefined);
        parentBridge.onChildAction(parentHandler);

        // Setup child handler for parent-to-child
        const childHandler = vi.fn().mockResolvedValue(undefined);
        childBridge.onActionsChain(childHandler);

        // Child sends to parent
        const childToParentChain: ActionsChain = {
          action: { type: 'child-action', target: 'parent-domain' },
        };
        await childBridge.sendActionsChain(childToParentChain);
        expect(parentHandler).toHaveBeenCalledWith(childToParentChain);

        // Parent sends to child
        const parentToChildChain: ActionsChain = {
          action: { type: 'parent-action', target: 'child-domain' },
        };
        await parentBridge.sendActionsChain(parentToChildChain);
        expect(childHandler).toHaveBeenCalledWith(parentToChildChain);
      });
    });
  });
});
