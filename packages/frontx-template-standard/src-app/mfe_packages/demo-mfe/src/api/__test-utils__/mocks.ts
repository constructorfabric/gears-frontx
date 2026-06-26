import {
  createDefaultAccountsMockUser,
  replaceCurrentAccountsMockUser,
} from '../mock-user-store';
import { createResetAccountsMockState } from '@frontx-test-utils/createResetAccountsMockState';

// @cpt-dod:cpt-frontx-dod-api-communication-base-service:p1

// @cpt-begin:cpt-frontx-dod-api-communication-base-service:p1:inst-demo-mfe-api-test-mocks
export const resetAccountsMockState = createResetAccountsMockState(
  createDefaultAccountsMockUser,
  replaceCurrentAccountsMockUser,
);
// @cpt-end:cpt-frontx-dod-api-communication-base-service:p1:inst-demo-mfe-api-test-mocks
