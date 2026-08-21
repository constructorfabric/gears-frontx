/**
 * MFE bootstrap - executed once when either entry first loads.
 *
 * Both lifecycles import this module, so the app instance, the registered
 * service and the mock map are created once and shared between the two
 * screens - which is also what lets a cross-screen jump keep the data it
 * already fetched.
 *
 * Cache/runtime note:
 * - The host app owns the shared runtime via queryCache().
 * - Child apps join that shared QueryClient via queryCacheShared().
 * - Do not add queryCache(), createFrontXApp(), or QueryClientProvider here.
 */

import {
  apiRegistry,
  createFrontX,
  effects,
  mock,
  queryCacheShared,
} from '@gears-frontx/react';
import { InboxApiService } from './api/InboxApiService';

// Register API services BEFORE build - the mock plugin syncs during build(),
// so services must already be present for mock activation to find them.
apiRegistry.register(InboxApiService);
apiRegistry.initialize();

const mfeApp = createFrontX().use(effects()).use(queryCacheShared()).use(mock()).build();

export { mfeApp };
