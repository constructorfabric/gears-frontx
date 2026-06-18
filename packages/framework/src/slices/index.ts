// @cpt-dod:cpt-hai3-dod-framework-composition-layout:p1

/**
 * Layout Slices
 *
 * @gears-frontx/framework owns all layout domain slices.
 * These slices manage header, footer, menu, sidebar, screen, popup, and overlay state.
 *
 * State access: Components use `useAppSelector` hook from @gears-frontx/react.
 */

import { combineReducers, type Reducer } from '@reduxjs/toolkit';
import type {
  HeaderState,
  FooterState,
  MenuState,
  SidebarState,
  ScreenState,
  OverlayState,
} from '../layoutTypes';

// Import slice reducers
import headerReducer, { headerSlice, headerActions, setUser, setLoading as setHeaderLoading, clearUser } from './headerSlice';
import footerReducer, { footerSlice, footerActions, setFooterVisible, setFooterConfig } from './footerSlice';
import menuReducer, {
  menuSlice,
  menuActions,
  toggleMenu,
  setMenuCollapsed,
  setMenuItems,
  setMenuVisible,
  setMenuConfig,
} from './menuSlice';
import sidebarReducer, {
  sidebarSlice,
  sidebarActions,
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
} from './sidebarSlice';
import screenReducer, {
  screenSlice,
  screenActions,
  setActiveScreen,
  setScreenLoading,
  navigateTo,
  clearActiveScreen,
} from './screenSlice';
import popupReducer, {
  popupSlice,
  popupActions,
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  type PopupSliceState,
} from './popupSlice';
import overlayReducer, {
  overlaySlice,
  overlayActions,
  showOverlay,
  hideOverlay,
  setOverlayVisible,
} from './overlaySlice';
import tenantReducer, {
  tenantSlice,
  tenantActions,
  setTenant,
  setTenantLoading,
  clearTenant,
} from './tenantSlice';
import mockReducer, {
  mockSlice,
  mockActions,
  setMockEnabled,
} from './mockSlice';

// ============================================================================
// Constants
// ============================================================================

export const LAYOUT_SLICE_NAME = 'layout' as const;
export const TENANT_SLICE_NAME = 'app/tenant' as const;

// ============================================================================
// Combined Layout Reducer
// ============================================================================

/** Explicit type for layout domain reducers to avoid incorrect dts generation */
export interface LayoutDomainReducersType {
  header: Reducer<HeaderState>;
  footer: Reducer<FooterState>;
  menu: Reducer<MenuState>;
  sidebar: Reducer<SidebarState>;
  screen: Reducer<ScreenState>;
  popup: Reducer<PopupSliceState>;
  overlay: Reducer<OverlayState>;
}

// @cpt-begin:cpt-hai3-dod-framework-composition-layout:p1:inst-1
export const layoutDomainReducers: LayoutDomainReducersType = {
  header: headerReducer,
  footer: footerReducer,
  menu: menuReducer,
  sidebar: sidebarReducer,
  screen: screenReducer,
  popup: popupReducer,
  overlay: overlayReducer,
};

export const layoutReducer = combineReducers(layoutDomainReducers);
// @cpt-end:cpt-hai3-dod-framework-composition-layout:p1:inst-1

// ============================================================================
// Slice Exports
// ============================================================================

export {
  // Slices
  headerSlice,
  footerSlice,
  menuSlice,
  sidebarSlice,
  screenSlice,
  popupSlice,
  overlaySlice,
  // Action groups
  headerActions,
  // Individual actions - header
  setUser,
  setHeaderLoading,
  clearUser,
  footerActions,
  menuActions,
  sidebarActions,
  screenActions,
  popupActions,
  overlayActions,
  // Individual actions - footer
  setFooterVisible,
  setFooterConfig,
  // Individual actions - menu
  toggleMenu,
  setMenuCollapsed,
  setMenuItems,
  setMenuVisible,
  setMenuConfig,
  // Individual actions - sidebar
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
  // Individual actions - screen
  setActiveScreen,
  setScreenLoading,
  navigateTo,
  clearActiveScreen,
  // Individual actions - popup
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  // Individual actions - overlay
  showOverlay,
  hideOverlay,
  setOverlayVisible,
  // Tenant slice (app-level, not layout)
  tenantSlice,
  tenantActions,
  tenantReducer,
  // Individual actions - tenant
  setTenant,
  setTenantLoading,
  clearTenant,
  // Mock slice (app-level, not layout)
  mockSlice,
  mockActions,
  mockReducer,
  // Individual actions - mock
  setMockEnabled,
};

// Type exports
export type { PopupSliceState };
