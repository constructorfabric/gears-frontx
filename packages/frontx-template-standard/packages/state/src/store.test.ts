import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReducerPayload } from './types';
import { createSlice } from './createSlice';
import {
  createStore,
  getRegisteredSlices,
  getStore,
  hasSlice,
  registerSlice,
  resetStore,
  unregisterSlice,
} from './store';

describe('store', () => {
  afterEach(() => {
    resetStore();
  });

  it('creates a singleton store with static reducers', () => {
    const counter = createSlice({
      name: 'core/counter',
      initialState: { value: 1 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
    });

    const store = createStore({
      [counter.slice.name]: counter.slice.reducer,
    });

    store.dispatch(counter.increment(2));

    expect(store.getState()).toEqual({
      'core/counter': { value: 3 },
    });
    expect(getStore().getState()).toEqual(store.getState());
    expect(getRegisteredSlices()).toEqual(['core/counter']);
    expect(hasSlice('core/counter')).toBe(true);
  });

  it('registers dynamic slices and initializes effects with store dispatch', () => {
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 0 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
    });
    const initEffects = vi.fn((dispatch) => {
      dispatch(counter.increment(5));
      return vi.fn();
    });

    registerSlice(counter.slice, initEffects);

    expect(hasSlice('demo/counter')).toBe(true);
    expect(getRegisteredSlices()).toEqual(['demo/counter']);
    expect(getStore().getState()).toEqual({
      'demo/counter': { value: 5 },
    });
    expect(initEffects).toHaveBeenCalledTimes(1);
  });

  it('cleans up and re-initializes effects when the same slice re-registers', () => {
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 0 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
    });
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const firstInit = vi.fn((dispatch) => {
      dispatch(counter.increment(1));
      return firstCleanup;
    });
    const secondInit = vi.fn((dispatch) => {
      dispatch(counter.increment(2));
      return secondCleanup;
    });

    registerSlice(counter.slice, firstInit);
    expect(getStore().getState()).toEqual({
      'demo/counter': { value: 1 },
    });

    registerSlice(counter.slice, secondInit);
    expect(getStore().getState()).toEqual({
      'demo/counter': { value: 3 },
    });

    getStore().dispatch(counter.increment(4));

    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(firstInit).toHaveBeenCalledTimes(1);
    expect(secondInit).toHaveBeenCalledTimes(1);
    expect(getStore().getState()).toEqual({
      'demo/counter': { value: 7 },
    });
    expect(getRegisteredSlices()).toEqual(['demo/counter']);
    expect(secondCleanup).not.toHaveBeenCalled();
  });

  it('rejects invalid domain slice keys', () => {
    const invalid = createSlice({
      name: 'demo/counter/extra',
      initialState: { value: 0 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
    });

    expect(() => {
      registerSlice(invalid.slice);
    }).toThrow(/Invalid domain slice key/);
    expect(getRegisteredSlices()).toEqual([]);
  });

  it('unregisters dynamic slices and runs effect cleanup', () => {
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 0 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
    });
    const cleanup = vi.fn();

    registerSlice(counter.slice, () => cleanup);
    unregisterSlice(counter.slice.name);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(hasSlice(counter.slice.name)).toBe(false);
    expect(getRegisteredSlices()).toEqual([]);
  });
});
