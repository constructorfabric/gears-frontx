/**
 * MFE Slice
 *
 * Store slice for managing MFE registration states.
 * Tracks registration state (unregistered, registering, registered, error) and error messages per extension.
 */

// @cpt-state:cpt-hai3-state-framework-composition-mfe-registration:p1
// @cpt-state:cpt-hai3-state-framework-composition-mfe-mount:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-mfe-plugin:p1

import { createSlice, type ReducerPayload } from '@gears-frontx/state';

// ============================================================================
// State Types
// ============================================================================

/** Extension registration state */
export type ExtensionRegistrationState = 'unregistered' | 'registering' | 'registered' | 'error';

/** MFE slice state */
export interface MfeState {
  registrationStates: Record<string, ExtensionRegistrationState>;
  errors: Record<string, string>;
  /** Tracks which extension is mounted in each domain. Used as a notification signal for React hooks. */
  mountedExtensions: Record<string, string | undefined>;
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

// @cpt-begin:cpt-hai3-state-framework-composition-mfe-registration:p1:inst-1
// @cpt-begin:cpt-hai3-state-framework-composition-mfe-mount:p1:inst-1
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

    // Mount state reducers
    setExtensionMounted: (state: MfeState, action: ReducerPayload<{ domainId: string; extensionId: string }>) => {
      state.mountedExtensions[action.payload.domainId] = action.payload.extensionId;
    },

    setExtensionUnmounted: (state: MfeState, action: ReducerPayload<{ domainId: string }>) => {
      state.mountedExtensions[action.payload.domainId] = undefined;
    },
  },
});
// @cpt-end:cpt-hai3-state-framework-composition-mfe-registration:p1:inst-1
// @cpt-end:cpt-hai3-state-framework-composition-mfe-mount:p1:inst-1

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
  setExtensionMounted,
  setExtensionUnmounted,
} = actions;

// ============================================================================
// Selectors
// ============================================================================

/**
 * Select extension registration state for an extension.
 * Returns 'unregistered' if extension is not tracked.
 */
export function selectExtensionState(state: { mfe: MfeState }, extensionId: string): ExtensionRegistrationState {
  return state.mfe.registrationStates[extensionId] ?? 'unregistered';
}

/**
 * Select all registered extensions.
 * Returns array of extension IDs with 'registered' state.
 */
export function selectRegisteredExtensions(state: { mfe: MfeState }): string[] {
  return Object.entries(state.mfe.registrationStates)
    .filter(([_, regState]) => regState === 'registered')
    .map(([extensionId]) => extensionId);
}

/**
 * Select extension error for an extension.
 * Returns undefined if no error.
 */
export function selectExtensionError(state: { mfe: MfeState }, extensionId: string): string | undefined {
  return state.mfe.errors[extensionId];
}

/**
 * Select mounted extension for a domain.
 * Returns the extension ID if mounted, undefined otherwise.
 */
export function selectMountedExtension(state: { mfe: MfeState }, domainId: string): string | undefined {
  return state.mfe.mountedExtensions[domainId];
}

export default slice.reducer;
