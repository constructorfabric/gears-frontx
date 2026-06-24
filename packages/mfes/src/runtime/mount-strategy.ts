/**
 * MountStrategy - Abstract base class for domain mount semantics
 *
 * The abstract base for the three shipped concrete strategy classes.
 * Domain authors pick a strategy, instantiate it with the mounter and their
 * `ContainerHooks`, and register the resulting `ActionHandler` instances via
 * `ctx.registerHandler` inside their `ExtensionDomainImplementationFactory.build`.
 *
 * The strict cardinality matrix in
 * `cpt-frontx-algo-mfe-registry-cross-validate-handlers` is enforced by
 * the registry at `registerDomain` time — it uses `instanceof` to identify the
 * strategy class and then checks `declaration.actions` against the matrix row.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2
// @cpt-dod:cpt-frontx-dod-mfe-registry-mount-contracts:p1

// @cpt-begin:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-mount-strategy
/**
 * Minimal typed payload for mount/unmount actions.
 *
 * GTS schema validation guarantees `subject` is a string before any strategy
 * method is called. Additional fields are allowed per `[k: string]: unknown`.
 */
export type ActionPayload = { subject: string; [k: string]: unknown };

/**
 * Pure container factory supplied by the domain implementation.
 *
 * The mounter owns the attached root and appends/removes containers itself.
 * `ContainerHooks` is intentionally on the implementation side — container
 * shape (plain DOM element, shadow host, portal target, etc.) is
 * domain-specific and opaque to the framework.
 */
export interface ContainerHooks {
  /**
   * Materialize a fresh **unattached** host element for the named extension.
   * The mounter (which owns the attached root) appends it under the root.
   *
   * @param extensionId - ID of the extension to create a container for.
   * @returns An unattached DOM `Element`.
   */
  create(extensionId: string): Element;

  /**
   * Release the host element produced by the matching `create` call.
   * Invoked by strategies during unmount and on mount-failure cleanup.
   *
   * @param extensionId - ID of the extension whose container is being released.
   */
  destroy(extensionId: string): void;
}

/**
 * Abstract base class for domain mount strategies.
 *
 * - `mount` is abstract — every concrete strategy must implement it.
 * - `unmount` is optional (declared but not abstract). Concrete strategies
 *   MAY implement it. `ExclusiveMountStrategy` does NOT implement `unmount`;
 *   `ConcurrentMountStrategy` and `OptionalMountStrategy` do. The strict
 *   cardinality matrix enforces this at registration time.
 *
 * LSP note: the optional `unmount` declaration on the base class is the correct
 * TypeScript idiom for "some subtypes have this, some don't". Every subtype
 * satisfies the abstract surface (`mount` required). The matrix
 * (`cpt-frontx-algo-mfe-registry-cross-validate-handlers`) enforces the
 * semantic constraint at registration, not at the type level.
 */
export abstract class MountStrategy {
  /**
   * Mount the extension described in `payload`.
   *
   * @param payload - Action payload; `payload.subject` carries the extension ID.
   */
  abstract mount(payload: ActionPayload): Promise<void>;

  /**
   * Unmount the extension described in `payload`.
   *
   * Optional: `ExclusiveMountStrategy` does not define this method.
   * The registry enforces the omission at registration time via the strict
   * cardinality matrix.
   *
   * @param payload - Action payload; `payload.subject` carries the extension ID.
   */
  unmount?(payload: ActionPayload): Promise<void>;
}
// @cpt-end:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-mount-strategy
