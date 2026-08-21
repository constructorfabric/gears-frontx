/**
 * jsdom implements no media-query engine, so `window.matchMedia` is simply
 * absent and the screens' own breakpoint hook would throw before rendering
 * anything. The stub answers "no match" for every query, which is the desktop
 * layout - the one the smoke tests assert against.
 */
const matchMediaStub = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaStub,
});
