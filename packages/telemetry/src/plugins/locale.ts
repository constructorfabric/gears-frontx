import type { TelemetryRecord } from '../utils/eventTypes';
import type { TelemetryPluginContext } from '../utils/types';

/**
 * The minimal shape the locale plugin needs from a localization library. An `i18next` instance
 * satisfies it as-is; so does react-intl behind a one-line adapter, or a plain
 * `{ get language() { … } }` getter. Read on every event, so a live instance stays live.
 */
export type LocaleSource = {
  language: string;
};

export function normalizeLocale(language: string): string {
  try {
    const locale = new Intl.Locale(language).maximize();
    return locale.region ? `${locale.language}-${locale.region}` : language;
  } catch {
    return language;
  }
}

export function telemetryLocalePlugin(source: LocaleSource) {
  return {
    name: 'locale',
    setup: (context: TelemetryPluginContext) => {
      context.addHook('event', onEvent);

      function onEvent(record: TelemetryRecord) {
        record.context_language = normalizeLocale(source.language);
      }
    },
  };
}
