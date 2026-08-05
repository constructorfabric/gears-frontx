/**
 * useLatest - keeps a ref pinned to the most recently rendered value
 *
 * A handful of hooks/components in this package need to read the current
 * value of a prop or option from inside a callback or effect-cleanup closure
 * that must NOT re-run every time that value changes (e.g. a stable
 * useCallback with `[]` deps, or a mount/unmount effect keyed on identity
 * rather than on every option). Stashing the value in a ref sidesteps the
 * closure staleness without pulling the value into the dependency array.
 *
 * The write happens inside a deps-less effect (runs after every commit)
 * rather than during render, because refs must not be mutated while
 * rendering: render can be invoked more than once per commit (React
 * StrictMode's double-invoke, and future concurrent-rendering paths that
 * may discard a render), so a render-time write can leave the ref out of
 * sync with what was actually committed to the DOM. A deps-less effect
 * runs exactly once per real commit, so the ref always reflects the value
 * that was last rendered.
 */

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Returns a ref that always holds the most recently rendered `value`.
 *
 * The ref identity is stable across renders (same object returned every
 * time), so it is safe to add to a `useCallback`/`useEffect` dependency
 * array without causing the callback/effect to be recreated.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);

  // Deps-less: must run after every render so `ref.current` never lags
  // behind the value that was just committed. See module doc for why this
  // write cannot happen during render itself.
  useEffect(() => {
    ref.current = value;
  });

  return ref;
}
