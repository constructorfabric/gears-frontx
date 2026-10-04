/**
 * Action Timeout Resolver
 *
 * The one shared per-action timeout rule the mediator and the domain's own
 * occupancy queue (each caller's timer) apply: the action's declared timeout,
 * otherwise the domain's `defaultActionTimeout`
 * (`cpt-frontx-algo-mfe-host-communication-mediator-dispatch`
 * `inst-resolve-timeout`;
 * `cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-queue-caller-timer`).
 *
 * @packageDocumentation
 * @internal
 */

/**
 * @internal
 */
export class ActionTimeoutResolver {
  /**
   * @param declaredTimeout - The action's declared timeout, if any.
   * @param domain - The target's domain, whose `defaultActionTimeout` applies
   *   when the action declares no timeout.
   * @param targetId - The target id, named in the error thrown when neither
   *   a declared timeout nor a domain exists.
   * @returns The timeout in milliseconds.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout
  resolve(
    declaredTimeout: number | undefined,
    domain: { defaultActionTimeout: number } | undefined,
    targetId: string
  ): number {
    if (declaredTimeout !== undefined) {
      return declaredTimeout;
    }
    if (domain) {
      return domain.defaultActionTimeout;
    }
    throw new Error('Cannot resolve timeout: no domain found for target "' + targetId + '"');
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout
}
