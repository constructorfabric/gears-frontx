/*
 * The grid's hook bus: sync, serial and parallel calls. Plugins depend on these semantics:
 *
 * - a handler list is copied when a hook is called, so a handler may unsubscribe itself (or
 *   register another) while the hook runs without changing this run;
 * - `callHook` starts handlers one after another, each only after the previous one settled;
 * - `callHookParallel` starts them all in one synchronous pass, so a handler that throws
 *   synchronously throws out of the call instead of rejecting its promise;
 * - every call resolves to the array of the handlers' return values, in registration order.
 */

type HookName<THooks> = keyof THooks & string;

type HookArgs<THooks, Name extends keyof THooks> = THooks[Name] extends (
  ...args: infer Args
) => unknown
  ? Args
  : never;

type HookReturn<THooks, Name extends keyof THooks> = THooks[Name] extends (
  ...args: never[]
) => infer Return
  ? Return
  : never;

export type HookFn<THooks, Name extends keyof THooks> = (
  ...args: HookArgs<THooks, Name>
) => HookReturn<THooks, Name> | Promise<HookReturn<THooks, Name>>;

export interface Hooked<THooks> {
  /** Registers a handler. Returns the function that removes it again. */
  hook: <Name extends HookName<THooks>>(name: Name, fn: HookFn<THooks, Name>) => () => void;
  /** Runs the handlers one after another, each after the previous one settled. */
  callHook: <Name extends HookName<THooks>>(
    name: Name,
    ...args: HookArgs<THooks, Name>
  ) => Promise<HookReturn<THooks, Name>[]>;
  /** Runs all the handlers at once. */
  callHookParallel: <Name extends HookName<THooks>>(
    name: Name,
    ...args: HookArgs<THooks, Name>
  ) => Promise<HookReturn<THooks, Name>[]>;
  /** Runs the handlers synchronously and returns their results. */
  callHookSync: <Name extends HookName<THooks>>(
    name: Name,
    ...args: HookArgs<THooks, Name>
  ) => HookReturn<THooks, Name>[];
}

type Handler = (...args: unknown[]) => unknown;

export function createHooked<THooks>(): Hooked<THooks> {
  const handlers = new Map<string, Handler[]>();

  return { hook, callHook, callHookParallel, callHookSync };

  function hook<Name extends HookName<THooks>>(name: Name, fn: HookFn<THooks, Name>) {
    if (!name || typeof fn !== 'function') {
      return () => {};
    }

    // The one cast of this module: the map has to hold handlers of every hook name, so their
    // parameter lists cannot stay typed. The public signatures above are what callers see.
    const handler = fn as Handler;
    const list = handlers.get(name) ?? [];
    list.push(handler);
    handlers.set(name, list);

    return () => {
      const current = handlers.get(name);
      if (!current) return;

      const index = current.indexOf(handler);
      if (index !== -1) current.splice(index, 1);
      if (current.length === 0) handlers.delete(name);
    };
  }

  function snapshot(name: string): Handler[] {
    return [...(handlers.get(name) ?? [])];
  }

  function callHook<Name extends HookName<THooks>>(name: Name, ...args: HookArgs<THooks, Name>) {
    const started = snapshot(name).reduce<Promise<unknown>[]>((chain, fn) => {
      const previous = chain[chain.length - 1] ?? Promise.resolve();
      return [...chain, previous.then(() => fn(...args))];
    }, []);

    return Promise.all(started) as Promise<HookReturn<THooks, Name>[]>;
  }

  function callHookParallel<Name extends HookName<THooks>>(
    name: Name,
    ...args: HookArgs<THooks, Name>
  ) {
    return Promise.all(snapshot(name).map((fn) => fn(...args))) as Promise<
      HookReturn<THooks, Name>[]
    >;
  }

  function callHookSync<Name extends HookName<THooks>>(
    name: Name,
    ...args: HookArgs<THooks, Name>
  ) {
    return snapshot(name).map((fn) => fn(...args)) as HookReturn<THooks, Name>[];
  }
}
