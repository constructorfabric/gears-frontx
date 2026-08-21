/**
 * Package-local i18n, keyed off the host's language shared property.
 *
 * The package ships `en` alone. A support-inbox vocabulary in thirty-six
 * languages is content a project's own translators own, not something a
 * template should invent, and the fallback below already keeps every other
 * language legible: a missing language file loads English and says so once in
 * the console.
 *
 * Both screens share one catalogue - the chrome, the folder labels and the
 * composer are the same words on both - so the glob points at the package's
 * own `i18n/` directory rather than a per-screen one.
 */

import { useCallback, useEffect, useState } from 'react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, type ChildMfeBridge } from '@gears-frontx/react';

type TranslationCatalogue = Record<string, string>;

const languageModules = import.meta.glob<{ default: TranslationCatalogue }>('../i18n/*.json');

const FALLBACK_LANGUAGE = 'en';

const importerFor = (language: string) =>
  languageModules[`../i18n/${language}.json`] ?? languageModules[`../i18n/${FALLBACK_LANGUAGE}.json`];

const readLanguage = (bridge: ChildMfeBridge): string => {
  const property = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
  return typeof property?.value === 'string' ? property.value : FALLBACK_LANGUAGE;
};

export type ScreenTranslations = {
  t: (key: string) => string;
  /** True until the first catalogue has loaded, and never again. */
  loading: boolean;
};

export function useScreenTranslations(bridge: ChildMfeBridge): ScreenTranslations {
  const [language, setLanguage] = useState<string>(() => readLanguage(bridge));
  const [catalogue, setCatalogue] = useState<TranslationCatalogue>({});
  const [loading, setLoading] = useState(true);

  // The lazy initializer runs on mount only. If the host swaps the bridge
  // instance, re-read during render: a subscription delivers future changes
  // and never fires for the value the new bridge already holds.
  const [previousBridge, setPreviousBridge] = useState(bridge);
  if (previousBridge !== bridge) {
    setPreviousBridge(bridge);
    setLanguage(readLanguage(bridge));
  }

  useEffect(
    () =>
      bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, (property) => {
        if (typeof property.value === 'string') setLanguage(property.value);
      }),
    [bridge]
  );

  useEffect(() => {
    const importer = importerFor(language);
    if (!importer) {
      console.error(`[inbox-mfe] No translations at all, not even ${FALLBACK_LANGUAGE}.`);
      return undefined;
    }
    if (!languageModules[`../i18n/${language}.json`]) {
      console.warn(
        `[inbox-mfe] No translations for "${language}"; falling back to ${FALLBACK_LANGUAGE}.`
      );
    }

    // The catalogue is swapped from the import's own callback, never from this
    // effect's body: a language change should replace the words in place, not
    // blank the screen back to its loading state on the way.
    let current = true;
    importer()
      .then((module) => {
        if (!current) return;
        setCatalogue(module.default);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!current) return;
        console.error(`[inbox-mfe] Failed to load translations for "${language}"`, error);
        setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [language]);

  const t = useCallback(
    (key: string): string => {
      const translation = catalogue[key];
      if (translation === undefined) {
        console.warn(`[inbox-mfe] Missing translation key: ${key}`);
        return key;
      }
      return translation;
    },
    [catalogue]
  );

  return { t, loading };
}
