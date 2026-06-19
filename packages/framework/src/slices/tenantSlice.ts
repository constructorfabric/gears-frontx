// @cpt-state:cpt-hai3-state-framework-composition-tenant:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-app-config:p1
import { createSlice, type ReducerPayload } from '@gears-frontx/state';
import type { TenantState, Tenant } from '../layoutTypes';

/**
 * Tenant slice for managing tenant state
 *
 * This slice is NOT part of the layout domain. It lives at the app level
 * as a separate top-level slice: state['app/tenant']
 *
 * Event-driven: Listen for 'app/tenant/changed' to update tenant
 */

const SLICE_KEY = 'app/tenant' as const;

const initialState: TenantState = {
  tenant: null,
  loading: false,
};

// @cpt-begin:cpt-hai3-state-framework-composition-tenant:p1:inst-1
const { slice, setTenant, setTenantLoading, clearTenant } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setTenant: (state: TenantState, action: ReducerPayload<Tenant | null>) => {
      state.tenant = action.payload;
      state.loading = false;
    },
    setTenantLoading: (state: TenantState, action: ReducerPayload<boolean>) => {
      state.loading = action.payload;
    },
    clearTenant: (state: TenantState) => {
      state.tenant = null;
      state.loading = false;
    },
  },
});

// @cpt-end:cpt-hai3-state-framework-composition-tenant:p1:inst-1
export const tenantSlice = slice;
export const tenantActions = { setTenant, setTenantLoading, clearTenant };

export { setTenant, setTenantLoading, clearTenant };

export default slice.reducer;
