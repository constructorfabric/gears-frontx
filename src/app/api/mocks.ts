/**
 * Accounts Domain - Mock Data
 * Mock responses for accounts service endpoints
 *
 * Used with MockPlugin for development and testing.
 * Keys are full URL patterns (including baseURL path).
 */

import type { MockMap } from '@gears-frontx/react';
import type { GetCurrentUserResponse } from './types';
import { readCurrentAccountsMockUser } from './mock-user-store';

/**
 * Accounts mock map
 * Keys are full URL patterns (including /api/accounts baseURL)
 */
export const accountsMockMap: MockMap = {
  'GET /api/accounts/user/current': (): GetCurrentUserResponse => ({
    user: readCurrentAccountsMockUser(),
  }),
};
