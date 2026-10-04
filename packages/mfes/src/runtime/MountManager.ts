/**
 * Mount Manager
 *
 * Abstract mount manager interface and callback type definitions.
 *
 * @packageDocumentation
 * @internal
 */

import type { ParentMfeBridge } from '../handler/ParentMfeBridge';

/**
 * The registry's own `executeActionsChain`, returning nothing awaitable.
 * Wired to the child bridge's public capability, never to internal transport
 * (`cpt-frontx-adr-mfe-runtime-public-surface`).
 */
export type ActionsChainDispatcher = (chain: import('../types').ActionsChain) => void;

/**
 * Non-blocking lifecycle-stage trigger: hands every hook bound to the stage
 * to `executeActionsChain` and returns without awaiting any of them
 * (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`).
 */
export type LifecycleTrigger = (extensionId: string, stageId: string) => void;

export abstract class MountManager {
  abstract loadExtension(extensionId: string): Promise<void>;
  abstract preloadExtension(extensionId: string): Promise<void>;
  abstract mountExtension(extensionId: string, container: Element): Promise<ParentMfeBridge>;
  abstract unmountExtension(extensionId: string): Promise<void>;
  /**
   * Permanently release an extension's retained bridge pair and inbound
   * link, on its permanent unregistration. Distinct from `unmountExtension`,
   * which deactivates the bridge but keeps it (and its routing) in place.
   */
  abstract releaseExtension(extensionId: string): void;
  abstract setTheme(cssVars: Record<string, string>): void;
}
