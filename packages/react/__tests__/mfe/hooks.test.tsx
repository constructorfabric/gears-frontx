/**
 * MFE Hooks Tests
 *
 * Tests for MFE context and hooks in @gears-frontx/react.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import {
  MfeProvider,
  useMfeContext,
  useMfeBridge,
  useSharedProperty,
  useHostAction,
  type MfeContextValue,
} from '../../src/mfe';
import type { ChildMfeBridge } from '@gears-frontx/framework';

// ============================================================================
// Mock Data
// ============================================================================

const mockBridge: ChildMfeBridge = {
  domainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',
  instanceId: 'test-instance-123',
  executeActionsChain: vi.fn().mockResolvedValue(undefined),
  subscribeToProperty: vi.fn().mockReturnValue(() => {}),
  getProperty: vi.fn().mockReturnValue(undefined),
};

const mockMfeContextValue: MfeContextValue = {
  bridge: mockBridge,
  extensionId: 'test-extension-1',
  domainId: mockBridge.domainId,
};

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock Redux store.
 */
function createMockStore() {
  return configureStore({
    reducer: {
      mfe: () => ({
        registrationStates: {},
        errors: {},
      }),
    },
  });
}

/**
 * Wrapper component with MFE and Redux providers.
 */
function createWrapper(
  mfeValue: MfeContextValue,
  store: ReturnType<typeof createMockStore>
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ReduxProvider store={store}>
        <MfeProvider value={mfeValue}>{children}</MfeProvider>
      </ReduxProvider>
    );
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MfeContext', () => {
  describe('14.5.1 MfeProvider context provision', () => {
    it('should provide MFE context to children', () => {
      const store = createMockStore();
      const wrapper = createWrapper(mockMfeContextValue, store);

      const { result } = renderHook(() => useMfeContext(), { wrapper });

      expect(result.current).toEqual(mockMfeContextValue);
      expect(result.current.bridge).toBe(mockBridge);
      expect(result.current.extensionId).toBe('test-extension-1');
    });

    it('should throw error when used outside MfeProvider', () => {
      expect(() => {
        renderHook(() => useMfeContext());
      }).toThrow('useMfeContext must be used within a MfeProvider');
    });
  });

  describe('14.5.2 useMfeBridge hook', () => {
    it('should return bridge from context', () => {
      const store = createMockStore();
      const wrapper = createWrapper(mockMfeContextValue, store);

      const { result } = renderHook(() => useMfeBridge(), { wrapper });

      expect(result.current).toBe(mockBridge);
      expect(result.current.domainId).toBe(mockBridge.domainId);
      expect(result.current.instanceId).toBe(mockBridge.instanceId);
    });

    it('should throw error when used outside MFE context', () => {
      expect(() => {
        renderHook(() => useMfeBridge());
      }).toThrow('useMfeContext must be used within a MfeProvider');
    });
  });

  describe('14.5.3 useSharedProperty subscription', () => {
    it('should return undefined when property is not set', () => {
      const store = createMockStore();
      const wrapper = createWrapper(mockMfeContextValue, store);

      const { result } = renderHook(
        () => useSharedProperty('gts.frontx.mfes.comm.shared_property.v1~test.user_data.v1'),
        { wrapper }
      );

      // Returns undefined when bridge.getProperty() returns undefined
      expect(result.current).toBeUndefined();
      expect(mockBridge.getProperty).toHaveBeenCalledWith('gts.frontx.mfes.comm.shared_property.v1~test.user_data.v1');
      expect(mockBridge.subscribeToProperty).toHaveBeenCalledWith(
        'gts.frontx.mfes.comm.shared_property.v1~test.user_data.v1',
        expect.any(Function)
      );
    });
  });

  describe('14.5.5 useHostAction callback', () => {
    it('should return callback function', () => {
      const store = createMockStore();
      const wrapper = createWrapper(mockMfeContextValue, store);

      const { result } = renderHook(
        () => useHostAction('gts.frontx.mfes.comm.action.v1~test.navigate.v1'),
        { wrapper }
      );

      expect(typeof result.current).toBe('function');
    });

    it('should send actions chain when callback is invoked', () => {
      const store = createMockStore();
      const wrapper = createWrapper(mockMfeContextValue, store);

      const { result } = renderHook(
        () => useHostAction('gts.frontx.mfes.comm.action.v1~test.navigate.v1'),
        { wrapper }
      );

      // Invoke the callback
      result.current({ path: '/dashboard' });

      // Should call bridge.executeActionsChain with proper structure
      expect(mockBridge.executeActionsChain).toHaveBeenCalledWith({
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~test.navigate.v1',
          target: mockBridge.domainId,
          payload: { path: '/dashboard' },
        },
      });
    });
  });

  // HAI3Provider MFE detection testing is deferred to integration tests.
  // The feature (when mfeBridge prop is provided, wrap children with MfeProvider)
  // requires full HAI3 app instance with store, registries, and plugin initialization.
  // It will be properly tested when:
  // - Bridge communication layer is complete
  // - Integration tests with Chrome DevTools MCP Runtime are available
  // - Full MFE lifecycle scenarios can be tested end-to-end
});
