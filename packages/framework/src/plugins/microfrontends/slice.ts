/**
 * MFE Slice
 *
 * Store slice for managing MFE registration states.
 * Tracks registration state (unregistered, registering, registered, error) and error messages per extension.
 */

// @cpt-state:cpt-frontx-state-framework-composition-mfe-registration:p1
// @cpt-state:cpt-frontx-state-framework-composition-mfe-mount:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-mfe-plugin:p1

import { createSlice, type ReducerPayload, type RootState } from '@cyberfabric/state';

// ============================================================================
// State Types
// ============================================================================

/** Extension registration state */
export type ExtensionRegistrationState = 'unregistered' | 'registering' | 'registered' | 'error';

/** MFE slice state */
export interface MfeState {
  registrationStates: Record<string, ExtensionRegistrationState>;
  errors: Record<string, string>;
  /**
   * Tracks the insertion-ordered list of mounted extension IDs per domain.
   * Each key is a domainId; the value is an ordered array of currently-mounted
   * extension IDs. The slice never stores `undefined` for a registered domain —
   * registered-but-empty is represented as `[]`.
   *
   * Multi-mount domains (backed by `ConcurrentMountStrategy`) accumulate multiple
   * IDs; single-mount domains hold at most one element. Managed via the idempotent
   * `addExtensionMounted` / `removeExtensionMounted` reducers.
   */
  mountedExtensions: Record<string, string[]>;
}

declare module '@cyberfabric/state' {
  interface RootState {
    /** Present when the microfrontends plugin is registered. */
    mfe?: MfeState;
  }
}

// ============================================================================
// Initial State
// ============================================================================

const SLICE_KEY = 'mfe' as const;

const initialState: MfeState = {
  registrationStates: {},
  errors: {},
  mountedExtensions: {},
};

// ============================================================================
// Slice Definition
// ============================================================================

// @cpt-begin:cpt-frontx-state-framework-composition-mfe-registration:p1:inst-1
// @cpt-begin:cpt-frontx-state-framework-composition-mfe-mount:p1:inst-1
const { slice, ...actions } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    // Registration state reducers
    setExtensionRegistering: (state: MfeState, action: ReducerPayload<{ extensionId: string }>) => {
      state.registrationStates[action.payload.extensionId] = 'registering';
    },

    setExtensionRegistered: (state: MfeState, action: ReducerPayload<{ extensionId: string }>) => {
      state.registrationStates[action.payload.extensionId] = 'registered';
    },

    setExtensionUnregistered: (state: MfeState, action: ReducerPayload<{ extensionId: string }>) => {
      state.registrationStates[action.payload.extensionId] = 'unregistered';
    },

    setExtensionError: (state: MfeState, action: ReducerPayload<{ extensionId: string; error: string }>) => {
      state.registrationStates[action.payload.extensionId] = 'error';
      state.errors[action.payload.extensionId] = action.payload.error;
    },

    // Mount state reducers — idempotent by design for safe concurrent diff-dispatch
    addExtensionMounted: (state: MfeState, action: ReducerPayload<{ domainId: string; extensionId: string }>) => {
      const { domainId, extensionId } = action.payload;
      if (!state.mountedExtensions[domainId]) {
        state.mountedExtensions[domainId] = [];
      }
      // Append-if-absent: duplicate dispatches from interleaved concurrent chains are no-ops.
      if (!state.mountedExtensions[domainId].includes(extensionId)) {
        state.mountedExtensions[domainId].push(extensionId);
      }
    },

    removeExtensionMounted: (state: MfeState, action: ReducerPayload<{ domainId: string; extensionId: string }>) => {
      const { domainId, extensionId } = action.payload;
      const list = state.mountedExtensions[domainId];
      if (!list) {
        return;
      }
      // No-op-if-absent: idempotent removal; safe when two concurrent chains both remove the same ID.
      const idx = list.indexOf(extensionId);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    },
  },
});
// @cpt-end:cpt-frontx-state-framework-composition-mfe-registration:p1:inst-1
// @cpt-end:cpt-frontx-state-framework-composition-mfe-mount:p1:inst-1

// ============================================================================
// Exports
// ============================================================================

export const mfeSlice = slice;
export const mfeActions = actions;

// Individual actions for convenience
export const {
  setExtensionRegistering,
  setExtensionRegistered,
  setExtensionUnregistered,
  setExtensionError,
  addExtensionMounted,
  removeExtensionMounted,
} = actions;

// ============================================================================
// Selectors
// ============================================================================

/**
 * Select extension registration state for an extension.
 * Returns 'unregistered' if extension is not tracked.
 */
export function selectExtensionState(state: RootState, extensionId: string): ExtensionRegistrationState {
  return state.mfe?.registrationStates[extensionId] ?? 'unregistered';
}

/**
 * Select all registered extensions.
 * Returns array of extension IDs with 'registered' state.
 */
export function selectRegisteredExtensions(state: RootState): string[] {
  const mfe = state.mfe;
  if (!mfe) return [];
  return Object.entries(mfe.registrationStates)
    .filter(([_, regState]) => regState === 'registered')
    .map(([extensionId]) => extensionId);
}

/**
 * Select extension error for an extension.
 * Returns undefined if no error.
 */
export function selectExtensionError(state: RootState, extensionId: string): string | undefined {
  return state.mfe?.errors[extensionId];
}

/**
 * Select the ordered list of mounted extension IDs for a domain.
 * Returns an empty array if no extensions are mounted or the domain is unknown.
 * Safe to call for any domainId — never returns undefined.
 */
export function selectMountedExtensions(state: RootState, domainId: string): readonly string[] {
  return state.mfe?.mountedExtensions[domainId] ?? [];
}

export default slice.reducer;
