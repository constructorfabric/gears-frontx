// @cpt-FEATURE:cpt-frontx-feature-auth-plugin:p1
// @cpt-flow:cpt-frontx-flow-auth-plugin-rbac-guard:p1
import type { ReactElement } from 'react';
import type { AccessRecord } from '@cyberfabric/framework';
import { useCanAccess } from '../hooks/useCanAccess';
import type { CanAccessProps } from '../types';

/**
 * Declarative RBAC guard component.
 *
 * Pessimistic: renders `denied` (or `loading` if provided) until an explicit
 * 'allow' decision arrives from app.auth.canAccess. Only renders `allowed`
 * after a confirmed allow.
 *
 * Example:
 *   <CanAccess
 *     query={{ action: AppAction.InvoicesRead, resource: ResourceKind.Invoice }}
 *     allowed={<InvoiceList />}
 *     denied={<AccessDenied />}
 *     loading={<Spinner />}
 *   />
 */
export function CanAccess<TRecord extends AccessRecord = AccessRecord>({
  query,
  allowed,
  denied = null,
  loading,
}: CanAccessProps<TRecord>): ReactElement | null {
  // @cpt-begin:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-component-render
  const { allow, isResolving } = useCanAccess(query);

  if (isResolving) {
    return (loading !== undefined ? loading : denied) as ReactElement | null;
  }

  return (allow ? allowed : denied) as ReactElement | null;
  // @cpt-end:cpt-frontx-flow-auth-plugin-rbac-guard:p1:inst-component-render
}
