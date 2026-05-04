/**
 * DefaultExtensionMounter - Concrete per-domain mount facade
 *
 * Composes `MountManager` (MFE load/mount/unmount primitives) and an
 * `ExtensionManager` reference (for mount-set bookkeeping) to implement the
 * per-domain `ExtensionMounter` contract.
 *
 * One instance is constructed by the registry per registered domain inside
 * `registerDomain` and exposed to the domain implementation via
 * `DomainContext.mounter`. The React `ExtensionDomainSlot` accesses this
 * instance via `registry.getMounter(domainId)`.
 *
 * @packageDocumentation
 * @internal
 */

import { ExtensionMounter } from './ExtensionMounter';
import type { MountManager } from './mount-manager';
import type { ContainerHooks } from './mount-strategy';

/**
 * @internal
 */
export class DefaultExtensionMounter extends ExtensionMounter {
  private attachedRoot: Element | null = null;

  // Tracks the per-extension containers so detach can remove them from root.
  private readonly containers = new Map<string, Element>();

  constructor(
    private readonly domainId: string,
    private readonly mountManager: MountManager,
    private readonly addMountedExtension: (domainId: string, extensionId: string) => void,
    private readonly removeMountedExtension: (domainId: string, extensionId: string) => void,
    private readonly getMountedExtensions: (domainId: string) => readonly string[],
    // hooks is used in detach() to destroy containers for each extension
    private readonly hooks: ContainerHooks
  ) {
    super();
  }

  attach(root: Element): void {
    this.attachedRoot = root;
  }

  async detach(): Promise<void> {
    // Mass-unmount every currently-mounted extension so the registry and
    // any framework slice stay consistent.
    const mounted = Array.from(this.getMountedExtensions(this.domainId));
    for (const extId of mounted) {
      await this.mountManager.unmountExtension(extId);
      this.hooks.destroy(extId);
      this.containers.delete(extId);
    }
    this.attachedRoot = null;
  }

  async mount(extensionId: string, container: Element): Promise<void> {
    if (!this.attachedRoot) {
      throw new Error(
        `ExtensionMounter.mount: no root attached for domain '${this.domainId}'. ` +
        'Call attach(element) before mounting extensions.'
      );
    }

    await this.mountManager.mountExtension(extensionId, container);

    // Append the container under the attached root and record it.
    this.attachedRoot.appendChild(container);
    this.containers.set(extensionId, container);

    this.addMountedExtension(this.domainId, extensionId);
  }

  async unmount(extensionId: string): Promise<void> {
    await this.mountManager.unmountExtension(extensionId);

    // Remove the container from the attached root if still present.
    const container = this.containers.get(extensionId);
    if (container && this.attachedRoot) {
      if (this.attachedRoot.contains(container)) {
        this.attachedRoot.removeChild(container);
      }
    }
    this.containers.delete(extensionId);

    this.removeMountedExtension(this.domainId, extensionId);
  }
}
