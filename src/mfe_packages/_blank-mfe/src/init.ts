/**
 * MFE Bootstrap — executed once when any entry first loads.
 * Creates the minimal HAI3 app, registers slices, effects, and API services.
 */
// @cpt-dod:cpt-hai3-dod-mfe-isolation-internal-dataflow:p1
// @cpt-flow:cpt-hai3-flow-mfe-isolation-mfe-bootstrap:p1

import { createHAI3, registerSlice, apiRegistry, effects, mock } from '@gears-frontx/react';
import { homeSlice } from './slices/homeSlice';
import { initHomeEffects } from './effects/homeEffects';
import { _BlankApiService } from './api/_BlankApiService';

// Register API services BEFORE build — mock plugin syncs during build(),
// so services must already be present for mock activation to find them
apiRegistry.register(_BlankApiService);
apiRegistry.initialize();

// Create HAI3 app with effects + mock plugins (mock auto-enables on localhost)
const mfeApp = createHAI3().use(effects()).use(mock()).build();

// Register slices with effects (needs store from build())
registerSlice(homeSlice, initHomeEffects);

export { mfeApp };
