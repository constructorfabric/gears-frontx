import axios from 'axios';

import { apiRegistry } from '@gears-frontx/api';
import { createHAI3 } from '@gears-frontx/framework';
import { auth } from '@gears-frontx/framework';

import { DummyJsonService } from './dummyjson-service.mjs';

/**
 * Scenario C: AbortSignal cancellation bypasses auth onError chain.
 *
 * Expected:
 * - request is canceled
 * - axios.isCancel(error) === true
 * - provider.refresh is NOT called
 */

apiRegistry.reset?.();
apiRegistry.register(DummyJsonService);
apiRegistry.initialize();

const svc = apiRegistry.getService(DummyJsonService);
const login = await svc.login();

const state = {
  token: login.accessToken,
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
  async refresh() {
    state.refreshCalls += 1;
    return null;
  },
};

createHAI3().use(auth({ provider })).build();

const ac = new AbortController();
const p = svc.me({ signal: ac.signal });
ac.abort();

try {
  await p;
  throw new Error('Expected request to be canceled');
} catch (e) {
  if (!axios.isCancel(e)) {
    throw new Error(`Expected axios cancel error, got: ${String(e)}`);
  }
}

if (state.refreshCalls !== 0) {
  throw new Error(`Expected refreshCalls=0, got ${state.refreshCalls}`);
}

console.log('[abort] OK:', { refreshCalls: state.refreshCalls });
