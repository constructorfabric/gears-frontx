import { createSlice, type ReducerPayload } from '@gears-frontx/state';
import type { SidebarState, SidebarPosition } from '../layoutTypes';

/**
 * Sidebar slice for managing sidebar state and configuration
 */

const SLICE_KEY = 'layout/sidebar' as const;

const initialState: SidebarState = {
  collapsed: false,
  position: 'left',
  title: null,
  content: null,
  visible: false,
  width: 256,
};

const {
  slice,
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
} = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    toggleSidebar: (state: SidebarState) => {
      state.collapsed = !state.collapsed;
    },
    setSidebarCollapsed: (state: SidebarState, action: ReducerPayload<boolean>) => {
      state.collapsed = action.payload;
    },
    setSidebarPosition: (state: SidebarState, action: ReducerPayload<SidebarPosition>) => {
      state.position = action.payload;
    },
    setSidebarTitle: (state: SidebarState, action: ReducerPayload<string | null>) => {
      state.title = action.payload;
    },
    setSidebarContent: (state: SidebarState, action: ReducerPayload<unknown>) => {
      state.content = action.payload;
    },
    setSidebarVisible: (state: SidebarState, action: ReducerPayload<boolean>) => {
      state.visible = action.payload;
    },
    setSidebarWidth: (state: SidebarState, action: ReducerPayload<number>) => {
      state.width = action.payload;
    },
    setSidebarConfig: (state: SidebarState, action: ReducerPayload<Partial<SidebarState>>) => {
      return { ...state, ...action.payload };
    },
  },
});

export const sidebarSlice = slice;
export {
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
};
export const sidebarActions = {
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
};

export default slice.reducer;
