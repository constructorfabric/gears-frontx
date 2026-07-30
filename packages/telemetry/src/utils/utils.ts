import type { TelemetryData } from './eventTypes';
import type { TelemetryConfig, TelemetryConfigNormalized } from './types';

export function normalizeOptions(config: TelemetryConfig): TelemetryConfigNormalized {
  const apiVersion = config.apiVersion ?? 1;
  const configUrl =
    config.url ?? (apiVersion === 1 ? '/api/events' : `/api/telemetry/v${apiVersion}/events`);
  return {
    enabled: config?.enabled ?? true,
    verbose: config?.verbose ?? false,
    url: configUrl,
    storagePrefix: config.storagePrefix,
    appName: config.appName,
    appVersion: config.appVersion,
    autocapture: config.autocapture ?? true,
    sessionDuration: config.sessionDuration ?? 30 * 60 * 1000, // 30 minutes
    apiVersion,
  };
}

export function toJSONLikeValues(object: TelemetryData) {
  return Object.keys(object).reduce<Record<string, string>>((acc, key) => {
    return {
      ...acc,
      [key]: JSON.stringify(object[key]),
    };
  }, {});
}

export function getLocalStorageKey(scope: string, storagePrefix?: string) {
  return `telemetry_${storagePrefix ? `${storagePrefix}_` : ''}${scope}`;
}
