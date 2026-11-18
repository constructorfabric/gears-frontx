/**
 * A fetch whose responses a test delivers by URL, recording issue order.
 *
 * Every request stays pending until the test answers it, so a suite can
 * assert which requests are in flight together before any response
 * arrives.
 */
import { vi } from 'vitest';
import { jsResponse } from './fetch-router';

export interface ControlledFetch {
  /** Every requested URL, in issue order. */
  readonly issued: string[];
  /** How many times `url` was requested. */
  count(url: string): number;
  /** Answer every pending request for `url` with `body`. */
  ok(url: string, body: string): void;
  /** Answer every pending request for `url` with a non-success status. */
  fail(url: string): void;
}

/** Replace `fetch` with a controlled one; restore with `vi.restoreAllMocks`. */
export function controlledFetch(): ControlledFetch {
  const issued: string[] = [];
  const pending = new Map<string, Array<(response: Response) => void>>();
  vi.spyOn(globalThis, 'fetch').mockImplementation(((
    input: string | URL | Request,
  ) => {
    const url = String(input);
    issued.push(url);
    return new Promise<Response>((resolve) => {
      pending.set(url, [...(pending.get(url) ?? []), resolve]);
    });
  }) as typeof fetch);
  const waitingFor = (url: string): Array<(response: Response) => void> => {
    const waiting = pending.get(url);
    if (waiting === undefined) throw new Error(`${url} was not requested`);
    return waiting;
  };
  return {
    issued,
    count: (url) => issued.filter((u) => u === url).length,
    ok: (url, body) => {
      for (const resolve of waitingFor(url)) resolve(jsResponse(body));
    },
    fail: (url) => {
      for (const resolve of waitingFor(url)) resolve(jsResponse('missing', false));
    },
  };
}

const turn = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/** Wait until `condition` holds, failing naming `what` when it never does. */
export async function until(
  condition: () => boolean,
  what: string,
): Promise<void> {
  for (let i = 0; i < 3000; i += 1) {
    if (condition()) return;
    await turn();
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Wait until every URL in `urls` has been requested. */
export const issuedAll = (net: ControlledFetch, urls: string[]): Promise<void> =>
  until(() => urls.every((u) => net.issued.includes(u)), urls.join(', '));

/** Let pending macrotask-scheduled work run once. */
export const settleTurn = turn;
