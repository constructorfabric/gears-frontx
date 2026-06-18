// @cpt-flow:cpt-hai3-flow-studio-devtools-restore-settings:p1
// @cpt-algo:cpt-hai3-algo-studio-devtools-restore-gts-validation:p1
// @cpt-dod:cpt-hai3-dod-studio-devtools-persistence:p1
import { useEffect, useRef } from 'react';
import {
  eventBus,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type ScreensetsRegistry,
  type Extension,
  type ScreenExtension,
} from '@gears-frontx/react';
import { loadStudioState } from '../utils/persistence';
import { STORAGE_KEYS } from '../types';

function isScreenExtension(ext: Extension): ext is ScreenExtension {
  return 'presentation' in ext && typeof (ext as ScreenExtension).presentation === 'object';
}

/**
 * Restore theme, language, and mock mode from localStorage on mount.
 * Emits the framework events that the framework already subscribes to.
 */
// @cpt-begin:cpt-hai3-flow-studio-devtools-restore-settings:p1:inst-1
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
// @cpt-end:cpt-hai3-flow-studio-devtools-restore-settings:p1:inst-1

/**
 * Restore GTS Package selection when registry becomes available.
 * Mounts the persisted package's first screen extension.
 */
// @cpt-begin:cpt-hai3-algo-studio-devtools-restore-gts-validation:p1:inst-1
export const useRestoreGtsPackage = (registry: ScreensetsRegistry | null | undefined): void => {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !registry) return;

    const activePackageId = loadStudioState<string | null>(STORAGE_KEYS.ACTIVE_PACKAGE_ID, null);
    if (!activePackageId || typeof activePackageId !== 'string') return;

    restoredRef.current = true;

    const restore = async (): Promise<void> => {
      try {
        const extensions = registry.getExtensionsForPackage(activePackageId);
        const screenExtensions = extensions.filter(
          (ext: Extension) => ext.domain === FRONTX_SCREEN_DOMAIN && isScreenExtension(ext)
        ) as ScreenExtension[];

        if (screenExtensions.length === 0) return;

        screenExtensions.sort((a, b) => (a.presentation.order ?? 0) - (b.presentation.order ?? 0));
        const firstExtension = screenExtensions[0];

        await registry.executeActionsChain({
          action: {
            type: FRONTX_ACTION_MOUNT_EXT,
            target: FRONTX_SCREEN_DOMAIN,
            payload: { extensionId: firstExtension.id },
          },
        });
      } catch {
        // Skip restore on error (e.g. extension no longer registered)
      }
    };

    void restore();
  }, [registry]);
};
// @cpt-end:cpt-hai3-algo-studio-devtools-restore-gts-validation:p1:inst-1
