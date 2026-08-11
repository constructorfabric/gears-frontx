import type { TelemetryData } from './eventTypes';
import type { TelemetryConfig, TelemetryConfigNormalized } from './types';

// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-construction:p1
export function normalizeOptions(config: TelemetryConfig): TelemetryConfigNormalized {
  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-resolve-endpoint
  const apiVersion = config.apiVersion ?? 1;
  const configUrl =
    config.url ?? (apiVersion === 1 ? '/api/events' : `/api/telemetry/v${apiVersion}/events`);
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-resolve-endpoint
  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-return-normalized
  return {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-default-flags
    enabled: config?.enabled ?? true,
    verbose: config?.verbose ?? false,
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-default-flags
    url: configUrl,
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-carry-required
    storagePrefix: config.storagePrefix,
    appName: config.appName,
    appVersion: config.appVersion,
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-carry-required
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-default-values
    autocapture: config.autocapture ?? true,
    sessionDuration: config.sessionDuration ?? 30 * 60 * 1000, // 30 minutes
    apiVersion,
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-default-values
  };
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-normalize-config:p2:inst-return-normalized
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
