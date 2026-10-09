import { useEffect, useRef } from 'react';

/** A ref that always holds the value of the latest committed render. */
export function useLatest<T>(value: T) {
  const ref = useRef<T>(value);

  // Written in an effect, not during render: React does not recommend mutating a ref while
  // rendering. https://react.dev/reference/react/useRef#caveats
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
