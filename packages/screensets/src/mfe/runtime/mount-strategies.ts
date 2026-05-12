/**
 * Mount Strategy Implementations
 *
 * Three shipped concrete strategy classes that domain authors compose inside
 * their `ExtensionDomainImplementationFactory.build(ctx)` implementation.
 *
 * Selection guide:
 * - `ConcurrentMountStrategy` — multiple extensions mount simultaneously (e.g., widgets)
 * - `OptionalMountStrategy` — zero-or-one mount with explicit unmount (sidebar, popup, overlay)
 * - `ExclusiveMountStrategy` — pre-emptive single-mount, no explicit unmount (screen domain)
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2
// @cpt-algo:cpt-frontx-algo-mfe-registry-concurrent-mount-strategy:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-optional-mount-strategy:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-mount-contracts:p1

import { MountStrategy, type ActionPayload, type ContainerHooks } from './mount-strategy';
import type { ExtensionMounter } from './ExtensionMounter';
import type { MfeRegistry } from './MfeRegistry';

/**
 * Append-mount semantics — multiple extensions may be mounted concurrently.
 *
 * Each mount appends a new container under the domain root. Each unmount
 * removes only the named extension. Suitable for widget-style domains where
 * multiple extensions coexist.
 *
 * Cardinality matrix: REQUIRES `mount_ext` AND `unmount_ext` in `declaration.actions`.
 */
export class ConcurrentMountStrategy extends MountStrategy {
  constructor(
    private readonly mounter: ExtensionMounter,
    private readonly hooks: ContainerHooks
  ) {
    super();
  }

  // @cpt-begin:cpt-frontx-algo-mfe-registry-concurrent-mount-strategy:p1:inst-mount
  async mount(payload: ActionPayload): Promise<void> {
    const extensionId = payload.subject;
    const container = this.hooks.create(extensionId);
    try {
      await this.mounter.mount(extensionId, container);
    } catch (error) {
      this.hooks.destroy(extensionId);
      throw error;
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-concurrent-mount-strategy:p1:inst-mount

  // @cpt-begin:cpt-frontx-algo-mfe-registry-concurrent-mount-strategy:p1:inst-unmount
  override async unmount(payload: ActionPayload): Promise<void> {
    const extensionId = payload.subject;
    await this.mounter.unmount(extensionId);
    this.hooks.destroy(extensionId);
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-concurrent-mount-strategy:p1:inst-unmount
}

/**
 * Zero-or-one mount with explicit unmount support.
 *
 * Mounting while another extension is already mounted displaces the prior
 * extension before mounting the new one. Explicit unmount empties the slot.
 * Suitable for sidebar, popup, overlay domains.
 *
 * Reads the canonical mount-set from the registry
 * (`registry.getMountedExtensions(domainId)`) — the registry owns mount-set
 * state, not the mounter.
 *
 * Cardinality matrix: REQUIRES `mount_ext` AND `unmount_ext` in `declaration.actions`.
 */
export class OptionalMountStrategy extends MountStrategy {
  constructor(
    private readonly mounter: ExtensionMounter,
    private readonly hooks: ContainerHooks,
    private readonly registry: MfeRegistry,
    private readonly domainId: string
  ) {
    super();
  }

  // @cpt-begin:cpt-frontx-algo-mfe-registry-optional-mount-strategy:p1:inst-mount
  async mount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    const mounted = this.registry.getMountedExtensions(this.domainId);

    if (mounted.length === 1 && mounted[0] !== subject) {
      await this.mounter.unmount(mounted[0]);
      this.hooks.destroy(mounted[0]);
    }

    if (mounted.includes(subject)) {
      return;
    }

    const container = this.hooks.create(subject);
    try {
      await this.mounter.mount(subject, container);
    } catch (error) {
      this.hooks.destroy(subject);
      throw error;
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-optional-mount-strategy:p1:inst-mount

  // @cpt-begin:cpt-frontx-algo-mfe-registry-optional-mount-strategy:p1:inst-unmount
  override async unmount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    const mounted = this.registry.getMountedExtensions(this.domainId);

    if (!mounted.includes(subject)) {
      return;
    }

    await this.mounter.unmount(subject);
    this.hooks.destroy(subject);
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-optional-mount-strategy:p1:inst-unmount
}

/**
 * Pre-emptive single-mount with no public unmount path.
 *
 * Mounting always evicts any other extension currently mounted in the domain
 * before mounting the new one. No `unmount` action is declared on the domain;
 * `ExclusiveMountStrategy` does NOT implement the optional `unmount` method.
 *
 * The strict cardinality matrix in
 * `cpt-frontx-algo-mfe-registry-cross-validate-handlers` rejects any
 * domain backed by this strategy that lists `unmount_ext` in
 * `declaration.actions`.
 *
 * Suitable for screen-domain-style use cases where exactly one extension is
 * ever active and navigation triggers a swap.
 *
 * Cardinality matrix: REQUIRES `mount_ext`, FORBIDS `unmount_ext` in `declaration.actions`.
 */
export class ExclusiveMountStrategy extends MountStrategy {
  // @cpt-begin:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-ctor
  constructor(
    private readonly mounter: ExtensionMounter,
    private readonly hooks: ContainerHooks,
    private readonly registry: MfeRegistry,
    private readonly domainId: string
  ) {
    super();
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-ctor

  // @cpt-begin:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-mount-idempotent
  async mount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    const mounted = this.registry.getMountedExtensions(this.domainId);

    if (mounted.length === 1 && mounted[0] === subject) {
      return;
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-mount-idempotent

    // @cpt-begin:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-mount-evict
    for (const siblingId of mounted) {
      if (siblingId !== subject) {
        await this.mounter.unmount(siblingId);
        this.hooks.destroy(siblingId);
      }
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-mount-evict

    // @cpt-begin:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-mount-create-try
    const container = this.hooks.create(subject);
    try {
      await this.mounter.mount(subject, container);
    } catch (error) {
      this.hooks.destroy(subject);
      throw error;
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-exclusive-mount-strategy:p1:inst-mount-create-try

  // ExclusiveMountStrategy intentionally does NOT implement the optional
  // `unmount` method declared on the MountStrategy base class. Eviction
  // happens only as a side effect of mounting a different extension.
}
