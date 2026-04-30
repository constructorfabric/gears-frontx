// @cpt-FEATURE:cpt-frontx-feature-auth-plugin:p1
// @cpt-flow:cpt-frontx-flow-auth-plugin-rbac-guard:p1
import { useEffect, useState } from 'react';
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
  // JSON-encode the tuple so delimiter characters in any component
  // (action / resource / record keys / string values) cannot collide.
  // Using Object.entries avoids dynamic bracket access on `record` (static
  // analyzers flag `record[k]` as a potential object-injection sink).
  const normalizedRecord = record
    ? Object.entries(record)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, serializeRecordValue(v)] as const)
    : null;
  return JSON.stringify([action, resource, normalizedRecord]);
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

  // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-stable-key
  const stableKey = accessQueryKey(query as AccessQuery);

  // Derived state: store the query value whose key matches `stableKey`. We
  // refresh it during render whenever `stableKey` changes (React derived-state
  // pattern) so the effect can depend on the stored value directly — its
  // referential identity tracks the access intent, not the parent render cycle.
  const [stableQuery, setStableQuery] = useState<AccessQuery>(() => query as AccessQuery);
  const [storedKey, setStoredKey] = useState(stableKey);
  const [result, setResult] = useState<UseCanAccessResult>({ allow: false, isResolving: true });

  if (storedKey !== stableKey) {
    setStoredKey(stableKey);
    setStableQuery(query as AccessQuery);
    setResult({ allow: false, isResolving: true });
  }
  // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-stable-key

  useEffect(() => {
    // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-pending-effect
    const auth = getAuthRuntime(app);
    if (!auth) {
      setResult({ allow: false, isResolving: false });
      return;
    }

    setResult({ allow: false, isResolving: true });

    let alive = true;
    const controller = new AbortController();
    // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-pending-effect

    // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-decision-apply
    void auth
      .canAccess(stableQuery, { signal: controller.signal })
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
    // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-decision-apply

    // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-abort
    return () => {
      alive = false;
      controller.abort();
    };
    // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-abort
  }, [app, stableQuery]);

  return result;
}
