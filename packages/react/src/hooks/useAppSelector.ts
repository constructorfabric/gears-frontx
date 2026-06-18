/**
 * useAppSelector Hook - Type-safe selector hook
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-hai3-flow-react-bindings-use-selector:p1
// @cpt-dod:cpt-hai3-dod-react-bindings-redux-hooks:p1

import { useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '@gears-frontx/framework';

/**
 * Type-safe selector hook.
 *
 * @example
 * ```tsx
 * const activeScreen = useAppSelector(selectActiveScreen);
 * const menuCollapsed = useAppSelector(selectMenuCollapsed);
 * ```
 */
// @cpt-begin:cpt-hai3-flow-react-bindings-use-selector:p1:inst-call-selector
// @cpt-begin:cpt-hai3-flow-react-bindings-use-selector:p1:inst-delegate-selector
// @cpt-begin:cpt-hai3-flow-react-bindings-use-selector:p1:inst-return-state
// @cpt-begin:cpt-hai3-flow-react-bindings-use-selector:p1:inst-rerender-on-change
// @cpt-begin:cpt-hai3-dod-react-bindings-redux-hooks:p1:inst-use-selector
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
// @cpt-end:cpt-hai3-flow-react-bindings-use-selector:p1:inst-call-selector
// @cpt-end:cpt-hai3-flow-react-bindings-use-selector:p1:inst-delegate-selector
// @cpt-end:cpt-hai3-flow-react-bindings-use-selector:p1:inst-return-state
// @cpt-end:cpt-hai3-flow-react-bindings-use-selector:p1:inst-rerender-on-change
// @cpt-end:cpt-hai3-dod-react-bindings-redux-hooks:p1:inst-use-selector
