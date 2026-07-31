import { describe, it, expect } from 'vitest';
import {
  mfeSlice,
  addExtensionMounted,
  removeExtensionMounted,
  setExtensionRegistering,
  setExtensionRegistered,
  setExtensionError,
  selectMountedExtensions,
} from '../slice';
import type { MfeState } from '../slice';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const reducer = mfeSlice.reducer;

function emptyState(): MfeState {
  return reducer(undefined, { type: '@@INIT' });
}

// Wrap state in the RootState shape for selectMountedExtensions.
function withMfe(mfe: MfeState): { mfe: MfeState } {
  return { mfe };
}

// ─── addExtensionMounted ──────────────────────────────────────────────────────

describe('addExtensionMounted', () => {
  it('creates domain entry with first extension', () => {
    const next = reducer(emptyState(), addExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    expect(next.mountedExtensions['d1']).toEqual(['e1']);
  });

  it('appends second extension preserving insertion order', () => {
    let state = reducer(emptyState(), addExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    state = reducer(state, addExtensionMounted({ domainId: 'd1', extensionId: 'e2' }));
    expect(state.mountedExtensions['d1']).toEqual(['e1', 'e2']);
  });

  it('is idempotent — duplicate dispatch is a no-op', () => {
    let state = reducer(emptyState(), addExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    state = reducer(state, addExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    expect(state.mountedExtensions['d1']).toEqual(['e1']);
  });
});

// ─── removeExtensionMounted ───────────────────────────────────────────────────

describe('removeExtensionMounted', () => {
  it('removes the named extension from an existing list', () => {
    let state = reducer(emptyState(), addExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    state = reducer(state, addExtensionMounted({ domainId: 'd1', extensionId: 'e2' }));
    state = reducer(state, removeExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    expect(state.mountedExtensions['d1']).toEqual(['e2']);
  });

  it('is a no-op when the extension is absent from the list', () => {
    let state = reducer(emptyState(), addExtensionMounted({ domainId: 'd1', extensionId: 'e2' }));
    state = reducer(state, removeExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    expect(state.mountedExtensions['d1']).toEqual(['e2']);
  });

  it('is a no-op when the domain does not exist', () => {
    const before = emptyState();
    const after = reducer(before, removeExtensionMounted({ domainId: 'unknown', extensionId: 'e1' }));
    expect(after.mountedExtensions).toEqual(before.mountedExtensions);
  });
});

// ─── selectMountedExtensions ──────────────────────────────────────────────────

describe('selectMountedExtensions', () => {
  it('returns the domain array for a known domain', () => {
    let state = reducer(emptyState(), addExtensionMounted({ domainId: 'd1', extensionId: 'e1' }));
    state = reducer(state, addExtensionMounted({ domainId: 'd1', extensionId: 'e2' }));
    expect(selectMountedExtensions(withMfe(state), 'd1')).toEqual(['e1', 'e2']);
  });

  it('returns [] for an unknown domain — never undefined', () => {
    const result = selectMountedExtensions(withMfe(emptyState()), 'ghost');
    expect(result).toBeDefined();
    expect(result).toEqual([]);
  });
});

// ─── Registration reducers ────────────────────────────────────────────────────

describe('registration reducers', () => {
  it('setExtensionRegistering sets state to registering', () => {
    const state = reducer(emptyState(), setExtensionRegistering({ extensionId: 'ext-1' }));
    expect(state.registrationStates['ext-1']).toBe('registering');
  });

  it('setExtensionRegistered sets state to registered', () => {
    const state = reducer(emptyState(), setExtensionRegistered({ extensionId: 'ext-1' }));
    expect(state.registrationStates['ext-1']).toBe('registered');
  });

  it('setExtensionError sets state to error and populates errors map', () => {
    const state = reducer(
      emptyState(),
      setExtensionError({ extensionId: 'ext-1', error: 'load failed' })
    );
    expect(state.registrationStates['ext-1']).toBe('error');
    expect(state.errors['ext-1']).toBe('load failed');
  });
});
