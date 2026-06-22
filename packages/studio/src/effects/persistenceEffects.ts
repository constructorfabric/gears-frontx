// @cpt-algo:cpt-frontx-algo-studio-devtools-persistence-init:p1
import { eventBus } from '@gears-frontx/react';
import { StudioEvents } from '../events/studioEvents';
import { saveStudioState } from '../utils/persistence';
import { STORAGE_KEYS } from '../types';

/**
 * Persistence Effects
 * Listen to Studio UI events and framework events; update localStorage.
 * Treats localStorage as a "slice" for Studio UI state and control panel settings.
 */

/**
 * Initialize all persistence effects
 * Call this once when Studio mounts
 */
// @cpt-begin:cpt-frontx-algo-studio-devtools-persistence-init:p1:inst-1
export const initPersistenceEffects = (): (() => void) => {
  // Position changed listener
  const positionSubscription = eventBus.on(
    StudioEvents.PositionChanged,
    ({ position }) => {
      saveStudioState(STORAGE_KEYS.POSITION, position);
    }
  );

  // Size changed listener
  const sizeSubscription = eventBus.on(
    StudioEvents.SizeChanged,
    ({ size }) => {
      saveStudioState(STORAGE_KEYS.SIZE, size);
    }
  );

  // Button position changed listener
  const buttonPositionSubscription = eventBus.on(
    StudioEvents.ButtonPositionChanged,
    ({ position }) => {
      saveStudioState(STORAGE_KEYS.BUTTON_POSITION, position);
    }
  );

  // Theme changed (framework event)
  const themeSubscription = eventBus.on('theme/changed', (payload) => {
    saveStudioState(STORAGE_KEYS.THEME, payload.themeId);
  });

  // Language changed (framework event)
  const languageSubscription = eventBus.on('i18n/language/changed', (payload) => {
    saveStudioState(STORAGE_KEYS.LANGUAGE, payload.language);
  });

  // Mock toggle (framework event)
  const mockSubscription = eventBus.on('mock/toggle', (payload) => {
    saveStudioState(STORAGE_KEYS.MOCK_ENABLED, payload.enabled);
  });

  // Return cleanup function to unsubscribe all listeners
  return () => {
    positionSubscription.unsubscribe();
    sizeSubscription.unsubscribe();
    buttonPositionSubscription.unsubscribe();
    themeSubscription.unsubscribe();
    languageSubscription.unsubscribe();
    mockSubscription.unsubscribe();
  };
};
// @cpt-end:cpt-frontx-algo-studio-devtools-persistence-init:p1:inst-1
