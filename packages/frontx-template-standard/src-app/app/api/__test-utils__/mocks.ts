import type { ApiUser } from '../types';
import {
  createDefaultAccountsMockUser,
  readCurrentAccountsMockUser,
  replaceCurrentAccountsMockUser,
} from '../mock-user-store';
import { createResetAccountsMockState } from '@frontx-test-utils/createResetAccountsMockState';

// @cpt-dod:cpt-frontx-dod-api-communication-base-service:p1

// @cpt-begin:cpt-frontx-dod-api-communication-base-service:p1:inst-app-api-test-mocks
export const getMockUser = (): ApiUser => readCurrentAccountsMockUser();

export const resetAccountsMockState = createResetAccountsMockState(
  createDefaultAccountsMockUser,
  replaceCurrentAccountsMockUser,
);
// @cpt-end:cpt-frontx-dod-api-communication-base-service:p1:inst-app-api-test-mocks
