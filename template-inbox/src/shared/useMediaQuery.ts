import { useEffect, useState } from 'react';

type MediaQueryState = { query: string; matches: boolean };

const readQuery = (query: string): MediaQueryState => ({
  query,
  matches: window.matchMedia(query).matches,
});

/**
 * Viewport state the panes need in JavaScript rather than in CSS.
 *
 * Which single pane a phone shows depends on whether a conversation is open,
 * and whether the folder column's own toggle is meaningful depends on the
 * width - neither is something a media query can decide on its own, so the
 * breakpoints that drive state live here and the ones that only hide a box
 * stay in the stylesheet.
 */
export function useMediaQuery(query: string): boolean {
  const [state, setState] = useState<MediaQueryState>(() => readQuery(query));

  // Re-read during render rather than from the effect below: a new query has a
  // different answer immediately, and setting it from an effect would render
  // one frame against the previous query's layout.
  if (state.query !== query) {
    setState(readQuery(query));
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) =>
      setState({ query, matches: event.matches });
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [query]);

  return state.matches;
}

/** Below this the folder column has no room and stays collapsed. */
export const COMPACT_QUERY = '(max-width: 48rem)';

/** Below this the list and the thread take turns filling the mount area. */
export const SINGLE_PANE_QUERY = '(max-width: 40rem)';
