import { getTelemetrySession, saveTelemetrySession } from '../utils/sessionUtils';
import type { TelemetryContext, TelemetrySession } from '../utils/types';

export type SessionManager = ReturnType<typeof createSessionManager>;

export function createSessionManager(context: TelemetryContext) {
  const refreshSessionDebounced = debounce(refreshSession, 100);
  const refreshEvents = ['scroll', 'keydown', 'click'];

  return {
    start,
    destroy,
    getSession,
    refreshSession,
  };

  function debounce(fn: () => void, timeout: number) {
    let id: ReturnType<typeof setTimeout>;

    return function () {
      clearTimeout(id);
      id = setTimeout(() => fn(), timeout);
    };
  }

  // This method is used to create a new session or update the last activity of the current session
  function start() {
    trackEvents();
  }

  function getSession() {
    return getTelemetrySession(context.config);
  }

  function refreshSession() {
    const storedSession = getSession();
    // modify the session to update the last activity
    const newSession: TelemetrySession = {
      id: storedSession?.id ?? crypto.randomUUID(),
      lastActivity: Date.now(),
      startTime: storedSession?.startTime ?? Date.now(),
    };

    const saveError = saveTelemetrySession(context.config, newSession);

    if (saveError) {
      context.logger.logError(saveError);
    }
  }

  function trackEvents() {
    refreshEvents.forEach((event) => window.addEventListener(event, refreshSessionDebounced));
  }

  function destroy() {
    refreshEvents.forEach((event) => window.removeEventListener(event, refreshSessionDebounced));
  }
}
