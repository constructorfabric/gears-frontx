/**
 * Bridge Implementation Tests
 *
 * Tests for ChildMfeBridge and ParentMfeBridge implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChildMfeBridgeImpl } from '../../../src/mfe/bridge/ChildMfeBridge';
import { ParentMfeBridgeImpl } from '../../../src/mfe/bridge/ParentMfeBridge';
import type { ActionsChain, SharedProperty, ExtensionDomain } from '../../../src/mfe/types';
import { ActionHandler } from '../../../src/mfe/mediator/types';
import { NoActionsChainHandlerError, BridgeDisposedError } from '../../../src/mfe/errors';
import { DefaultActionsChainsMediator } from '../../../src/mfe/mediator/actions-chains-mediator';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import type { TypeSystemPlugin, ValidationResult, JSONSchema } from '../../../src/mfe/plugins/types';
import { MockDomainFactory } from '../../../__test-utils__';

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
          type: 'gts.hai3.mfes.comm.action.v1~test.action',
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

        expect(() => {
          childBridge.handleParentActionsChain(chain);
        }).toThrow(
          NoActionsChainHandlerError
        );
      });

      it('should clear handler on cleanup', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        childBridge.onActionsChain(handler);

        childBridge.cleanup();

        const chain: ActionsChain = { action: { type: 'test', target: 'domain' } };

        expect(() => {
          childBridge.handleParentActionsChain(chain);
        }).toThrow(
          NoActionsChainHandlerError
        );
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

        expect(() => {
          childBridge.handleParentActionsChain(chain);
        }).toThrow(
          NoActionsChainHandlerError
        );
        expect(() => {
          childBridge.handleParentActionsChain(chain);
        }).toThrow(
          expect.objectContaining({
            instanceId: 'test-instance',
            code: 'NO_ACTIONS_CHAIN_HANDLER',
          })
        );
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
        await expect(parentBridge.sendActionsChain(chain)).rejects.toMatchObject({
          instanceId: 'test-instance',
          code: 'BRIDGE_DISPOSED',
        });
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

  describe('Fix #254: ChildMfeBridge.registerActionHandler', () => {
    // Minimal type system plugin needed to configure a mediator for integration tests.
    function createMinimalTypeSystem(): TypeSystemPlugin {
      const schemas = new Map<string, JSONSchema>();
      const registered = new Map<string, unknown>();

      for (const id of [
        'gts.hai3.mfes.mfe.entry.v1~',
        'gts.hai3.mfes.ext.domain.v1~',
        'gts.hai3.mfes.ext.extension.v1~',
        'gts.hai3.mfes.comm.shared_property.v1~',
        'gts.hai3.mfes.comm.action.v1~',
        'gts.hai3.mfes.comm.actions_chain.v1~',
        'gts.hai3.mfes.lifecycle.stage.v1~',
        'gts.hai3.mfes.lifecycle.hook.v1~',
      ]) {
        schemas.set(id, { $id: `gts://${id}`, type: 'object' });
      }

      const gtsUri = ['gts', ':', '//'].join('');
      return {
        name: 'MinimalMock',
        version: '1.0.0',
        registerSchema: (schema: JSONSchema) => {
          if (schema.$id) schemas.set(schema.$id, schema);
        },
        getSchema: (id: string) => {
          const direct = schemas.get(id);
          if (direct !== undefined) return direct;
          if (!id.startsWith(gtsUri)) return schemas.get(gtsUri + id);
          return undefined;
        },
        register: (entity: unknown) => {
          const e = entity as { id?: string };
          registered.set(e.id ?? '', entity);
        },
        validateInstance: (instanceId: string): ValidationResult => {
          if (registered.has(instanceId)) return { valid: true, errors: [] };
          return { valid: false, errors: [{ path: '', message: `Not registered: ${instanceId}`, keyword: 'not-registered' }] };
        },
        isTypeOf: (typeId: string, baseTypeId: string) => typeId === baseTypeId || typeId.startsWith(baseTypeId),
      };
    }

    // Spy ActionHandler that records invocations for assertion.
    class SpyHandler extends ActionHandler {
      private readonly calls: Array<{ actionTypeId: string; payload: Record<string, unknown> | undefined }> = [];

      async handleAction(
        actionTypeId: string,
        payload: Record<string, unknown> | undefined
      ): Promise<void> {
        this.calls.push({ actionTypeId, payload });
      }

      getCalls(): ReadonlyArray<{ actionTypeId: string; payload: Record<string, unknown> | undefined }> {
        return this.calls;
      }
    }

    const ACTION_TYPE_SPY = 'gts.hai3.mfes.comm.action.v1~test.spy.v1~';

    describe('Registration via setRegisterActionHandlerCallback', () => {
      it('should invoke the wired callback with the provided actionTypeId and handler', () => {
        const bridge = new ChildMfeBridgeImpl('domain-id', 'instance-id');
        const capturedActionTypes: string[] = [];
        const capturedHandlers: ActionHandler[] = [];
        bridge.setRegisterActionHandlerCallback((actionTypeId, h) => {
          capturedActionTypes.push(actionTypeId);
          capturedHandlers.push(h);
        });

        const spy = new SpyHandler();
        bridge.registerActionHandler(ACTION_TYPE_SPY, spy);

        expect(capturedActionTypes).toHaveLength(1);
        expect(capturedActionTypes[0]).toBe(ACTION_TYPE_SPY);
        expect(capturedHandlers[0]).toBe(spy);
      });

      it('should throw when callback is not wired', () => {
        const bridge = new ChildMfeBridgeImpl('domain-id', 'instance-id');
        const spy = new SpyHandler();

        expect(() => {
          bridge.registerActionHandler(ACTION_TYPE_SPY, spy);
        }).toThrow(
          'registerActionHandler callback not wired'
        );
      });

      it('should throw after cleanup clears the callback', () => {
        const bridge = new ChildMfeBridgeImpl('domain-id', 'instance-id');
        bridge.setRegisterActionHandlerCallback(() => {});
        bridge.cleanup();

        const spy = new SpyHandler();
        expect(() => {
          bridge.registerActionHandler(ACTION_TYPE_SPY, spy);
        }).toThrow(
          'registerActionHandler callback not wired'
        );
      });
    });

    describe('Full pipeline: bridge → mediator → handler invocation', () => {
      const EXTENSION_ID = 'gts.hai3.mfes.ext.extension.v1~test.ext.v1~test.ext.handler.v1';
      const DOMAIN_ID = 'gts.hai3.mfes.ext.domain.v1~test.domain.v1~';
      const ACTION_TYPE = 'gts.hai3.mfes.comm.action.v1~test.custom.v1~';

      let plugin: TypeSystemPlugin;
      let registry: DefaultMfeRegistry;
      let mediator: DefaultActionsChainsMediator;
      let domain: ExtensionDomain;
      let containerProvider: MockDomainFactory;

      beforeEach(() => {
        plugin = createMinimalTypeSystem();
        registry = new DefaultMfeRegistry({ typeSystem: plugin });
        containerProvider = new MockDomainFactory();
        mediator = new DefaultActionsChainsMediator({
          typeSystem: plugin,
          getDomainState: (domainId) => registry.getDomainState(domainId),
          getExtensionEntry: () => undefined,
        });

        domain = {
          id: DOMAIN_ID,
          sharedProperties: [],
          actions: [],
          // Extension-targeted actions are resolved via extensionHandlers map; the domain
          // must be registered so the mediator can look up defaultActionTimeout.
          extensionsActions: [ACTION_TYPE],
          defaultActionTimeout: 5000,
          lifecycleStages: [],
          extensionsLifecycleStages: [],
        };
        registry.registerDomain(domain, containerProvider.prepareForDomain(domain));
      });

      it('should route an action chain targeting the extension ID to the registered handler', async () => {
        const bridge = new ChildMfeBridgeImpl(DOMAIN_ID, 'test-instance');

        // Wire the callback exactly as DefaultRuntimeBridgeFactory does.
        bridge.setRegisterActionHandlerCallback((actionTypeId, handler) =>
          mediator.registerHandler(EXTENSION_ID, actionTypeId, handler, DOMAIN_ID)
        );

        const spy = new SpyHandler();
        bridge.registerActionHandler(ACTION_TYPE, spy);

        await mediator.executeActionsChain({
          action: { type: ACTION_TYPE, target: EXTENSION_ID },
        });

        expect(spy.getCalls()).toHaveLength(1);
      });

      it('should deliver the correct actionTypeId and payload to handleAction', async () => {
        const bridge = new ChildMfeBridgeImpl(DOMAIN_ID, 'test-instance');
        bridge.setRegisterActionHandlerCallback((actionTypeId, handler) =>
          mediator.registerHandler(EXTENSION_ID, actionTypeId, handler, DOMAIN_ID)
        );

        const spy = new SpyHandler();
        bridge.registerActionHandler(ACTION_TYPE, spy);

        const expectedPayload = { userId: 'u-42', refresh: true };
        await mediator.executeActionsChain({
          action: { type: ACTION_TYPE, target: EXTENSION_ID, payload: expectedPayload },
        });

        const calls = spy.getCalls();
        expect(calls).toHaveLength(1);
        expect(calls[0].actionTypeId).toBe(ACTION_TYPE);
        expect(calls[0].payload).toEqual(expectedPayload);
      });

      it('should fail the chain with a recorded "No handler found" error when no handler is registered for the extension target (cpt-frontx-dod-screenset-registry-missing-handler-fallback)', async () => {
        // Per cpt-frontx-dod-screenset-registry-missing-handler-fallback the
        // mediator now treats a missing-handler step as FAILED rather than as
        // a silent no-op. With no `fallback` chain present the recorded error
        // surfaces via `result.error`; the mediator itself does NOT throw.
        const result = await mediator.executeActionsChain({
          action: { type: ACTION_TYPE, target: EXTENSION_ID },
        });

        expect(result.completed).toBe(false);
        expect(result.error).toBe(
          `No handler found for target '${EXTENSION_ID}' and action type '${ACTION_TYPE}'`
        );
        expect(result.path).toEqual([ACTION_TYPE]);
      });
    });

    describe('GTS schema-level contract enforcement (real GtsPlugin)', () => {
      // These tests use the real GtsPlugin (not a mock) to verify that x-gts-ref
      // constraints on action schemas reject wrong targets at validation time.
      // This is the actual contract enforcement mechanism — no manual includes() needed.

      const PROFILE_EXT_ID = 'gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~hai3.demo.screens.profile.v1';
      const HELLOWORLD_EXT_ID = 'gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~hai3.demo.screens.helloworld.v1';
      const SCREEN_DOMAIN_ID = 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.screen.v1';
      const REFRESH_ACTION = 'gts.hai3.mfes.comm.action.v1~hai3.demo.action.refresh_profile.v1~';

      let gtsPlugin: import('../../../src/mfe/plugins/gts').GtsPlugin;
      let gtsMediator: DefaultActionsChainsMediator;
      let gtsRegistry: DefaultMfeRegistry;

      beforeEach(async () => {
        // Use the real GtsPlugin with built-in schemas
        const { GtsPlugin } = await import('../../../src/mfe/plugins/gts');
        gtsPlugin = new GtsPlugin();

        gtsRegistry = new DefaultMfeRegistry({ typeSystem: gtsPlugin });

        gtsMediator = new DefaultActionsChainsMediator({
          typeSystem: gtsPlugin,
          getDomainState: (domainId) => gtsRegistry.getDomainState(domainId),
          getExtensionEntry: () => undefined,
        });

        // Register the screen-extension derived schema (profile/helloworld instance
        // IDs resolve to this schema via their chained parent segment).
        gtsPlugin.registerSchema({
          $id: 'gts://gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~',
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            id: { 'x-gts-ref': '/$id' },
            domain: { type: 'string' },
            entry: { type: 'string' },
          },
          required: ['id', 'domain', 'entry'],
        });

        // Register the refresh_profile action schema (constrains target to profile extension only)
        gtsPlugin.registerSchema({
          $id: 'gts://gts.hai3.mfes.comm.action.v1~hai3.demo.action.refresh_profile.v1~',
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            type: { 'x-gts-ref': '/$id' },
            target: { 'x-gts-ref': PROFILE_EXT_ID },
            payload: { type: 'object' },
            timeout: { type: 'number', minimum: 1 },
          },
          required: ['type', 'target'],
        });

        // Register domain and extensions as GTS instances
        const domain = {
          id: SCREEN_DOMAIN_ID,
          sharedProperties: [],
          actions: ['gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~'],
          extensionsActions: [],
          defaultActionTimeout: 5000,
          lifecycleStages: [],
          extensionsLifecycleStages: [],
        };
        gtsRegistry.registerDomain(domain, new MockDomainFactory().prepareForDomain(domain));

        gtsPlugin.register({
          id: PROFILE_EXT_ID,
          domain: SCREEN_DOMAIN_ID,
          entry: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~hai3.demo.mfe.profile.v1',
        });
        gtsPlugin.register({
          id: HELLOWORLD_EXT_ID,
          domain: SCREEN_DOMAIN_ID,
          entry: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~hai3.demo.mfe.helloworld.v1',
        });
      });

      it('refresh action targeting profile extension passes GTS validation', async () => {
        const spy = new SpyHandler();
        gtsMediator.registerHandler(PROFILE_EXT_ID, REFRESH_ACTION, spy, SCREEN_DOMAIN_ID);

        const result = await gtsMediator.executeActionsChain({
          action: { type: REFRESH_ACTION, target: PROFILE_EXT_ID },
        });

        expect(result.completed).toBe(true);
        expect(spy.getCalls()).toHaveLength(1);
      });

      it('refresh action targeting WRONG extension is rejected by GTS x-gts-ref validation', async () => {
        const spy = new SpyHandler();
        gtsMediator.registerHandler(HELLOWORLD_EXT_ID, REFRESH_ACTION, spy, SCREEN_DOMAIN_ID);

        const result = await gtsMediator.executeActionsChain({
          action: { type: REFRESH_ACTION, target: HELLOWORLD_EXT_ID },
        });

        expect(result.completed).toBe(false);
        expect(result.error).toContain('x-gts-ref validation failed');
      });

      it('lifecycle action (mount_ext) targeting extension is rejected by GTS — target must be domain', async () => {
        const spy = new SpyHandler();
        gtsMediator.registerHandler(
          PROFILE_EXT_ID,
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
          spy,
          SCREEN_DOMAIN_ID
        );

        const result = await gtsMediator.executeActionsChain({
          action: {
            type: 'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
            target: PROFILE_EXT_ID,
            payload: { subject: PROFILE_EXT_ID },
          },
        });

        expect(result.completed).toBe(false);
        expect(result.error).toContain('x-gts-ref validation failed');
      });

      it('lifecycle action (mount_ext) targeting domain passes GTS validation', async () => {
        // Register a domain-side mount_ext handler so the chain progresses past
        // GTS validation AND past handler resolution (the test's intent is to
        // verify the GTS x-gts-ref step accepts domain targets for lifecycle
        // actions; without a registered handler the mediator now correctly
        // fails the chain per cpt-frontx-dod-screenset-registry-missing-handler-fallback,
        // which would mask the GTS-pass we want to assert).
        const mountHandler = new SpyHandler();
        gtsMediator.registerHandler(
          SCREEN_DOMAIN_ID,
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
          mountHandler
        );

        const result = await gtsMediator.executeActionsChain({
          action: {
            type: 'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
            target: SCREEN_DOMAIN_ID,
            payload: { subject: PROFILE_EXT_ID },
          },
        });

        // mount_ext targeting domain passes GTS. The domain handler handles it.
        expect(result.completed).toBe(true);
        expect(mountHandler.getCalls()).toHaveLength(1);
      });
    });
  });
});
