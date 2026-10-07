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
 * - `unmount` is declared optional on the base class; every shipped strategy
 *   implements it:
 *   `ConcurrentMountStrategy` and `OptionalMountStrategy` release the
 *   subject; `ExclusiveMountStrategy` changes nothing and rejects. The strict
 *   cardinality matrix requires `mount_ext` and `unmount_ext` for every
 *   strategy.
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
   * Every shipped strategy implements this method; `ExclusiveMountStrategy`'s
   * changes nothing and rejects.
   *
   * @param payload - Action payload; `payload.subject` carries the extension ID.
   */
  unmount?(payload: ActionPayload): Promise<void>;
}
