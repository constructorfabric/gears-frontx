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

/**
 * `window.localStorage` and `window.sessionStorage` arrive as bare objects with
 * no methods on them in this environment, which the workspace's own storage
 * helpers read as "site data is blocked" and fall back from. That fallback is a
 * real branch, but it is not the one the browser takes, so the suite would be
 * asserting against the wrong half of the code. An in-memory Storage gives the
 * tests the behaviour a browser has.
 */
const createStorageStub = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  };
};

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(window, name, { writable: true, value: createStorageStub() });
}
