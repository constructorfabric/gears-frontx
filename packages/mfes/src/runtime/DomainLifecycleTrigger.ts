/**
 * DomainLifecycleTrigger - Abstract per-domain lifecycle trigger facade
 *
 * Implementation-driven lifecycle transitions go through this facade.
 * One instance is constructed by the registry per registered domain and
 * exposed through `DomainContext.lifecycleTrigger`. The captured reference
 * (held privately on the implementation as a bound class field) survives
 * `DomainContext` invalidation because it is stored directly on the
 * implementation's field, not accessed through `ctx`.
 *
 * The public `triggerLifecycleStage`, `triggerDomainLifecycleStage`, and
 * `triggerDomainOwnLifecycleStage` methods have been removed from
 * `MfeRegistry` per `cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract`.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2

/**
 * Abstract per-domain lifecycle trigger facade.
 *
 * Provides three granular trigger methods:
 * - `triggerExtensionStage` — fires a stage for one named extension
 * - `triggerStage` — cascades a stage across all extensions in the domain
 * - `triggerOwnStage` — fires a stage on the domain entity itself (no cascade)
 *
 * Mount and unmount internally auto-fire their associated lifecycle stages;
 * domain implementations do NOT have to call the trigger for those.
 */
export abstract class DomainLifecycleTrigger {
  /**
   * Fire a lifecycle stage for the named extension only. Non-blocking
   * (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`): dispatches
   * the stage's matching hooks and returns without waiting for any of them
   * to settle. A domain author reaching this through
   * `DomainContext.lifecycleTrigger` therefore never receives anything
   * awaitable for chain execution: an invalid `extId` throws SYNCHRONOUSLY
   * rather than returning a rejected promise.
   *
   * @param extId - ID of the extension to trigger the stage on.
   * @param stageId - GTS lifecycle stage ID.
   * @throws {Error} synchronously if `extId` is not registered.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-non-awaitable
  abstract triggerExtensionStage(extId: string, stageId: string): void;
  // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-non-awaitable

  /**
   * Cascade the named stage across all extensions registered in the
   * domain. Non-blocking, per `triggerExtensionStage` above.
   *
   * @param stageId - GTS lifecycle stage ID.
   * @throws {Error} synchronously if this domain is not registered.
   */
  abstract triggerStage(stageId: string): void;

  /**
   * Fire the named stage on the domain entity itself — no cascade to
   * extensions. Non-blocking, per `triggerExtensionStage` above.
   *
   * @param stageId - GTS lifecycle stage ID.
   * @throws {Error} synchronously if this domain is not registered.
   */
  abstract triggerOwnStage(stageId: string): void;
}
