/**
 * Accounts Domain - API Service
 * Service for accounts domain (users, tenants, authentication, permissions)
 *
 * MFE-local service. The MFE bundles its own copy of @gears-frontx/react and registers
 * services into its own isolated apiRegistry instance.
 */

import { BaseApiService, RestProtocol, RestMockPlugin } from '@gears-frontx/react';
import type { GetCurrentUserResponse } from './types';
import { accountsMockMap } from './mocks';

/**
 * Accounts API Service for the demo MFE.
 * Manages accounts domain endpoints:
 * - User management (current user, profile, preferences)
 */
export class AccountsApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({
      timeout: 30000,
    });

    super({ baseURL: '/api/accounts' }, restProtocol);

    // Register mock plugin (framework controls when it's active based on mock mode toggle)
    this.registerPlugin(
      restProtocol,
      new RestMockPlugin({
        mockMap: accountsMockMap,
        delay: 100,
      })
    );
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<GetCurrentUserResponse> {
    return this.protocol(RestProtocol).get<GetCurrentUserResponse>('/user/current');
  }
}
