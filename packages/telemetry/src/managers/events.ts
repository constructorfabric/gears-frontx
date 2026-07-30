import type {
  TelemetryApiPayload,
  TelemetryApiPayloadV2,
  TelemetryRecord,
  TelemetryRecordId,
  TelemetryEventRecord,
  TelemetryLogEventParams,
} from '../utils/eventTypes';
import type { TelemetryContext } from '../utils/types';
import { toJSONLikeValues } from '../utils/utils';
import { createScheduler } from './scheduler';

export type EventsManager = {
  start: () => void;
  destroy: () => void;
  logEvent: (...args: TelemetryLogEventParams) => TelemetryRecord;
};

export function createEventsManager({ hooks, config, logger }: TelemetryContext): EventsManager {
  const currentPageRecordId: TelemetryRecordId | null = null;
  const scheduler = createScheduler(flush);
  let queue: TelemetryRecord[] = [];

  return {
    start,
    destroy,
    logEvent,
  };

  function start() {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function destroy() {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    scheduler.cancel();
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'hidden') {
      return;
    }
    scheduler.exec();
  }

  function logEvent(...args: TelemetryLogEventParams): TelemetryRecord {
    const { name, data, ...overrides } = normalizeParams(args);

    logger.logMessage('TelemetryClient: logEvent', name, data, currentPageRecordId);

    const record: TelemetryRecord = {
      name,
      data,
      // Applied after the caller-supplied overrides so a caller (or a hook contribution merged
      // into them) can never override the event's own identity.
      ...overrides,
      id: crypto.randomUUID(),
      time_triggered: new Date().getTime(),
    };

    hooks.callHooksSync('event', record);

    queue.push(record);
    scheduler.schedule();

    return record;
  }

  function normalizeParams(params: TelemetryLogEventParams): TelemetryEventRecord {
    if (typeof params[0] === 'string') {
      return { name: params[0], data: params[1] };
    }

    return params[0];
  }

  function flush() {
    if (!queue.length) {
      return;
    }

    const payload: TelemetryApiPayload | TelemetryApiPayloadV2 =
      config.apiVersion === 1 ? getPayload(queue) : getPayloadV2(queue);

    queue = [];

    if (config.enabled === false) {
      return;
    }

    fetch(config.url, {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/vnd.kafka.json.v2+json',
        Accept: 'application/vnd.kafka.v2+json, application/vnd.kafka+json, application/json',
      },
    }).catch(console.error);
  }

  function getPayload(events: TelemetryRecord[]): TelemetryApiPayload {
    const records = events.map((event) => {
      const value = { ...event, time_sent: new Date().getTime() };

      for (const key of Object.keys(value)) {
        const item = value[key as keyof TelemetryRecord];

        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          // @ts-expect-error overwrite object to match API requirements
          value[key] = toJSONLikeValues(item);
        }
      }

      return { key: event.id, value };
    });

    return { records };
  }

  function getPayloadV2(events: TelemetryRecord[]): TelemetryApiPayloadV2 {
    const meta: TelemetryApiPayloadV2['meta'] = {};

    const removedKeys: (keyof TelemetryRecord)[] = ['context_user_id', 'context_tenant_id'];

    const cleanedRecords: TelemetryRecord[] = events.map((record) => {
      const newRecord = { ...record, time_sent: new Date().getTime() };

      for (const key of Object.keys(newRecord)) {
        const item = newRecord[key as keyof TelemetryRecord];

        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          // @ts-expect-error overwrite object to match API requirements
          newRecord[key] = toJSONLikeValues(item);
        }

        if (removedKeys.includes(key as keyof TelemetryRecord)) {
          delete newRecord[key as keyof TelemetryRecord];
        }
      }
      return newRecord;
    });

    if (cleanedRecords.length > 1) {
      const keys = Object.keys(cleanedRecords[0]) as (keyof TelemetryRecord)[];
      for (const key of keys) {
        const firstValue = cleanedRecords[0][key];
        const isSameValue = cleanedRecords.every((item) => item[key] === firstValue);

        if (isSameValue) {
          meta[key] = firstValue as undefined;
        }
      }
      const metaKeys = Object.keys(meta) as (keyof TelemetryRecord)[];
      for (const key of metaKeys) {
        cleanedRecords.forEach((item) => {
          delete item[key];
        });
      }
    }

    return { meta, records: cleanedRecords };
  }
}
