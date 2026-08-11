import type {
  TelemetryApiPayload,
  TelemetryApiPayloadV2,
  TelemetryRecord,
  TelemetryRecordId,
  TelemetryEventRecord,
  TelemetryLogEventParams,
} from '../utils/eventTypes';
import { createScheduler } from '../utils/scheduler';
import type { TelemetryContext } from '../utils/types';
import { toJSONLikeValues } from '../utils/utils';

export type EventsManager = {
  start: () => void;
  destroy: () => void;
  logEvent: (...args: TelemetryLogEventParams) => TelemetryRecord;
};

// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-record-build:p1
// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-flush:p1
// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-envelope:p2
// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-record-identity:p1
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-enrichment:p1
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-batching:p1
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-delivery-suppression:p1
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-envelope:p2
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
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-teardown-drain
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    // Flush rather than cancel: whatever is queued is up to 5s of events, and the POST carries
    // `keepalive` so it survives the teardown that prompted this call.
    scheduler.exec();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-teardown-drain
  }

  function handleVisibilityChange() {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-check-hidden
    if (document.visibilityState !== 'hidden') {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-return-still-visible
      return;
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-return-still-visible
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-check-hidden
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-exec-drain
    scheduler.exec();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-forced-drain:p1:inst-exec-drain
  }

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-collect-record
  function logEvent(...args: TelemetryLogEventParams): TelemetryRecord {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-normalize-params
    const { name, data, ...overrides } = normalizeParams(args);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-normalize-params

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-log-call
    logger.logMessage('TelemetryClient: logEvent', name, data, currentPageRecordId);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-log-call

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-build-record
    const record: TelemetryRecord = {
      name,
      data,
      // Applied after the caller-supplied overrides so a caller (or a hook contribution merged
      // into them) can never override the event's own identity.
      ...overrides,
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-apply-identity-last
      id: crypto.randomUUID(),
      time_triggered: new Date().getTime(),
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-apply-identity-last
    };
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-build-record

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-call-event-hook
    hooks.callHooksSync('event', record);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-call-event-hook

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-enqueue
    queue.push(record);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-enqueue
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-schedule-drain
    scheduler.schedule();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-schedule-drain

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-return-record
    return record;
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-record-build:p1:inst-return-record
  }
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-collect-record

  function normalizeParams(params: TelemetryLogEventParams): TelemetryEventRecord {
    if (typeof params[0] === 'string') {
      return { name: params[0], data: params[1] };
    }

    return params[0];
  }

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-deliver-batch
  function flush() {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-check-empty-queue
    if (!queue.length) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-return-nothing-queued
      return;
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-return-nothing-queued
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-check-empty-queue

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-build-envelope
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-check-version
    const payload: TelemetryApiPayload | TelemetryApiPayloadV2 =
      config.apiVersion === 1 ? getPayload(queue) : getPayloadV2(queue);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-check-version
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-build-envelope

    // Drained before the delivery flag is consulted, so suppressing delivery changes exactly one
    // step and leaves collection behaviour identical.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-drain-queue
    queue = [];
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-drain-queue

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-check-delivery-flag
    if (config.enabled === false) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-return-delivery-suppressed
      return;
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-return-delivery-suppressed
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-check-delivery-flag

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-post-batch
    fetch(config.url, {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/vnd.kafka.json.v2+json',
        Accept: 'application/vnd.kafka.v2+json, application/vnd.kafka+json, application/json',
      },
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-post-batch
      // The batch is already drained, so a rejection loses it. No retry — a known gap.
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-catch-rejection
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-report-loss
    }).catch(console.error);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-report-loss
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-flush:p1:inst-catch-rejection
  }
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-deliver-batch

  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-v1-keyed-records
  function getPayload(events: TelemetryRecord[]): TelemetryApiPayload {
    const records = events.map((event) => {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-stamp-sent
      const value = { ...event, time_sent: new Date().getTime() };
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-stamp-sent

      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-each-object-field
      for (const key of Object.keys(value)) {
        const item = value[key as keyof TelemetryRecord];

        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-convert-object-field
          // @ts-expect-error overwrite object to match API requirements
          value[key] = toJSONLikeValues(item);
          // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-convert-object-field
        }
      }
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-each-object-field

      return { key: event.id, value };
    });

    return { records };
  }
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-v1-keyed-records

  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-version-two
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

        // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-remove-omitted
        if (removedKeys.includes(key as keyof TelemetryRecord)) {
          delete newRecord[key as keyof TelemetryRecord];
        }
        // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-remove-omitted
      }
      return newRecord;
    });

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-check-multi
    if (cleanedRecords.length > 1) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-find-common
      const keys = Object.keys(cleanedRecords[0]) as (keyof TelemetryRecord)[];
      for (const key of keys) {
        const firstValue = cleanedRecords[0][key];
        const isSameValue = cleanedRecords.every((item) => item[key] === firstValue);

        if (isSameValue) {
          meta[key] = firstValue as undefined;
        }
      }
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-find-common
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-hoist-common
      const metaKeys = Object.keys(meta) as (keyof TelemetryRecord)[];
      for (const key of metaKeys) {
        cleanedRecords.forEach((item) => {
          delete item[key];
        });
      }
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-hoist-common
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-check-multi

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-v2-return
    return { meta, records: cleanedRecords };
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-v2-return
  }
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-envelope:p2:inst-version-two
}
