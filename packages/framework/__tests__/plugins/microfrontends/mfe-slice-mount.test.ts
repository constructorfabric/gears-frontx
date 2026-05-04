/**
 * MFE Slice Mount State Tests
 *
 * Tests for mount/unmount state tracking via the array-based reducers
 * (`addExtensionMounted` / `removeExtensionMounted`) and the plural selector
 * (`selectMountedExtensions`). The slice holds per-domain insertion-ordered
 * string arrays — multi-mount domains accumulate multiple extension IDs;
 * single-mount domains hold zero or one entry. Reducers are idempotent so
 * unserialized concurrent dispatches converge to the registry's canonical
 * mount-set.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  mfeSlice,
  addExtensionMounted,
  removeExtensionMounted,
  selectMountedExtensions,
  type MfeState,
} from '../../../src/plugins/microfrontends';

const SCREEN_DOMAIN_ID =
  'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.screen.v1';
const SIDEBAR_DOMAIN_ID =
  'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.sidebar.v1';
const POPUP_DOMAIN_ID =
  'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.popup.v1';
const WIDGETS_DOMAIN_ID =
  'gts.hai3.mfes.ext.domain.v1~hai3.widgets.area.main.v1';

const HOME_EXTENSION_ID =
  'gts.hai3.mfes.ext.extension.v1~test.app.home.v1';
const SETTINGS_EXTENSION_ID =
  'gts.hai3.mfes.ext.extension.v1~test.app.settings.v1';
const REPLACEMENT_EXTENSION_ID =
  'gts.hai3.mfes.ext.extension.v1~test.app.replacement.v1';
const WIDGET_ALPHA_ID =
  'gts.hai3.mfes.ext.extension.v1~hai3.widgets.fixture_a.widget_alpha.v1';
const WIDGET_BETA_ID =
  'gts.hai3.mfes.ext.extension.v1~hai3.widgets.fixture_a.widget_beta.v1';
const WIDGET_B_ID =
  'gts.hai3.mfes.ext.extension.v1~hai3.widgets.fixture_b.widget_main.v1';

function emptyState(): MfeState {
  return { registrationStates: {}, errors: {}, mountedExtensions: {} };
}

describe('MFE Slice - Mount State', () => {
  describe('addExtensionMounted reducer', () => {
    it('appends extensionId to mountedExtensions[domainId]', () => {
      const next = mfeSlice.reducer(emptyState(), addExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: HOME_EXTENSION_ID }));
      expect(next.mountedExtensions[SCREEN_DOMAIN_ID]).toEqual([HOME_EXTENSION_ID]);
    });

    it('accumulates multiple extension IDs for a multi-mount domain (insertion-ordered)', () => {
      let state = emptyState();
      state = mfeSlice.reducer(state, addExtensionMounted({ domainId: WIDGETS_DOMAIN_ID, extensionId: WIDGET_ALPHA_ID }));
      state = mfeSlice.reducer(state, addExtensionMounted({ domainId: WIDGETS_DOMAIN_ID, extensionId: WIDGET_BETA_ID }));
      state = mfeSlice.reducer(state, addExtensionMounted({ domainId: WIDGETS_DOMAIN_ID, extensionId: WIDGET_B_ID }));
      expect(state.mountedExtensions[WIDGETS_DOMAIN_ID]).toEqual([WIDGET_ALPHA_ID, WIDGET_BETA_ID, WIDGET_B_ID]);
    });

    it('is idempotent — appending the same ID twice leaves the array unchanged', () => {
      let state = emptyState();
      state = mfeSlice.reducer(state, addExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: HOME_EXTENSION_ID }));
      state = mfeSlice.reducer(state, addExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: HOME_EXTENSION_ID }));
      expect(state.mountedExtensions[SCREEN_DOMAIN_ID]).toEqual([HOME_EXTENSION_ID]);
    });
  });

  describe('removeExtensionMounted reducer', () => {
    it('removes the named extension from mountedExtensions[domainId]', () => {
      const initial: MfeState = { ...emptyState(), mountedExtensions: { [SCREEN_DOMAIN_ID]: [HOME_EXTENSION_ID] } };
      const next = mfeSlice.reducer(initial, removeExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: HOME_EXTENSION_ID }));
      expect(next.mountedExtensions[SCREEN_DOMAIN_ID]).toEqual([]);
    });

    it('removes only the named extension, preserving siblings (multi-mount)', () => {
      const initial: MfeState = { ...emptyState(), mountedExtensions: { [WIDGETS_DOMAIN_ID]: [WIDGET_ALPHA_ID, WIDGET_BETA_ID, WIDGET_B_ID] } };
      const next = mfeSlice.reducer(initial, removeExtensionMounted({ domainId: WIDGETS_DOMAIN_ID, extensionId: WIDGET_BETA_ID }));
      expect(next.mountedExtensions[WIDGETS_DOMAIN_ID]).toEqual([WIDGET_ALPHA_ID, WIDGET_B_ID]);
    });

    it('is a no-op when the extension is not in the array', () => {
      const initial: MfeState = { ...emptyState(), mountedExtensions: { [SCREEN_DOMAIN_ID]: [HOME_EXTENSION_ID] } };
      const next = mfeSlice.reducer(initial, removeExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: REPLACEMENT_EXTENSION_ID }));
      expect(next.mountedExtensions[SCREEN_DOMAIN_ID]).toEqual([HOME_EXTENSION_ID]);
    });

    it('is a no-op when the domain has no entries', () => {
      const next = mfeSlice.reducer(emptyState(), removeExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: HOME_EXTENSION_ID }));
      const slot = next.mountedExtensions[SCREEN_DOMAIN_ID] ?? [];
      expect(slot).toEqual([]);
    });
  });

  describe('selectMountedExtensions selector', () => {
    function withMfe(mfe: MfeState) {
      return { mfe } as unknown as Parameters<typeof selectMountedExtensions>[0];
    }

    it('returns the insertion-ordered array of mounted extension IDs for a domain', () => {
      const state: MfeState = {
        ...emptyState(),
        mountedExtensions: {
          [SCREEN_DOMAIN_ID]: [HOME_EXTENSION_ID],
          [SIDEBAR_DOMAIN_ID]: [SETTINGS_EXTENSION_ID],
          [WIDGETS_DOMAIN_ID]: [WIDGET_ALPHA_ID, WIDGET_BETA_ID, WIDGET_B_ID],
        },
      };
      expect(selectMountedExtensions(withMfe(state), SCREEN_DOMAIN_ID)).toEqual([HOME_EXTENSION_ID]);
      expect(selectMountedExtensions(withMfe(state), SIDEBAR_DOMAIN_ID)).toEqual([SETTINGS_EXTENSION_ID]);
      expect(selectMountedExtensions(withMfe(state), WIDGETS_DOMAIN_ID)).toEqual([WIDGET_ALPHA_ID, WIDGET_BETA_ID, WIDGET_B_ID]);
    });

    it('returns an empty array for a domain with no mounted extension — never undefined', () => {
      const state: MfeState = { ...emptyState(), mountedExtensions: { [SCREEN_DOMAIN_ID]: [HOME_EXTENSION_ID] } };
      expect(selectMountedExtensions(withMfe(state), POPUP_DOMAIN_ID)).toEqual([]);
    });

    it('returns an empty array after the only extension in a domain has been removed', () => {
      let state: MfeState = { ...emptyState(), mountedExtensions: { [SCREEN_DOMAIN_ID]: [HOME_EXTENSION_ID] } };
      state = mfeSlice.reducer(state, removeExtensionMounted({ domainId: SCREEN_DOMAIN_ID, extensionId: HOME_EXTENSION_ID }));
      expect(selectMountedExtensions(withMfe(state), SCREEN_DOMAIN_ID)).toEqual([]);
    });
  });
});
