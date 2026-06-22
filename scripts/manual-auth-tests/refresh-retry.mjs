import { apiRegistry } from '@gears-frontx/api';
import { createFrontX } from '@gears-frontx/framework';
import { auth } from '@gears-frontx/framework';

import { DummyJsonService } from './dummyjson-service.mjs';

/**
 * Scenario B: refresh + retry on 401.
 *
 * Expected:
 * - initial /auth/me with bad token -> 401
 * - auth() calls provider.refresh()
 * - auth() retries original request with new token
 * - final /auth/me succeeds
 *
 * Note:
 * - DummyJSON refresh expects refreshToken in JSON body, not in Authorization header.
 * - provider.refresh uses fetch directly to avoid recursion through @gears-frontx/api + auth plugin.
 */

apiRegistry.reset?.();
apiRegistry.register(DummyJsonService);
apiRegistry.initialize();

const svc = apiRegistry.getService(DummyJsonService);
const login = await svc.login();

const state = {
  token: 'bad-token',
  refreshToken: login.refreshToken,
  refreshCalls: 0,
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
  async refresh(ctx) {
    state.refreshCalls += 1;
    const res = await fetch('https://dummyjson.com/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken, expiresInMins: 5 }),
      signal: ctx?.signal,
    });
    if (!res.ok) return null;
    const next = await res.json();
    state.token = next.accessToken;
    state.refreshToken = next.refreshToken;
    return { kind: 'bearer', token: state.token, refreshToken: state.refreshToken };
  },
};

createFrontX().use(auth({ provider })).build();

const me = await svc.me();
if (!me || typeof me !== 'object') {
  throw new Error('Unexpected /auth/me response');
}

if (state.refreshCalls !== 1) {
  throw new Error(`Expected refreshCalls=1, got ${state.refreshCalls}`);
}

console.log('[refresh-retry] OK:', {
  refreshCalls: state.refreshCalls,
  id: me.id,
  username: me.username,
});
