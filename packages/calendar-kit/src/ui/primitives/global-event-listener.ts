type GlobalEventHandler = (event: Event) => void;

interface GlobalEventBucket {
  readonly handlers: Set<GlobalEventHandler>;
  readonly dispatch: EventListener;
}

const bucketsByTarget = new WeakMap<
  EventTarget,
  Map<string, GlobalEventBucket>
>();

export const noopCleanup = (): void => undefined;

const bucketKey = (type: string, capture: boolean, passive: boolean): string =>
  `${type}:${capture ? "capture" : "bubble"}:${passive ? "passive" : "active"}`;

export const subscribeGlobalEvent = (
  target: EventTarget | null | undefined,
  type: string,
  handler: GlobalEventHandler,
  options: AddEventListenerOptions | boolean = false
): (() => void) => {
  if (!target) {
    return noopCleanup;
  }

  const capture =
    typeof options === "boolean" ? options : options.capture === true;

  const passive =
    typeof options === "boolean" ? false : options.passive === true;

  const key = bucketKey(type, capture, passive);
  let buckets = bucketsByTarget.get(target);

  if (buckets === undefined) {
    buckets = new Map();
    bucketsByTarget.set(target, buckets);
  }

  let bucket = buckets.get(key);

  if (bucket === undefined) {
    const handlers = new Set<GlobalEventHandler>();

    const dispatch: EventListener = (event) => {
      for (const currentHandler of handlers) {
        currentHandler(event);
      }
    };

    bucket = { dispatch, handlers };
    buckets.set(key, bucket);
    target.addEventListener(type, dispatch, { capture, passive });
  }

  const globalHandler = handler;
  bucket.handlers.add(globalHandler);

  return () => {
    const currentBuckets = bucketsByTarget.get(target);
    const currentBucket = currentBuckets?.get(key);

    if (currentBucket === undefined) {
      return;
    }

    currentBucket.handlers.delete(globalHandler);

    if (currentBucket.handlers.size === 0) {
      target.removeEventListener(type, currentBucket.dispatch, capture);
      currentBuckets?.delete(key);

      if (currentBuckets?.size === 0) {
        bucketsByTarget.delete(target);
      }
    }
  };
};
