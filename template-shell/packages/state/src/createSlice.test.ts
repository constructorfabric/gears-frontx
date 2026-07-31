import { createAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import type { ReducerPayload } from './types';
import { createSlice } from './createSlice';

describe('createSlice', () => {
  it('updates state when a returned reducer action is reduced', () => {
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 0 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
    });

    expect(counter.slice.name).toBe('demo/counter');
    const nextState = counter.slice.reducer(undefined, counter.increment(3));
    expect(nextState).toEqual({ value: 3 });
  });

  it('applies extra reducers alongside top-level reducer actions', () => {
    const addBonus = createAction<number>('demo/addBonus');
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 0 },
      reducers: {
        increment: (state, action: ReducerPayload<number>) => {
          state.value += action.payload;
        },
      },
      extraReducers: (builder) => {
        builder.addCase(addBonus, (state, action) => {
          state.value += action.payload;
        });
      },
    });

    const withReducerAction = counter.slice.reducer(undefined, counter.increment(2));
    const withExtraReducer = counter.slice.reducer(withReducerAction, addBonus(5));

    expect(withExtraReducer).toEqual({ value: 7 });
  });

  it('keeps selectors internal to the registerable slice API', () => {
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 1 },
      reducers: {
        multiply: (state, action: ReducerPayload<number>) => {
          state.value *= action.payload;
        },
      },
      selectors: {
        selectValue: (state) => state.value,
      },
    });

    const nextState = counter.slice.reducer(undefined, counter.multiply(4));

    expect(nextState).toEqual({ value: 4 });
    expect(counter).not.toHaveProperty('selectors');
    expect(counter).not.toHaveProperty('selectValue');
  });

  it('surfaces Redux Toolkit errors for invalid slice names', () => {
    expect(() => {
      createSlice({
        name: '',
        initialState: { value: 0 },
        reducers: {
          increment: (state, action: ReducerPayload<number>) => {
            state.value += action.payload;
          },
        },
      });
    }).toThrow(/name/);
  });

  it('preserves reducer-thrown errors during state transitions', () => {
    const counter = createSlice({
      name: 'demo/counter',
      initialState: { value: 0 },
      reducers: {
        setValue: (state, action: ReducerPayload<number>) => {
          if (action.payload < 0) {
            throw new Error('Counter value must be non-negative');
          }
          state.value = action.payload;
        },
      },
    });

    expect(() => {
      counter.slice.reducer(undefined, counter.setValue(-1));
    }).toThrow(
      'Counter value must be non-negative',
    );
  });
});
