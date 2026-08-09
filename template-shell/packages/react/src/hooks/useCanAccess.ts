// @cpt-FEATURE:cpt-frontx-feature-auth-plugin:p1
// @cpt-flow:cpt-frontx-flow-auth-plugin-rbac-guard:p1
import { useEffect, useState } from 'react';
import type {
  AccessQuery,
  AccessRecord,
  AuthRuntime,
  FrontXApp,
} from '@gears-frontx/framework';
import { useFrontX } from '../FrontXContext';
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

type FrontXAuthAppContract = FrontXApp & {
  auth?: AuthRuntime;
};

function getAuthRuntime(app: FrontXApp): AuthRuntime | null {
  return (app as FrontXAuthAppContract).auth ?? null;
}

/**
 * The state a query starts in before any decision has been applied.
 * Without an auth runtime the guard is already at its final answer, so it must
 * not claim to be resolving — no decision will ever arrive to clear the flag.
 */
function pessimisticResult(auth: AuthRuntime | null): UseCanAccessResult {
  return { allow: false, isResolving: auth !== null };
}

/**
 * Declarative RBAC guard hook.
 *
 * Pessimistic: `allow` is false until an explicit 'allow' decision arrives.
 * Aborts the in-flight canAccess call on unmount and on query change.
 *
 * State machine:
 *   mount, auth runtime present -> Pending (allow=false, isResolving=true)
 *   mount, no auth runtime      -> Denied  (allow=false, isResolving=false)
 *   Pending -> 'allow'  -> Allowed (allow=true,  isResolving=false)
 *   Pending -> 'deny'   -> Denied  (allow=false, isResolving=false)
 *   Pending -> error    -> Denied  (allow=false, isResolving=false)
 *   Allowed -> query-change -> Pending  (re-pessimize)
 *   Denied  -> query-change -> Pending  (re-pessimize)
 *
 * An app without an auth runtime has no decision to wait for, so the hook lands
 * on Denied in the first render instead of reporting a resolving state that
 * nothing will ever end.
 */
export function useCanAccess<TRecord extends AccessRecord = AccessRecord>(
  query: AccessQuery<TRecord>,
): UseCanAccessResult {
  const app = useFrontX();
  const auth = getAuthRuntime(app);

  // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-stable-key
  const stableKey = accessQueryKey(query as AccessQuery);

  // Derived state: store the query value whose key matches `stableKey`. We
  // refresh it during render whenever `stableKey` changes (React derived-state
  // pattern) so the effect can depend on the stored value directly — its
  // referential identity tracks the access intent, not the parent render cycle.
  // The auth runtime is stored beside it because swapping the runtime under the
  // hook invalidates the standing decision exactly as a new query does.
  const [stableQuery, setStableQuery] = useState<AccessQuery>(() => query as AccessQuery);
  const [storedKey, setStoredKey] = useState(stableKey);
  const [storedAuth, setStoredAuth] = useState(auth);
  const [result, setResult] = useState<UseCanAccessResult>(() => pessimisticResult(auth));

  if (storedKey !== stableKey || storedAuth !== auth) {
    setStoredKey(stableKey);
    setStoredAuth(auth);
    setStableQuery(query as AccessQuery);
    setResult(pessimisticResult(auth));
  }
  // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-stable-key

  useEffect(() => {
    // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-pending-effect
    if (!auth) {
      return;
    }

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
  }, [auth, stableQuery]);

  return result;
}
