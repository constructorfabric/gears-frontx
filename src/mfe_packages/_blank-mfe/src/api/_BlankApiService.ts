/**
 * _Blank Domain - API Service
 * Replace '_Blank' with your screenset name.
 */

import { BaseApiService, RestProtocol, RestMockPlugin } from '@gears-frontx/react';
import { blankMockMap } from './mocks';

/**
 * _Blank API Service
 * Add your domain-specific endpoint methods here.
 */
export class _BlankApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({
      timeout: 30000,
    });

    super({ baseURL: '/api/blank' }, restProtocol);

    this.registerPlugin(
      restProtocol,
      new RestMockPlugin({
        mockMap: blankMockMap,
        delay: 100,
      })
    );
  }
}
