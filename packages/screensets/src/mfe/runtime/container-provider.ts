/**
 * Container Provider - Abstract DOM container management
 *
 * Abstract class defining the contract for domain container management.
 * Each extension domain has a ContainerProvider that supplies the DOM
 * container element for mounting extensions.
 *
 * @packageDocumentation
 */

/**
 * Abstract container provider -- contract for domain container management.
 *
 * Each extension domain has a ContainerProvider that supplies the DOM
 * container element for mounting extensions. This shifts container
 * management from the action caller to the domain, making mount_ext
 * payloads pure data (no DOM references).
 *
 * Concrete implementations:
 * - RefContainerProvider (@gears-frontx/react) wraps a React ref for React-rendered domains
 * - Custom domains can provide their own implementations
 *
 * Exported from @gears-frontx/screensets for consumer implementations.
 */
export abstract class ContainerProvider {
  /**
   * Get the DOM container element for the given extension.
   * Called by ExtensionLifecycleActionHandler during mount_ext handling.
   *
   * @param extensionId - ID of the extension being mounted
   * @returns The DOM Element to mount into
   * @throws Error if no container is available (e.g., React ref not yet attached)
   */
  abstract getContainer(extensionId: string): Element;

  /**
   * Release the DOM container for the given extension.
   * Called by ExtensionLifecycleActionHandler during unmount_ext handling
   * (after the MFE has been unmounted) and during swap operations.
   *
   * Implementations may clear the container, detach refs, or perform
   * other cleanup. This is a notification that the container is no longer
   * needed for this extension.
   *
   * NOTE: Implementations MAY be no-ops when container lifecycle is managed
   * externally (e.g., by React for ref-based containers). The method exists
   * to support implementations that need explicit cleanup (e.g., removing
   * dynamically created DOM elements).
   *
   * @param extensionId - ID of the extension being unmounted
   */
  abstract releaseContainer(extensionId: string): void;
}
