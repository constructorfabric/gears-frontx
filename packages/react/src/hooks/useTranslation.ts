/**
 * useTranslation Hook - Translation utilities
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-hai3-flow-react-bindings-use-translation:p1
// @cpt-dod:cpt-hai3-dod-react-bindings-translation-hook:p1

import { useMemo, useCallback, useSyncExternalStore } from 'react';
import type { Language } from '@gears-frontx/framework';
import { useHAI3 } from '../HAI3Context';
import type { UseTranslationReturn } from '../types';

/**
 * Hook for accessing translation utilities.
 *
 * @returns Translation utilities
 *
 * @example
 * ```tsx
 * const { t, language, setLanguage, isRTL } = useTranslation();
 *
 * return (
 *   <div dir={isRTL ? 'rtl' : 'ltr'}>
 *     <h1>{t('common:app.title')}</h1>
 *     <p>{t('common:app.welcome', { name: 'John' })}</p>
 *   </div>
 * );
 * ```
 */
// @cpt-begin:cpt-hai3-flow-react-bindings-use-translation:p1:inst-call-translation
// @cpt-begin:cpt-hai3-dod-react-bindings-translation-hook:p1:inst-call-translation
export function useTranslation(): UseTranslationReturn {
  // @cpt-begin:cpt-hai3-flow-react-bindings-use-translation:p1:inst-read-i18n-registry
  const app = useHAI3();
  const { i18nRegistry } = app;
  // @cpt-end:cpt-hai3-flow-react-bindings-use-translation:p1:inst-read-i18n-registry

  // @cpt-begin:cpt-hai3-flow-react-bindings-use-translation:p1:inst-subscribe-i18n
  // @cpt-begin:cpt-hai3-flow-react-bindings-use-translation:p1:inst-rerender-on-lang-change
  // Subscribe to translation changes using useSyncExternalStore
  // Uses version counter to trigger re-renders when translations change
  const version = useSyncExternalStore(
    useCallback(
      (callback: () => void) => {
        // Subscribe to translation changes (new translations registered)
        return i18nRegistry.subscribe(callback);
      },
      [i18nRegistry]
    ),
    () => i18nRegistry.getVersion(),
    () => i18nRegistry.getVersion()
  );
  // @cpt-end:cpt-hai3-flow-react-bindings-use-translation:p1:inst-subscribe-i18n
  // @cpt-end:cpt-hai3-flow-react-bindings-use-translation:p1:inst-rerender-on-lang-change

  // Get current language (memoized to avoid unnecessary recalculations)
  // version is used to trigger recalculation when translations change
  const language = useMemo(() => {
    void version; // Trigger recalculation when version changes
    return i18nRegistry.getLanguage();
  }, [i18nRegistry, version]);

  // Translation function
  const t = useCallback(
    (key: string, params?: Record<string, string | number | boolean>) => {
      return i18nRegistry.t(key, params);
    },
    [i18nRegistry]
  );

  // @cpt-begin:cpt-hai3-flow-react-bindings-use-translation:p1:inst-set-language
  // Set language via framework action (emits event bus for MFE propagation)
  const setLanguage = useCallback(
    (lang: Language) => {
      if (app.actions.setLanguage) {
        app.actions.setLanguage({ language: lang });
      }
    },
    [app.actions]
  );
  // @cpt-end:cpt-hai3-flow-react-bindings-use-translation:p1:inst-set-language

  // Check RTL - recomputes when language changes
  const isRTL = useMemo(() => {
    // Reference language to trigger recalculation on language change
    void language;
    return i18nRegistry.isRTL();
  }, [i18nRegistry, language]);

  // @cpt-begin:cpt-hai3-flow-react-bindings-use-translation:p1:inst-return-translation-api
  return {
    t,
    language,
    setLanguage,
    isRTL,
  };
  // @cpt-end:cpt-hai3-flow-react-bindings-use-translation:p1:inst-return-translation-api
}
// @cpt-end:cpt-hai3-flow-react-bindings-use-translation:p1:inst-call-translation
// @cpt-end:cpt-hai3-dod-react-bindings-translation-hook:p1:inst-call-translation
