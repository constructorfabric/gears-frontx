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

import { useCallback, useEffect, useRef, useState } from 'react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, type ChildMfeBridge } from '@gears-frontx/react';

type TranslationCatalogue = Record<string, string>;

const languageModules = import.meta.glob<{ default: TranslationCatalogue }>('../i18n/*.json');

const FALLBACK_LANGUAGE = 'en';

const moduleKeyFor = (language: string): string => `../i18n/${language}.json`;

export type ScreenTranslations = {
  t: (key: string) => string;
  loading: boolean;
};

export function useScreenTranslations(bridge: ChildMfeBridge): ScreenTranslations {
  const [catalogue, setCatalogue] = useState<TranslationCatalogue>({});
  const [loading, setLoading] = useState(true);
  // Tracked in a ref rather than state: the subscription callback compares
  // against it to skip a reload the current catalogue already covers, and a
  // state read there would close over the value at subscribe time.
  const currentLanguageRef = useRef<string>(FALLBACK_LANGUAGE);

  const loadCatalogue = useCallback(async (language: string) => {
    currentLanguageRef.current = language;
    setLoading(true);
    const importer = languageModules[moduleKeyFor(language)];
    if (!importer) {
      console.warn(
        `[inbox-mfe] No translations for "${language}"; falling back to ${FALLBACK_LANGUAGE}.`
      );
    }
    const resolved = importer ?? languageModules[moduleKeyFor(FALLBACK_LANGUAGE)];
    try {
      const module = await resolved();
      setCatalogue(module.default);
    } catch (error) {
      console.error(`[inbox-mfe] Failed to load translations for "${language}"`, error);
      setCatalogue({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
    const language = typeof initial?.value === 'string' ? initial.value : FALLBACK_LANGUAGE;
    void loadCatalogue(language);

    return bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, (property) => {
      if (typeof property.value === 'string' && property.value !== currentLanguageRef.current) {
        void loadCatalogue(property.value);
      }
    });
  }, [bridge, loadCatalogue]);

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
