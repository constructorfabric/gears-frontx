// @cpt-flow:cpt-frontx-flow-studio-devtools-restore-settings:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-persistence:p1
import { useEffect, useRef } from 'react';
import { eventBus } from '@gears-frontx/react';
import { loadStudioState } from '../utils/persistence';
import { STORAGE_KEYS } from '../types';

/**
 * Restore theme, language, and mock mode from localStorage on mount.
 * Emits the framework events that the framework already subscribes to.
 */
// @cpt-begin:cpt-frontx-flow-studio-devtools-restore-settings:p1:inst-1
export const useRestoreStudioSettings = (): void => {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const themeId = loadStudioState<string | null>(STORAGE_KEYS.THEME, null);
    if (themeId != null && typeof themeId === 'string' && themeId.length > 0) {
      eventBus.emit('theme/changed', { themeId });
    }

    const language = loadStudioState<string | null>(STORAGE_KEYS.LANGUAGE, null);
    if (language != null && typeof language === 'string' && language.length > 0) {
      eventBus.emit('i18n/language/changed', { language });
    }

    const mockEnabled = loadStudioState<boolean | null>(STORAGE_KEYS.MOCK_ENABLED, null);
    if (typeof mockEnabled === 'boolean') {
      eventBus.emit('mock/toggle', { enabled: mockEnabled });
    }
  }, []);
};
// @cpt-end:cpt-frontx-flow-studio-devtools-restore-settings:p1:inst-1
