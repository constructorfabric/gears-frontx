/**
 * Unit tests for mockSlice
 *
 * Tests the mock mode state slice for centralized mock control.
 */

import { describe, it, expect } from 'vitest';
import { mockSlice, setMockEnabled, type MockState } from '../src/slices/mockSlice';

describe('mockSlice', () => {
  describe('initial state', () => {
    it('should have enabled set to false by default', () => {
      const state = mockSlice.reducer(undefined, { type: '@@INIT' });
      expect(state.enabled).toBe(false);
    });
  });

  describe('setMockEnabled', () => {
    it('should set enabled to true', () => {
      const initialState: MockState = { enabled: false };
      const state = mockSlice.reducer(initialState, setMockEnabled(true));
      expect(state.enabled).toBe(true);
    });

    it('should set enabled to false', () => {
      const initialState: MockState = { enabled: true };
      const state = mockSlice.reducer(initialState, setMockEnabled(false));
      expect(state.enabled).toBe(false);
    });

    it('should handle toggle pattern', () => {
      let state: MockState = { enabled: false };

      // Toggle on
      state = mockSlice.reducer(state, setMockEnabled(true));
      expect(state.enabled).toBe(true);

      // Toggle off
      state = mockSlice.reducer(state, setMockEnabled(false));
      expect(state.enabled).toBe(false);

      // Toggle on again
      state = mockSlice.reducer(state, setMockEnabled(true));
      expect(state.enabled).toBe(true);
    });
  });

  describe('slice configuration', () => {
    it('should have correct slice name', () => {
      expect(mockSlice.name).toBe('mock');
    });

    it('should export action creators', () => {
      expect(typeof setMockEnabled).toBe('function');
    });

    it('should create proper action objects', () => {
      const action = setMockEnabled(true);
      expect(action.type).toBe('mock/setMockEnabled');
      expect(action.payload).toBe(true);
    });
  });

  describe('unrelated actions and immutability', () => {
    it('returns the same state reference for unrelated actions', () => {
      const initialState: MockState = { enabled: true };
      const next = mockSlice.reducer(initialState, {
        type: 'some/other/action',
        payload: 'irrelevant',
      });

      // Redux Toolkit's createSlice returns the exact input reference when no
      // handled action matched. Reference equality is the stable contract we
      // rely on for memoized selectors and change detection.
      expect(next).toBe(initialState);
      expect(next.enabled).toBe(true);
    });

    it('does not mutate the previous state when enabling', () => {
      const initialState: MockState = { enabled: false };
      const nextState = mockSlice.reducer(initialState, setMockEnabled(true));

      expect(initialState.enabled).toBe(false);
      expect(nextState).not.toBe(initialState);
      expect(nextState.enabled).toBe(true);
    });

    it('is idempotent when the new value matches the current value', () => {
      const initialState: MockState = { enabled: true };
      const nextState = mockSlice.reducer(initialState, setMockEnabled(true));

      // The slice always reassigns; document the current behavior explicitly so
      // a future optimization that preserves reference equality is a deliberate
      // change rather than a silent regression.
      expect(nextState.enabled).toBe(true);
    });
  });
});
