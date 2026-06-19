import { createSlice, type ReducerPayload } from '@gears-frontx/state';
import type { FooterState } from '../layoutTypes';

/**
 * Footer slice for managing footer configuration
 */

const SLICE_KEY = 'layout/footer' as const;

const initialState: FooterState = {
  screensetOptions: [],
  visible: true,
};

const { slice, setFooterVisible, setFooterConfig, ...restActions } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setFooterVisible: (state: FooterState, action: ReducerPayload<boolean>) => {
      state.visible = action.payload;
    },
    setFooterConfig: (state: FooterState, action: ReducerPayload<Partial<FooterState>>) => {
      return { ...state, ...action.payload };
    },
  },
});

export const footerSlice = slice;
export { setFooterVisible, setFooterConfig };
export const footerActions = { setFooterVisible, setFooterConfig, ...restActions };

export default slice.reducer;
