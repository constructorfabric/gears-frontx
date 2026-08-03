const FLUSH_DELAY_MS = 5000;

export function createScheduler(cb: () => void) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return {
    exec,
    schedule,
    cancel,
  };

  function exec() {
    cancel();
    cb();
  }

  function schedule() {
    cancel();
    timeoutId = setTimeout(cb, FLUSH_DELAY_MS);
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  }
}
