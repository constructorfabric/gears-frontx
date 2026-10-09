/*
 * A trailing-edge debounce with `cancel` and `flush`: the part of lodash.debounce's default
 * behaviour the grid relies on. A call restarts the wait, the last call's arguments are the
 * ones that run, `flush` runs a pending call now, and `cancel` drops it.
 */
export interface Debounced<Args extends unknown[], Result> {
  (...args: Args): Result | undefined;
  cancel: () => void;
  flush: () => Result | undefined;
}

export function debounce<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  waitMs: number,
): Debounced<Args, Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Args | undefined;
  let result: Result | undefined;

  function run() {
    const args = pendingArgs;
    timer = undefined;
    pendingArgs = undefined;
    if (args) {
      result = fn(...args);
    }
    return result;
  }

  function debounced(...args: Args) {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(run, waitMs);
    return result;
  }

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
  };

  debounced.flush = () => {
    if (timer === undefined) return result;
    clearTimeout(timer);
    return run();
  };

  return debounced;
}
