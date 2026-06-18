// @cpt-flow:cpt-hai3-flow-screenset-registry-execute-chain:p1
// @cpt-algo:cpt-hai3-algo-screenset-registry-domain-semantics:p1
/**
 * Extension Lifecycle Action Handler
 *
 * Action handler for the three extension lifecycle actions (load_ext, mount_ext, unmount_ext)
 * within a domain. Registered per-domain with the ActionsChainsMediator during domain registration.
 *
 * @packageDocumentation
 * @internal
 */

import type { ActionHandler } from '../mediator';
import type { ParentMfeBridge } from '../handler/types';
import type { ContainerProvider } from './container-provider';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../constants';
import { MfeError } from '../errors';

/**
 * Determines how the domain handles mount_ext actions.
 *
 * - 'swap': The domain unmounts the currently mounted extension before mounting the new one.
 *   Used by the screen domain (always has content, transitions are seamless).
 * - 'toggle': The domain mounts/unmounts extensions independently (no automatic unmounting).
 *   Used by sidebar, popup, and overlay domains.
 *
 * DomainSemantics is derived from the domain's `actions` array at handler construction time:
 * - If the domain's `actions` array does NOT include `FRONTX_ACTION_UNMOUNT_EXT` -> 'swap'
 *   (the domain cannot unmount, so mount must implicitly replace the current extension)
 * - If the domain's `actions` array includes `FRONTX_ACTION_UNMOUNT_EXT` -> 'toggle'
 *   (the domain supports explicit unmount, so mount does not implicitly replace)
 */
type DomainSemantics = 'swap' | 'toggle';

/**
 * Callbacks required by ExtensionLifecycleActionHandler.
 *
 * These callbacks are wired by DefaultScreensetsRegistry.registerDomain() to go
 * through OperationSerializer -> MountManager. The handler does NOT hold a
 * reference to ScreensetsRegistry -- it receives only the focused callbacks it
 * needs. This follows the same callback injection pattern used by all other
 * collaborators (ExtensionManager, LifecycleManager, DefaultMountManager).
 *
 * NOTE: The `mountExtension` callback accepts a `container: Element` parameter.
 * The handler obtains the container from `this.containerProvider.getContainer(extensionId)`
 * and passes it to the callback. The callback then routes through
 * OperationSerializer -> MountManager.mountExtension(id, container). This keeps
 * all ContainerProvider interaction in the handler (single ownership), while the
 * callback chain remains a simple pass-through for the resolved container.
 */
export interface ExtensionLifecycleCallbacks {
  /** Load an extension's bundle (OperationSerializer -> MountManager.loadExtension) */
  loadExtension: (extensionId: string) => Promise<void>;
  /** Mount an extension into a container (OperationSerializer -> MountManager.mountExtension) */
  mountExtension: (extensionId: string, container: Element) => Promise<ParentMfeBridge>;
  /** Unmount an extension (OperationSerializer -> MountManager.unmountExtension) */
  unmountExtension: (extensionId: string) => Promise<void>;
  /** Query the currently mounted extension in a domain (ExtensionManager) */
  getMountedExtension: (domainId: string) => string | undefined;
  /**
   * Serialize an operation on the domain ID queue via OperationSerializer.
   * Exposes OperationSerializer.serializeOperation under a per-domain key so
   * that the entire swap (unmount + mount) executes atomically on the domain
   * queue. No deadlock occurs because the domain queue key (e.g., "screen-domain-id")
   * is different from the extension entity queue keys (e.g., "extension-id") used
   * by unmountExtension/mountExtension — OperationSerializer serializes per key,
   * and different keys use independent queues.
   */
  serializeOnDomain: (domainId: string, operation: () => Promise<void>) => Promise<void>;
}

/**
 * Custom action handler callback type.
 * Invoked for non-lifecycle actions on the domain.
 */
export type CustomActionHandler = (actionTypeId: string, payload: Record<string, unknown> | undefined) => Promise<void>;

/**
 * Action handler for extension lifecycle actions within a domain.
 * Registered with the ActionsChainsMediator as the domain's action handler.
 *
 * This handler intercepts the three extension lifecycle actions
 * (load_ext, mount_ext, unmount_ext) and delegates to focused callbacks.
 * Non-lifecycle domain actions pass through as no-ops — the mediator
 * already validated action support against the domain's actions array.
 *
 * The handler receives focused callbacks instead of a ScreensetsRegistry
 * reference. This follows the same callback injection pattern used by
 * ExtensionManager, LifecycleManager, and DefaultMountManager.
 *
 * The handler is the SINGLE owner of all ContainerProvider interactions.
 * It calls getContainer() before mounting and releaseContainer() after unmounting.
 *
 * @internal
 */
export class ExtensionLifecycleActionHandler implements ActionHandler {
  constructor(
    private readonly domainId: string,
    private readonly callbacks: ExtensionLifecycleCallbacks,
    private readonly domainSemantics: DomainSemantics,
    private readonly containerProvider: ContainerProvider,
    private readonly customActionHandler?: CustomActionHandler
  ) {}

  // @cpt-begin:cpt-hai3-flow-screenset-registry-execute-chain:p1:inst-1
  async handleAction(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    switch (actionTypeId) {
      case FRONTX_ACTION_LOAD_EXT: {
        this.requirePayload(actionTypeId, payload);
        const extensionId = this.requireExtensionId(payload);
        await this.callbacks.loadExtension(extensionId);
        break;
      }

      case FRONTX_ACTION_MOUNT_EXT: {
        this.requirePayload(actionTypeId, payload);
        const extensionId = this.requireExtensionId(payload);
        if (this.domainSemantics === 'swap') {
          await this.handleScreenSwap(extensionId);
        } else {
          // Toggle semantics: get container and mount
          const container = this.containerProvider.getContainer(extensionId);
          await this.callbacks.mountExtension(extensionId, container);
        }
        break;
      }

      case FRONTX_ACTION_UNMOUNT_EXT: {
        this.requirePayload(actionTypeId, payload);
        const extensionId = this.requireExtensionId(payload);
        await this.callbacks.unmountExtension(extensionId);
        this.containerProvider.releaseContainer(extensionId);
        break;
      }

      default:
        // Non-lifecycle domain actions: delegate to custom handler if provided.
        // The mediator already validated that the domain supports this action type.
        if (this.customActionHandler) {
          await this.customActionHandler(actionTypeId, payload);
        }
        break;
    }
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-execute-chain:p1:inst-1

  private requirePayload(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): asserts payload is Record<string, unknown> {
    if (!payload) {
      throw new MfeError(
        `Extension lifecycle action '${actionTypeId}' requires a payload`,
        'LIFECYCLE_ACTION_MISSING_PAYLOAD'
      );
    }
  }

  private requireExtensionId(payload: Record<string, unknown>): string {
    const { extensionId } = payload;
    if (typeof extensionId !== 'string' || extensionId.length === 0) {
      throw new MfeError(
        'Action payload must contain a non-empty "extensionId" string',
        'LIFECYCLE_ACTION_INVALID_PAYLOAD'
      );
    }
    return extensionId;
  }

  // @cpt-begin:cpt-hai3-algo-screenset-registry-domain-semantics:p1:inst-1
  private async handleScreenSwap(newExtensionId: string): Promise<void> {
    await this.callbacks.serializeOnDomain(this.domainId, async () => {
      const currentExtId = this.callbacks.getMountedExtension(this.domainId);

      if (currentExtId === newExtensionId) {
        return;
      }

      if (currentExtId) {
        await this.callbacks.unmountExtension(currentExtId);
        this.containerProvider.releaseContainer(currentExtId);
      }

      const container = this.containerProvider.getContainer(newExtensionId);
      await this.callbacks.mountExtension(newExtensionId, container);
    });
  }
  // @cpt-end:cpt-hai3-algo-screenset-registry-domain-semantics:p1:inst-1
}
