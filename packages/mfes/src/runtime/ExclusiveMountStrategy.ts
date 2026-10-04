import { MountStrategy, type ActionPayload, type ContainerHooks } from './MountStrategy';
import type { ExtensionMounter } from './ExtensionMounter';
import type { MfeRegistry } from '../registry/MfeRegistry';
import { ExtensionReleaserProvider } from './ExtensionReleaserProvider';
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-slot-detach:p2

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
  constructor(
    private readonly mounter: ExtensionMounter,
    private readonly hooks: ContainerHooks,
    private readonly registry: MfeRegistry,
    private readonly domainId: string
  ) {
    super();
  }

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-exclusive-evict
  async mount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-get-mounted
    const mounted = this.registry.getMountedExtensions(this.domainId);
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-get-mounted

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-exclusive-idempotent
    // The prologue's own at-turn evaluation
    // (`MountExtActionHandler.runMountAtTurn`, `inst-me-sole-occupant-at-turn`)
    // already settles a mount whose subject is still the domain's occupant
    // without ever calling into this method — this branch is reached only
    // for a fresh mount started as the running entry. The guard below is a
    // defensive no-op for a direct call on this strategy that bypasses the
    // prologue: it returns without eviction, container creation, or an
    // `activated` trigger.
    if (mounted.length === 1 && mounted[0] === subject) {
      return;
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-exclusive-idempotent

    for (const siblingId of mounted) {
      if (siblingId !== subject) {
        // The container release registered at the sibling's mount time is
        // routed through the mounter's releaser rather than invoked here
        // directly, so a concurrent unmount of this same sibling that
        // coalesces onto the SAME physical unmount runs that registered
        // destroy exactly once between the two callers, never twice.
        await ExtensionReleaserProvider.for(this.mounter).release(siblingId);
      }
    }

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-exclusive-mount
    const container = this.hooks.create(subject);
    try {
      await this.mounter.mount(subject, container);
    } catch (error) {
      this.hooks.destroy(subject);
      throw error;
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-destroy-container
    ExtensionReleaserProvider.for(this.mounter).registerDestroy(subject, () => this.hooks.destroy(subject));
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-destroy-container
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-exclusive-mount
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-exclusive-evict

  // ExclusiveMountStrategy intentionally does NOT implement the optional
  // `unmount` method declared on the MountStrategy base class. Eviction
  // happens only as a side effect of mounting a different extension.
}
