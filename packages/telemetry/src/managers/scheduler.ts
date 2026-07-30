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
    timeoutId = setTimeout(cb, 5000);
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  }
}
