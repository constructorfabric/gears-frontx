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

// Module-level constant so the no-auth-runtime denial keeps a stable identity
// across renders — consumers can put the hook result in dependency lists
// without re-firing every render.
const DENIED_NO_AUTH: UseCanAccessResult = { allow: false, isResolving: false };

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
  const app = useFrontX();

  // Resolved once per `app` change; read here (not just inside the effect) so both the
  // "no auth runtime" case and the "pending" reset below can be derived/adjusted at
  // render time instead of requiring a synchronous setState from the effect.
  const auth = getAuthRuntime(app);

  // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-stable-key
  const stableKey = accessQueryKey(query as AccessQuery);

  // Derived state: store the query value whose key matches `stableKey`. We
  // refresh it during render whenever `stableKey` changes (React derived-state
  // pattern) so the effect can depend on the stored value directly — its
  // referential identity tracks the access intent, not the parent render cycle.
  const [stableQuery, setStableQuery] = useState<AccessQuery>(() => query as AccessQuery);
  // Tracks the (auth, stableKey) combination the effect below was last run for —
  // exactly its dependency list — so every input that would restart the access check
  // also re-pessimizes `result` here, during render, instead of via a setState call
  // inside the effect.
  //
  // `app` is not part of it. The decision is the auth runtime's, and a host that
  // rebuilds its app object around the same runtime has changed nothing the check
  // reads; tracking it would re-pessimize an answered guard back to Pending and
  // ask the same question again.
  const [runState, setRunState] = useState({ auth, stableKey });
  const [result, setResult] = useState<UseCanAccessResult>({ allow: false, isResolving: true });

  if (runState.auth !== auth || runState.stableKey !== stableKey) {
    setRunState({ auth, stableKey });
    setStableQuery(query as AccessQuery);
    // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-pending-effect
    // Re-pessimize at render time: every (auth, stableKey) combination
    // the effect below runs for enters Pending here, before the async
    // decision starts.
    setResult({ allow: false, isResolving: true });
    // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-pending-effect
  }
  // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-stable-key

  useEffect(() => {
    if (!auth) {
      // No auth runtime on the app: the returned result is derived below
      // (`auth ? result : DENIED_NO_AUTH`), so there is nothing to synchronize here.
      return;
    }

    // `result` is re-pessimized during render (inst-pending-effect above) for
    // every (auth, stableKey) combination this effect runs for — no
    // setState needed here before starting the async decision.
    let alive = true;
    const controller = new AbortController();

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

  return auth ? result : DENIED_NO_AUTH;
}
