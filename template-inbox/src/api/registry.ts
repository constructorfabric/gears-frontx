/**
 * The app's API services, registered once at boot.
 *
 * `apiRegistry` rather than a bare `new InboxApiService()` because the registry
 * is where a second service goes: it instantiates on registration and hands the
 * same instance to every caller, so a screen asks for a service by class and
 * never has to be told where the instance lives.
 */

import { apiRegistry } from '@gears-frontx/api';
import { InboxApiService } from './InboxApiService';

export function registerApiServices(): void {
  if (apiRegistry.has(InboxApiService)) return;
  apiRegistry.register(InboxApiService);
  apiRegistry.initialize();

  // The one place this app decides that the seeded dataset answers rather than
  // a server. Delete this line the day there is a server.
  apiRegistry.getService(InboxApiService).useMocks(true);
}

export const getInboxApi = (): InboxApiService => apiRegistry.getService(InboxApiService);
