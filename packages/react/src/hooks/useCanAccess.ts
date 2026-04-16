import { useEffect, useRef, useState } from 'react';
import type {
  AccessQuery,
  AccessRecord,
  AuthRuntime,
  HAI3App,
} from '@cyberfabric/framework';
import { useHAI3 } from '../HAI3Context';
import type { UseCanAccessResult } from '../types';

/**
 * Stable string key for an AccessQuery.
 * Record keys are sorted so { b:1, a:2 } and { a:2, b:1 } yield the same key.
 * Values include an explicit type prefix to avoid collisions:
 * 1 !== "1", null !== "null", true !== "true".
 */
function serializeRecordValue(value: AccessRecord[string]): string {
  if (value === null) return 'n:';
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number') {
    // Preserve -0 distinction for completeness.
    return `d:${Object.is(value, -0) ? '-0' : String(value)}`;
  }
  return value ? 'b:1' : 'b:0';
}

function accessQueryKey(query: AccessQuery): string {
  const { action, resource, record } = query;
  if (!record) return `${action}\x00${resource}`;
  const pairs = Object.keys(record)
    .sort()
    .map((k) => `${k}\x01${serializeRecordValue(record[k])}`)
    .join('\x02');
  return `${action}\x00${resource}\x00${pairs}`;
}

type HAI3AuthAppContract = HAI3App & {
  auth?: AuthRuntime;
};

function getAuthRuntime(app: HAI3App): AuthRuntime | null {
  return (app as HAI3AuthAppContract).auth ?? null;
}

/**
 * Declarative RBAC guard hook.
 *
 * Pessimistic: `allow` is false until an explicit 'allow' decision arrives.
 * Aborts the in-flight canAccess call on unmount and on query change.
 *
 * State machine:
 *   mount               -> Pending (allow=false, isResolving=true)
 *   Pending -> 'allow'  -> Allowed (allow=true,  isResolving=false)
 *   Pending -> 'deny'   -> Denied  (allow=false, isResolving=false)
 *   Pending -> error    -> Denied  (allow=false, isResolving=false)
 *   Allowed -> query-change -> Pending  (re-pessimize)
 *   Denied  -> query-change -> Pending  (re-pessimize)
 */
export function useCanAccess<TRecord extends AccessRecord = AccessRecord>(
  query: AccessQuery<TRecord>,
): UseCanAccessResult {
  const app = useHAI3();

  const stableKey = accessQueryKey(query as AccessQuery);

  // Always keep the latest query in a ref so the effect closure stays fresh.
  const queryRef = useRef<AccessQuery>(query as AccessQuery);
  queryRef.current = query as AccessQuery;

  // prevKey tracks the key from the previous render cycle.
  // Calling setPrevKey during render triggers an immediate synchronous re-render
  // so the Pending state is visible before the next commit (React derived-state pattern).
  const [prevKey, setPrevKey] = useState(stableKey);
  const [result, setResult] = useState<UseCanAccessResult>({ allow: false, isResolving: true });

  if (prevKey !== stableKey) {
    setPrevKey(stableKey);
    setResult({ allow: false, isResolving: true });
  }

  useEffect(() => {
    const auth = getAuthRuntime(app);
    if (!auth) {
      setResult({ allow: false, isResolving: false });
      return;
    }

    setResult({ allow: false, isResolving: true });

    let alive = true;
    const controller = new AbortController();

    void auth
      .canAccess(queryRef.current, { signal: controller.signal })
      .then((decision) => {
        if (alive) {
          setResult({ allow: decision === 'allow', isResolving: false });
        }
      })
      .catch(() => {
        if (alive) {
          setResult({ allow: false, isResolving: false });
        }
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [app, prevKey]);

  return result;
}
