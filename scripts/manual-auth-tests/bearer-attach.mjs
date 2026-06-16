import { apiRegistry } from '@gears-frontx/api';
import { createHAI3 } from '@gears-frontx/framework';
import { auth } from '@gears-frontx/framework';

import { DummyJsonService } from './dummyjson-service.mjs';

/**
 * Scenario A: bearer token attachment.
 *
 * Expected:
 * - login succeeds
 * - subsequent /auth/me call succeeds (200) because auth() adds Authorization header
 */

apiRegistry.reset?.();
apiRegistry.register(DummyJsonService);
apiRegistry.initialize();

const svc = apiRegistry.getService(DummyJsonService);
const login = await svc.login();

const state = {
  token: login.accessToken,
};

const provider = {
  async getSession() {
    return state.token ? { kind: 'bearer', token: state.token } : null;
  },
  async checkAuth() {
    return { authenticated: !!state.token };
  },
  async logout() {
    state.token = null;
    return { type: 'none' };
  },
};

createHAI3().use(auth({ provider })).build();

const me = await svc.me();
if (!me || typeof me !== 'object') {
  throw new Error('Unexpected /auth/me response');
}

console.log('[bearer-attach] OK:', {
  id: me.id,
  username: me.username,
});
