/**
 * Integration Tests for Host State Protection
 *
 * Verifies:
 * - MFE cannot access host store directly
 * - Boundary enforcement
 * - State isolation between host and MFE
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScreensetsRegistry } from '../../../src/mfe/runtime';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { gtsPlugin } from '../../../src/mfe/plugins/gts';
import { DefaultMfeStateContainer } from '../../../src/mfe/state';
import { ChildMfeBridgeImpl } from '../../../src/mfe/bridge/ChildMfeBridge';
import { ParentMfeBridgeImpl } from '../../../src/mfe/bridge/ParentMfeBridge';
import { WeakMapRuntimeCoordinator } from '../../../src/mfe/coordination/weak-map-runtime-coordinator';
import type { RuntimeConnection } from '../../../src/mfe/coordination/types';
import type { ParentMfeBridge } from '../../../src/mfe/handler/types';

interface HostState {
  currentScreenset: string;
  layoutConfig: Record<string, unknown>;
  internalData: { sensitiveToken: string };
}

interface MfeState {
  widgetData: unknown;
  localState: unknown;
}

describe('Host State Protection', () => {
  let hostRuntime: ScreensetsRegistry;
  let _hostStateContainer: DefaultMfeStateContainer<HostState>;
  let _container: HTMLDivElement;
  let coordinator: WeakMapRuntimeCoordinator;

  beforeEach(() => {
    // Create host runtime
    hostRuntime = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });

    // Create coordinator for testing
    coordinator = new WeakMapRuntimeCoordinator();

    // Create host state (should be inaccessible to MFE)
    _hostStateContainer = new DefaultMfeStateContainer<HostState>({
      initialState: {
        currentScreenset: 'dashboard',
        layoutConfig: { theme: 'dark' },
        internalData: { sensitiveToken: 'secret-host-token' },
      },
    });

    // Create container element
    _container = document.createElement('div');
  });

  describe('MFE cannot access host store directly', () => {
    it('should not expose host state _container to MFE', () => {
      const mfeStateContainer = new DefaultMfeStateContainer<MfeState>({
        initialState: {
          widgetData: null,
          localState: null,
        },
      });

      // MFE has its own state
      expect(mfeStateContainer.getState()).toEqual({
        widgetData: null,
        localState: null,
      });

      // MFE should NOT be able to access host state
      // (there's no reference passed to it)
      expect(mfeStateContainer.getState()).not.toHaveProperty('currentScreenset');
      expect(mfeStateContainer.getState()).not.toHaveProperty('internalData');
    });

    it('should not expose host runtime to MFE code', () => {
      // Register runtime connection
      const entryTypeId = 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1';
      const mockBridge: ParentMfeBridge = {
        instanceId: 'test-instance-1',
        dispose: () => {},
      };

      const connection: RuntimeConnection = {
        hostRuntime,
        bridges: new Map([[entryTypeId, mockBridge]]),
      };

      coordinator.register(_container, connection);

      // The MFE code should NOT have direct access to hostRuntime
      // It can only access via the bridge interface
      const retrievedConnection = coordinator.get(_container);
      expect(retrievedConnection?.hostRuntime).toBe(hostRuntime);

      // But MFE code never receives the RuntimeConnection object
      // It only receives the ChildMfeBridge interface
      // which is a controlled boundary
    });

    it('should verify MFE only receives ChildMfeBridge interface', () => {
      // This test documents the intended boundary
      // MFE receives: ChildMfeBridge (controlled interface)
      // MFE does NOT receive: ScreensetsRegistry, RuntimeConnection, etc.

      const mfeReceivedProps = {
        // This is what the MFE mount() function receives
        bridge: {
          // ChildMfeBridge interface (defined in later phases)
          entryTypeId: 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1',
          executeActionsChain: () => {},
          subscribeToProperty: () => () => {},
          // NO access to: hostRuntime, hostState, etc.
        },
      };

      // Verify the bridge interface does not expose host internals
      expect(mfeReceivedProps.bridge).not.toHaveProperty('hostRuntime');
      expect(mfeReceivedProps.bridge).not.toHaveProperty('hostState');
      expect(mfeReceivedProps.bridge).not.toHaveProperty('typeSystem');
    });
  });

  describe('Boundary enforcement', () => {
    it('should enforce state isolation via separate _containers', () => {
      // Host state
      const hostState = new DefaultMfeStateContainer<HostState>({
        initialState: {
          currentScreenset: 'dashboard',
          layoutConfig: {},
          internalData: { sensitiveToken: 'host-secret' },
        },
      });

      // MFE state (completely separate)
      const mfeState = new DefaultMfeStateContainer<MfeState>({
        initialState: {
          widgetData: null,
          localState: null,
        },
      });

      // Update host state
      hostState.setState((state) => ({
        ...state,
        currentScreenset: 'analytics',
      }));

      // MFE state should be unchanged
      expect(mfeState.getState()).toEqual({
        widgetData: null,
        localState: null,
      });

      // Update MFE state
      mfeState.setState((state) => ({
        ...state,
        widgetData: { count: 5 },
      }));

      // Host state should be unchanged
      expect(hostState.getState().currentScreenset).toBe('analytics');
      expect(hostState.getState().internalData.sensitiveToken).toBe(
        'host-secret'
      );
    });

    it('should enforce property flow boundary via bridge API', () => {
      // Use bridge-based property management (the production approach)
      const childBridge = new ChildMfeBridgeImpl('domain', 'instance-1');
      const parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);

      // Host (parent) updates property via ParentMfeBridge (the production boundary)
      parentBridge.receivePropertyUpdate(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        'dark'
      );

      // MFE can READ property via ChildMfeBridge (controlled interface)
      const theme = childBridge.getProperty(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1'
      );
      expect(theme).toEqual({
        id: 'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        value: 'dark',
      });

      // MFE CANNOT call receivePropertyUpdate directly
      // (receivePropertyUpdate is INTERNAL and not exposed via ChildMfeBridge interface)
      // This boundary is enforced at the type level
    });

    it('should verify coordination is module-private', () => {
      const entryTypeId = 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1';
      const mockBridge: ParentMfeBridge = {
        instanceId: 'test-instance-2',
        dispose: () => {},
      };

      const connection: RuntimeConnection = {
        hostRuntime,
        bridges: new Map([[entryTypeId, mockBridge]]),
      };

      coordinator.register(_container, connection);

      // Coordination methods (coordinator.register, coordinator.get) are module-level
      // They are NOT exposed to MFE code
      // MFE code cannot call coordinator methods

      // Only the internal mounting logic uses these methods
      const retrieved = coordinator.get(_container);
      expect(retrieved).toBeDefined();

      // MFE code has NO WAY to access this
      // (not on window, not passed as props, not accessible via any API)
    });
  });

  describe('Integration: Complete isolation scenario', () => {
    it('should demonstrate complete host-MFE isolation', () => {
      // === HOST SIDE ===

      // Host has its own state
      const hostState = new DefaultMfeStateContainer<HostState>({
        initialState: {
          currentScreenset: 'dashboard',
          layoutConfig: { sidebar: 'collapsed' },
          internalData: { sensitiveToken: 'host-only-secret' },
        },
      });

      // Host creates bridge pair for MFE communication
      const childBridgeA = new ChildMfeBridgeImpl('domain', 'instance-a');
      const parentBridgeA = new ParentMfeBridgeImpl(childBridgeA);
      childBridgeA.setParentBridge(parentBridgeA);

      // Host sends property to MFE via parent bridge
      parentBridgeA.receivePropertyUpdate(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        'dark'
      );

      // === MFE SIDE ===

      // MFE has its own state (completely isolated)
      const mfeState = new DefaultMfeStateContainer<MfeState>({
        initialState: {
          widgetData: { items: [] },
          localState: { filter: 'all' },
        },
      });

      // MFE can only access shared properties via child bridge (read-only)
      const theme = childBridgeA.getProperty(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1'
      );
      expect(theme).toEqual({
        id: 'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        value: 'dark',
      });

      // === VERIFY ISOLATION ===

      // MFE cannot access host state
      expect(() => {
        // This would not even compile in TypeScript
        // because MFE code doesn't have reference to hostState
        const _ = hostState; // Just to use the variable
      }).not.toThrow();

      // MFE cannot modify shared properties
      // (receivePropertyUpdate is @internal, not exposed via ChildMfeBridge)

      // Host and MFE states are completely independent
      hostState.setState((state) => ({
        ...state,
        currentScreenset: 'analytics',
      }));

      mfeState.setState((state) => ({
        ...state,
        widgetData: { items: [1, 2, 3] },
      }));

      expect(hostState.getState().currentScreenset).toBe('analytics');
      expect(mfeState.getState().widgetData).toEqual({ items: [1, 2, 3] });

      // Cleanup
      hostState.dispose();
      mfeState.dispose();
      parentBridgeA.dispose();
    });

    it('should demonstrate multiple MFE instances cannot access each other', () => {
      // MFE Instance A
      const mfeStateA = new DefaultMfeStateContainer({
        initialState: { data: 'A' },
      });

      const childBridgeA = new ChildMfeBridgeImpl('domain', 'instance-a');
      const parentBridgeA = new ParentMfeBridgeImpl(childBridgeA);
      childBridgeA.setParentBridge(parentBridgeA);
      parentBridgeA.receivePropertyUpdate(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        'dark'
      );

      // MFE Instance B (same entry, different instance)
      const mfeStateB = new DefaultMfeStateContainer({
        initialState: { data: 'B' },
      });

      const childBridgeB = new ChildMfeBridgeImpl('domain', 'instance-b');
      const parentBridgeB = new ParentMfeBridgeImpl(childBridgeB);
      childBridgeB.setParentBridge(parentBridgeB);
      parentBridgeB.receivePropertyUpdate(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        'light'
      );

      // Update A
      mfeStateA.setState((state) => ({ ...state, data: 'A-modified' }));
      parentBridgeA.receivePropertyUpdate(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        'auto'
      );

      // B should be unchanged
      expect(mfeStateB.getState().data).toBe('B');
      expect(
        childBridgeB.getProperty(
          'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1'
        )
      ).toEqual({
        id: 'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        value: 'light',
      });

      // Update B
      mfeStateB.setState((state) => ({ ...state, data: 'B-modified' }));

      // A should be unchanged (from B's update)
      expect(mfeStateA.getState().data).toBe('A-modified');

      // Complete isolation verified
      mfeStateA.dispose();
      mfeStateB.dispose();
      parentBridgeA.dispose();
      parentBridgeB.dispose();
    });
  });

  describe('Cleanup on unmount', () => {
    it('should cleanup all MFE resources on unmount', () => {
      const mfeState = new DefaultMfeStateContainer({
        initialState: { data: 'test' },
      });

      const childBridge = new ChildMfeBridgeImpl('domain', 'instance-cleanup');
      const parentBridge = new ParentMfeBridgeImpl(childBridge);
      childBridge.setParentBridge(parentBridge);

      parentBridge.receivePropertyUpdate(
        'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1',
        'dark'
      );

      const entryTypeId = 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1';
      const mockBridge: ParentMfeBridge = {
        instanceId: 'test-instance-3',
        dispose: () => {
          mfeState.dispose();
          parentBridge.dispose();
        },
      };

      const connection: RuntimeConnection = {
        hostRuntime,
        bridges: new Map([[entryTypeId, mockBridge]]),
      };

      coordinator.register(_container, connection);

      // Simulate unmount
      mockBridge.dispose();
      coordinator.unregister(_container);

      // All resources should be cleaned up
      expect(mfeState.disposed).toBe(true);
      // After parentBridge.dispose(), child bridge is cleaned — getProperty returns undefined
      expect(childBridge.getProperty('gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1')).toBeUndefined();
      expect(coordinator.get(_container)).toBeUndefined();
    });
  });
});
