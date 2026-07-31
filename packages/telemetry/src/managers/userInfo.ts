import type { TelemetryRecord, TelemetryUserId } from '../utils/eventTypes';
import type { TelemetryContext } from '../utils/types';

export function createUserInfoManager(context: TelemetryContext) {
  let userId: TelemetryUserId | undefined = undefined;

  context.hooks.addHook('event', onEvent);

  return {
    identify,
  };

  function identify(newUserId: TelemetryUserId) {
    userId = newUserId;
  }

  function onEvent(record: TelemetryRecord) {
    // `0` is a legal TelemetryUserId, so absence is the only reason to skip.
    if (userId === undefined) {
      return;
    }

    record.context_user_id = userId;
  }
}
