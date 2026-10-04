import { MountStrategy, type ActionPayload, type ContainerHooks } from './MountStrategy';
import type { ExtensionMounter } from './ExtensionMounter';
import type { MfeRegistry } from '../registry/MfeRegistry';
import { ExtensionReleaserProvider } from './ExtensionReleaserProvider';
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-slot-detach:p2

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

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-optional-displace
  async mount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-get-mounted
    const mounted = this.registry.getMountedExtensions(this.domainId);
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-get-mounted

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-optional-idempotent
    // The prologue's own at-turn evaluation
    // (`MountExtActionHandler.runMountAtTurn`, `inst-me-sole-occupant-at-turn`)
    // already settles a mount whose subject is still the domain's occupant
    // without ever calling into this method — this branch is reached only
    // for a fresh mount started as the running entry. The guard below is a
    // defensive no-op for a direct call on this strategy that bypasses the
    // prologue: it returns without displacement, container creation, or an
    // `activated` trigger.
    if (mounted.length === 1 && mounted[0] === subject) {
      return;
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-optional-idempotent

    if (mounted.length === 1 && mounted[0] !== subject) {
      const priorOccupant = mounted[0];
      // The container release registered at the prior occupant's mount time
      // is routed through the mounter's releaser rather than invoked here
      // directly, so a concurrent explicit `unmount_ext` of this same prior
      // occupant that coalesces onto the SAME physical unmount runs that
      // registered destroy exactly once between the two callers, never
      // twice.
      await ExtensionReleaserProvider.for(this.mounter).release(priorOccupant);
    }

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-optional-mount
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
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-optional-mount
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-optional-displace

  override async unmount(payload: ActionPayload): Promise<void> {
    const subject = payload.subject;
    const mounted = this.registry.getMountedExtensions(this.domainId);

    if (!mounted.includes(subject)) {
      return;
    }

    // The container release registered at mount time is routed through the
    // mounter's releaser rather than invoked here directly, so a concurrent
    // fresh mount of a different extension that displaces this same
    // subject, and coalesces onto the SAME physical unmount, runs that
    // registered destroy exactly once between the two callers, never twice.
    await ExtensionReleaserProvider.for(this.mounter).release(subject);
  }
}
