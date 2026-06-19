/**
 * Accounts Domain - Mock Data
 * Mock responses for accounts service endpoints
 *
 * Used with MockPlugin for development and testing.
 * Keys are full URL patterns (including baseURL path).
 */

import type { MockMap } from '@gears-frontx/react';
import { Language } from '@gears-frontx/react';
import { UserRole, type ApiUser, type GetCurrentUserResponse } from './types';

/**
 * Mock user data
 */
const mockUser: ApiUser = {
  id: 'mock-user-001',
  email: 'demo@frontx.org',
  firstName: 'Demo',
  lastName: 'User',
  role: UserRole.Admin,
  language: Language.English,
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Demo',
  createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  updatedAt: new Date('2024-12-01T00:00:00Z').toISOString(),
  extra: {
    department: 'Engineering',
  },
};

/**
 * Accounts mock map
 * Keys are full URL patterns (including /api/accounts baseURL)
 */
export const accountsMockMap: MockMap = {
  'GET /api/accounts/user/current': (): GetCurrentUserResponse => ({
    user: mockUser,
  }),
};
