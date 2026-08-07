import { getTelemetrySession, saveTelemetrySession } from '../utils/sessionUtils';
import type { TelemetryContext, TelemetrySession } from '../utils/types';

export type SessionManager = ReturnType<typeof createSessionManager>;

const REFRESH_DEBOUNCE_MS = 100;

// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1
// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2
// @cpt-state:cpt-frontx-telemetry-state-event-collection-session:p2
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-session:p1
export function createSessionManager(context: TelemetryContext) {
  const refreshSessionDebounced = debounce(refreshSession, REFRESH_DEBOUNCE_MS);
  const refreshEvents = ['scroll', 'keydown', 'click'];

  return {
    start,
    destroy,
    getSession,
    refreshSession,
  };

  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-debounce-refresh
  function debounce(fn: () => void, timeout: number) {
    let id: ReturnType<typeof setTimeout> | undefined;

    return Object.assign(
      function () {
        clearTimeout(id);
        // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-refresh-once
        id = setTimeout(() => fn(), timeout);
        // @cpt-end:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-refresh-once
      },
      { cancel: () => clearTimeout(id) }
    );
  }
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-debounce-refresh

  // This method is used to create a new session or update the last activity of the current session
  function start() {
    trackEvents();
  }

  function getSession() {
    return getTelemetrySession(context.config);
  }

  function refreshSession() {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-read-session
    const storedSession = getSession();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-read-session
    // modify the session to update the last activity
    // A stored session that is still inside the inactivity window is continued; one that is
    // absent or expired yields undefined from the read above, so a new identity is minted here.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-continue-session
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-session-expired
    // @cpt-begin:cpt-frontx-telemetry-state-event-collection-session:p2:inst-active-to-active
    const newSession: TelemetrySession = {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-mint-session
      // @cpt-begin:cpt-frontx-telemetry-state-event-collection-session:p2:inst-absent-to-active
      // @cpt-begin:cpt-frontx-telemetry-state-event-collection-session:p2:inst-expired-to-active
      id: storedSession?.id ?? crypto.randomUUID(),
      // @cpt-end:cpt-frontx-telemetry-state-event-collection-session:p2:inst-expired-to-active
      // @cpt-end:cpt-frontx-telemetry-state-event-collection-session:p2:inst-absent-to-active
      lastActivity: Date.now(),
      startTime: storedSession?.startTime ?? Date.now(),
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-mint-session
    };
    // @cpt-end:cpt-frontx-telemetry-state-event-collection-session:p2:inst-active-to-active
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-session-expired
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-continue-session

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-write-session
    const saveError = saveTelemetrySession(context.config, newSession);
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-write-session

    // A failed write costs persisted continuity, not collection: it is reported and execution
    // continues.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-check-write-error
    if (saveError) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-report-write-error
      context.logger.logError(saveError);
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-report-write-error
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-session-refresh:p1:inst-check-write-error
  }

  function trackEvents() {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-attach-activity
    refreshEvents.forEach((event) => window.addEventListener(event, refreshSessionDebounced));
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-attach-activity
  }

  function destroy() {
    // Removal uses the same listener reference the attach used, or it would not match.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-detach-activity
    refreshEvents.forEach((event) => window.removeEventListener(event, refreshSessionDebounced));
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-activity-observation:p2:inst-detach-activity
    // A refresh debounced just before teardown would otherwise fire after it.
    refreshSessionDebounced.cancel();
  }
}
