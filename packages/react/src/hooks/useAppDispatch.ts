/**
 * useAppDispatch Hook - Type-safe dispatch hook
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-hai3-flow-react-bindings-use-dispatch:p1
// @cpt-dod:cpt-hai3-dod-react-bindings-redux-hooks:p1

import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@gears-frontx/framework';

/**
 * Type-safe dispatch hook.
 *
 * @returns The typed dispatch function
 *
 * @example
 * ```tsx
 * const dispatch = useAppDispatch();
 * dispatch(someAction());
 * ```
 */
// @cpt-begin:cpt-hai3-flow-react-bindings-use-dispatch:p1:inst-call-dispatch
// @cpt-begin:cpt-hai3-flow-react-bindings-use-dispatch:p1:inst-delegate-dispatch
// @cpt-begin:cpt-hai3-flow-react-bindings-use-dispatch:p1:inst-use-dispatch
// @cpt-begin:cpt-hai3-dod-react-bindings-redux-hooks:p1:inst-use-dispatch
export function useAppDispatch(): AppDispatch {
  // Use untyped useDispatch and cast the result
  // This avoids type constraint issues with react-redux's generic
  return useDispatch() as AppDispatch;
}
// @cpt-end:cpt-hai3-flow-react-bindings-use-dispatch:p1:inst-call-dispatch
// @cpt-end:cpt-hai3-flow-react-bindings-use-dispatch:p1:inst-delegate-dispatch
// @cpt-end:cpt-hai3-flow-react-bindings-use-dispatch:p1:inst-use-dispatch
// @cpt-end:cpt-hai3-dod-react-bindings-redux-hooks:p1:inst-use-dispatch
