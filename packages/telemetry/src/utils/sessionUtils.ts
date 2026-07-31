import type { TelemetryConfigNormalized, TelemetrySession } from './types';
import { getLocalStorageKey } from './utils';

function isTimeStamp(time: string | number) {
  return Number(time) ? new Date(Number(time)).getTime() > 0 : false;
}

export function getSessionKey(storageKey?: string) {
  return getLocalStorageKey('session', storageKey);
}

/** Returns the error when the write fails, so the caller can route it through its logger. */
export function saveTelemetrySession(config: TelemetryConfigNormalized, value: TelemetrySession) {
  try {
    localStorage.setItem(getSessionKey(config.storagePrefix), JSON.stringify(value));
    return undefined;
  } catch (e) {
    return e;
  }
}

export function getTelemetrySession(
  config: TelemetryConfigNormalized,
): TelemetrySession | undefined {
  try {
    const key = getSessionKey(config.storagePrefix);
    const sessionRaw = localStorage.getItem(key);

    const session = sessionRaw ? (JSON.parse(sessionRaw) as TelemetrySession) : null;

    if (!session) {
      return;
    }

    const fields: (keyof TelemetrySession)[] = ['id', 'lastActivity', 'startTime'];
    const hasFields = fields.every((field) =>
      Object.prototype.hasOwnProperty.call(session, field),
    );

    // if the session is missing any of the required fields, return null
    if (!hasFields) return;

    // start time must be a number(timestamp)
    if (!isTimeStamp(session.startTime)) return;

    // if the session has already ended, return null
    if (
      !isTimeStamp(session.lastActivity) ||
      session.lastActivity <= Date.now() - config.sessionDuration
    )
      return;

    return session;
  } catch {
    return;
  }
}
