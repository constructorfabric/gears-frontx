/**
 * useScreenTranslations Hook - Screen-level translation loading
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-screen-translations:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-load-screen-translations:p1
// @cpt-state:cpt-frontx-state-react-bindings-screen-translation:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-screen-translation-hook:p1

import { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import type { TranslationMap, TranslationLoader } from '@gears-frontx/framework';
import { useHAI3 } from '../HAI3Context';
import type { UseScreenTranslationsReturn } from '../types';

// Re-export TranslationMap for consumers who need it
export type { TranslationMap };

/**
 * Check if the input is a TranslationLoader function (from I18nRegistry.createLoader)
 * vs a TranslationMap object
 */
function isTranslationLoader(
  input: TranslationMap | TranslationLoader
): input is TranslationLoader {
  return typeof input === 'function';
}

/**
 * Hook for loading screen-level translations.
 * Use this in screen components to lazy-load translations.
 * Automatically reloads translations when language changes.
 *
 * @param screensetId - The screenset ID
 * @param screenId - The screen ID
 * @param translations - Either a TranslationMap object or a TranslationLoader function
 *   (from I18nRegistry.createLoader)
 * @returns Loading state
 *
 * @example
 * ```tsx
 * // Option 1: Using I18nRegistry.createLoader (recommended)
 * const translations = I18nRegistry.createLoader({
 *   en: () => import('./i18n/en.json'),
 *   es: () => import('./i18n/es.json'),
 * });
 *
 * // Option 2: Using raw TranslationMap
 * const translations = {
 *   en: () => import('./i18n/en.json'),
 *   es: () => import('./i18n/es.json'),
 * };
 *
 * export const HomeScreen: React.FC = () => {
 *   const { isLoaded, error } = useScreenTranslations(
 *     'demo',
 *     'home',
 *     translations
 *   );
 *
 *   if (!isLoaded) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return <div>...</div>;
 * };
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-call-screen-translations
// @cpt-begin:cpt-frontx-dod-react-bindings-screen-translation-hook:p1:inst-call-screen-translations
export function useScreenTranslations(
  screensetId: string,
  screenId: string,
  translations: TranslationMap | TranslationLoader
): UseScreenTranslationsReturn {
  const app = useHAI3();
  const { i18nRegistry } = app;

  // Track loading state per language to handle language changes
  // @cpt-begin:cpt-frontx-state-react-bindings-screen-translation:p1:inst-begin-load
  // @cpt-begin:cpt-frontx-state-react-bindings-screen-translation:p1:inst-load-success
  // @cpt-begin:cpt-frontx-state-react-bindings-screen-translation:p1:inst-load-error
  // @cpt-begin:cpt-frontx-state-react-bindings-screen-translation:p1:inst-reload-on-lang-change
  // @cpt-begin:cpt-frontx-state-react-bindings-screen-translation:p2:inst-retry-on-lang-change
  const [loadedLanguage, setLoadedLanguage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // @cpt-end:cpt-frontx-state-react-bindings-screen-translation:p1:inst-begin-load
  // @cpt-end:cpt-frontx-state-react-bindings-screen-translation:p1:inst-load-success
  // @cpt-end:cpt-frontx-state-react-bindings-screen-translation:p1:inst-load-error
  // @cpt-end:cpt-frontx-state-react-bindings-screen-translation:p1:inst-reload-on-lang-change
  // @cpt-end:cpt-frontx-state-react-bindings-screen-translation:p2:inst-retry-on-lang-change

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-subscribe-lang-change
  // Subscribe to translation changes using useSyncExternalStore
  // This ensures we reload when language changes
  const version = useSyncExternalStore(
    useCallback(
      (callback: () => void) => i18nRegistry.subscribe(callback),
      [i18nRegistry]
    ),
    () => i18nRegistry.getVersion(),
    () => i18nRegistry.getVersion()
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-subscribe-lang-change

  // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-get-current-lang
  // Get current language (changes when version changes)
  // version is used to trigger recalculation when translations change
  const currentLanguage = useMemo(() => {
    void version; // Trigger recalculation when version changes
    return i18nRegistry.getLanguage();
  }, [i18nRegistry, version]);
  // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-get-current-lang

  // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-resolve-loader
  // Create a TranslationLoader function from the translation map or use directly if already a loader
  const loader: TranslationLoader = useMemo(() => {
    if (isTranslationLoader(translations)) {
      // Already a loader function (from I18nRegistry.createLoader)
      return translations;
    }

    // Convert TranslationMap to TranslationLoader
    return async (language: string) => {
      const importFn = translations[language as keyof typeof translations];
      if (!importFn) {
        // Return empty dictionary if language not in map
        return {};
      }
      const module = await importFn();
      return module.default;
    };
  }, [translations]);
  // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-resolve-loader

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-run-load-screen-translations
  useEffect(() => {
    // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-skip-if-loaded
    // Skip if no language or already loaded for this language
    if (!currentLanguage || currentLanguage === loadedLanguage) {
      return;
    }
    // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-skip-if-loaded

    let cancelled = false;
    setIsLoading(true);

    const loadTranslations = async () => {
      try {
        const namespace = `screen.${screensetId}.${screenId}`;

        // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-register-loader
        // Register the loader for future language changes
        i18nRegistry.registerLoader(namespace, loader);
        // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-register-loader

        // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-call-loader
        // Actually load the translations for current language
        const loadedTranslations = await loader(currentLanguage);
        // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-call-loader

        // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-register-translations
        i18nRegistry.register(namespace, currentLanguage, loadedTranslations);
        // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-register-translations

        // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-cancel-on-unmount
        if (!cancelled) {
          setLoadedLanguage(currentLanguage);
          setIsLoading(false);
          setError(null);
        }
        // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-cancel-on-unmount
      } catch (err) {
        // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-handle-load-error
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
        // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-handle-load-error
      }
    };

    loadTranslations();

    // @cpt-begin:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-cancel-stale-load
    return () => {
      cancelled = true;
    };
    // @cpt-end:cpt-frontx-algo-react-bindings-load-screen-translations:p1:inst-cancel-stale-load
  }, [screensetId, screenId, loader, i18nRegistry, currentLanguage, loadedLanguage]);
  // @cpt-end:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-run-load-screen-translations

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-return-loading-state
  // Derive isLoaded from whether we've loaded translations for the current language
  const isLoaded = currentLanguage !== null && currentLanguage === loadedLanguage && !isLoading;

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-gate-render
  // isLoaded is the gate value: consumers must check this before rendering translation-dependent UI
  return { isLoaded, error };
  // @cpt-end:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-gate-render
  // @cpt-end:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-return-loading-state
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-screen-translations:p1:inst-call-screen-translations
// @cpt-end:cpt-frontx-dod-react-bindings-screen-translation-hook:p1:inst-call-screen-translations
