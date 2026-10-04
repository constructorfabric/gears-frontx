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
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-slot-detach:p2
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-default-deny:p1

import { MountStrategy, type ActionPayload, type ContainerHooks } from './MountStrategy';
import type { ExtensionMounter } from './ExtensionMounter';
import { ExtensionReleaserProvider } from './ExtensionReleaserProvider';

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

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-match-strategy
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-concurrent
  async mount(payload: ActionPayload): Promise<void> {
    const extensionId = payload.subject;
    const container = this.hooks.create(extensionId);
    try {
      await this.mounter.mount(extensionId, container);
    } catch (error) {
      this.hooks.destroy(extensionId);
      throw error;
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-destroy-container
    ExtensionReleaserProvider.for(this.mounter).registerDestroy(extensionId, () => this.hooks.destroy(extensionId));
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-destroy-container
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-return
    // (implicit return — mount completed)
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-return
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-concurrent
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-match-strategy

  override async unmount(payload: ActionPayload): Promise<void> {
    const extensionId = payload.subject;
    // The container release registered at mount time is routed through the
    // mounter's releaser rather than invoked here directly, so an
    // overlapping unmount of the SAME extension (another concurrent
    // `unmount_ext` dispatch) that coalesces onto the SAME physical unmount
    // runs that registered destroy exactly once between the two callers,
    // never twice.
    await ExtensionReleaserProvider.for(this.mounter).release(extensionId);
  }
}
